import fs from "node:fs/promises";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WAMessageStatus,
  type ConnectionState,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { prisma } from "@/lib/prisma";
import { getSocket, setSocket } from "@/lib/whatsapp/registry";
import { AUTH_DIR } from "@/lib/whatsapp/config";

const logger = pino({ level: process.env.WA_LOG_LEVEL || "silent" });

let starting = false;
let reconnectTimer: NodeJS.Timeout | null = null;

const lidToPn = new Map<string, string>();

async function rmAuthDir() {
  await fs.rm(AUTH_DIR, { recursive: true, force: true });
}

async function updateSession(data: {
  status?: string;
  qrCode?: string | null;
  phoneNumber?: string | null;
  lastConnectedAt?: Date | null;
}) {
  await prisma.whatsAppSession.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      status: data.status ?? "DISCONNECTED",
      qrCode: data.qrCode ?? null,
      phoneNumber: data.phoneNumber ?? null,
      lastConnectedAt: data.lastConnectedAt ?? null,
    },
    update: data,
  });
}

function clearIfCurrent(sock: WASocket) {
  if (getSocket() === sock) setSocket(null);
}

function jidToWaId(jid: string) {
  const num = jid.split("@")[0];
  if (jid.endsWith("@lid")) {
    return lidToPn.get(num) ?? num;
  }
  return num;
}

function messageText(msg: { message?: { conversation?: string; extendedTextMessage?: { text?: string } } | null }) {
  const content = msg.message ?? {};
  if (content.conversation) return content.conversation;
  if (content.extendedTextMessage?.text) return content.extendedTextMessage.text;
  return null;
}

function isMedia(msg: { message?: { imageMessage?: unknown; videoMessage?: unknown; audioMessage?: unknown; documentMessage?: unknown; stickerMessage?: unknown; locationMessage?: unknown; liveLocationMessage?: unknown; contactMessage?: unknown } | null }) {
  const content = msg.message ?? {};
  return Boolean(
    content.imageMessage ||
      content.videoMessage ||
      content.audioMessage ||
      content.documentMessage ||
      content.stickerMessage ||
      content.locationMessage ||
      content.liveLocationMessage ||
      content.contactMessage,
  );
}

async function handleInbound(sock: WASocket, messages: { key: { id?: string | null; remoteJid?: string | null; fromMe?: boolean | null }; pushName?: string | null; message?: unknown; messageStubType?: number | null }[]) {
  for (const msg of messages) {
    if (msg.key.fromMe) continue;
    if (msg.messageStubType != null) continue;
    const jid = msg.key.remoteJid;
    if (!jid || !msg.key.id) continue;
    if (jid.endsWith("@g.us") || jid.endsWith("@newsletter") || jid === "status@broadcast") continue;
    if (!jid.endsWith("@s.whatsapp.net") && !jid.endsWith("@lid")) continue;

    const existing = await prisma.message.findUnique({
      where: { metaMessageId: msg.key.id },
    });
    if (existing) continue;

    let body = messageText(msg as never) ?? null;
    if (!body && isMedia(msg as never)) {
      body = "[Media message]";
    }
    if (!body) continue;

    const waId = jidToWaId(jid);
    if (!/^\d+$/.test(waId)) continue;

    let contact = await prisma.contact.findUnique({ where: { phone: waId } });
    if (!contact) {
      contact = await prisma.contact.create({
        data: { phone: waId, name: msg.pushName || null },
      });
    } else if (!contact.name && msg.pushName) {
      contact = await prisma.contact.update({
        where: { id: contact.id },
        data: { name: msg.pushName },
      });
    }

    const now = new Date();
    const conv = await prisma.conversation.upsert({
      where: { contactId_channel: { contactId: contact.id, channel: "WHATSAPP" } },
      create: {
        contactId: contact.id,
        channel: "WHATSAPP",
        lastMessageAt: now,
        lastMessagePreview: body.slice(0, 140),
        unreadCount: 1,
        status: "OPEN",
      },
      update: {
        lastMessageAt: now,
        lastMessagePreview: body.slice(0, 140),
        unreadCount: { increment: 1 },
        status: "OPEN",
      },
    });

    await prisma.message
      .create({
        data: {
          conversationId: conv.id,
          contactId: contact.id,
          channel: "WHATSAPP",
          direction: "INBOUND",
          type: "text",
          body,
          metaMessageId: msg.key.id,
          status: "READ",
        },
      })
      .catch((err) => console.error("Failed to store inbound message:", err));
  }
}

function wireEvents(sock: WASocket) {
  sock.ev.on("connection.update", async (update: Partial<ConnectionState>) => {
    console.log("[wa] connection.update", JSON.stringify({
      connection: update.connection,
      hasQr: !!update.qr,
      statusCode: (update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode,
    }));
    const { connection, lastDisconnect, qr, isNewLogin } = update;

    if (qr) {
      await updateSession({ status: "SCANNING", qrCode: qr, phoneNumber: null });
    }

    if (connection === "connecting") {
      await updateSession({ status: "CONNECTING", qrCode: null });
    }

    if (connection === "open") {
      const me = sock.user;
      const phoneNumber = me?.id
        ? me.id.replace(/:.*/, "").split("@")[0] || null
        : null;
      await updateSession({
        status: "CONNECTED",
        qrCode: null,
        phoneNumber,
        lastConnectedAt: new Date(),
      });
      if (isNewLogin) {
        console.log("WhatsApp connected as " + phoneNumber);
      }
    }

    if (connection === "close") {
      clearIfCurrent(sock);
      const statusCode = (
        lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
      )?.output?.statusCode;
      const loggedOut =
        statusCode === DisconnectReason.loggedOut ||
        statusCode === DisconnectReason.badSession;

      if (loggedOut) {
        await rmAuthDir();
        await updateSession({
          status: "DISCONNECTED",
          qrCode: null,
          phoneNumber: null,
        });
        console.log("WhatsApp session logged out. Restarting for a fresh QR…");
      } else {
        await updateSession({ status: "CONNECTING", qrCode: null });
        console.log(
          "WhatsApp connection closed (code " + (statusCode ?? "?") + "). Reconnecting…",
        );
      }

      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => void start(), 5000);
    }
  });

  sock.ev.on("contacts.upsert", (contacts) => {
    for (const c of contacts) {
      if (c.lid && c.phoneNumber) lidToPn.set(c.lid, c.phoneNumber);
    }
  });

  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify") return;
    void handleInbound(sock, messages as never);
  });

  sock.ev.on("messages.update", (updates) => {
    for (const { key, update } of updates) {
      if (!key.id || !key.fromMe) continue;
      const status =
        update.status === WAMessageStatus.DELIVERY_ACK
          ? "DELIVERED"
          : update.status === WAMessageStatus.READ
            ? "READ"
            : null;
      if (!status) continue;
      void prisma.message
        .updateMany({ where: { metaMessageId: key.id }, data: { status } })
        .catch((err) => console.error("Failed to update message status:", err));
    }
  });
}

export async function start() {
  if (starting) return;
  starting = true;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const sock = makeWASocket({
      auth: state,
      logger,
      printQRInTerminal: true,
      browser: ["Dispatch", "Chrome", "22.0.0"],
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
    });

    sock.ev.on("creds.update", saveCreds);
    wireEvents(sock);
    setSocket(sock);
  } catch (err) {
    console.error("Failed to start WhatsApp session:", err);
  } finally {
    starting = false;
  }
}

export function scheduleRestart() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => void start(), 1000);
}

export async function logoutSession() {
  const sock = getSocket();
  if (sock) {
    try {
      await sock.logout();
    } catch {
      // fall through to cleanup
    }
  }
  await rmAuthDir();
  await updateSession({
    status: "DISCONNECTED",
    qrCode: null,
    phoneNumber: null,
  });
  scheduleRestart();
}
