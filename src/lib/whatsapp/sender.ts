import { prisma } from "@/lib/prisma";
import { getSocket } from "@/lib/whatsapp/registry";

export function isWhatsAppConnected() {
  return Boolean(getSocket());
}

export async function sendMessageViaSocket(messageId: string) {
  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    include: { contact: true },
  });
  if (!msg) throw new Error("Message not found");
  if (msg.channel !== "WHATSAPP") throw new Error("Not a WhatsApp message");
  if (msg.status !== "PENDING") return msg;

  const socket = getSocket();
  if (!socket) {
    throw new Error(
      "WhatsApp is not connected. Pair your phone in Settings, then try again.",
    );
  }
  if (!msg.contact.phone) throw new Error("Client has no phone number");

  const jid = `${msg.contact.phone.replace(/\D/g, "")}@s.whatsapp.net`;
  const sent = await socket.sendMessage(jid, { text: msg.body ?? "" });
  const keyId = sent?.key?.id ?? null;

  await prisma.message.update({
    where: { id: msg.id },
    data: { status: "SENT", metaMessageId: keyId, errorMessage: null },
  });

  if (msg.conversationId) {
    await prisma.conversation.update({
      where: { id: msg.conversationId },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: (msg.body ?? "").slice(0, 140),
      },
    });
  }

  await prisma.contact.update({
    where: { id: msg.contactId },
    data: { lastMessageAt: new Date() },
  });

  return msg;
}

export function renderTemplateBody(
  body: string | null | undefined,
  vars: Record<string, string>,
  bodyParams?: string[] | null,
) {
  let text = body ?? "";
  text = text.replace(/\{\{(\d+)\}\}/g, (_, n) => bodyParams?.[Number(n) - 1] ?? "");
  for (const [k, v] of Object.entries(vars)) {
    text = text.split(`{{${k}}}`).join(v ?? "");
  }
  return text;
}
