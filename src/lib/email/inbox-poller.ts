import { prisma } from "@/lib/prisma";
import {
  isBounceNotification,
  resolveMailboxImapConfigs,
  type MailboxImapConfig,
} from "./imap-config";
import {
  parseBouncedRecipientFromBody,
  recordBounce,
} from "./bounce-handler";

const INITIAL_BACKFILL_COUNT = 80;
const idleLoops = new Map<string, boolean>();

type ParsedMail = {
  subject?: string;
  text?: string;
  html?: string | false;
  from?: { value?: Array<{ address?: string; name?: string }> };
  to?: { value?: Array<{ address?: string }> };
  messageId?: string;
  inReplyTo?: string | string[];
  references?: string | string[];
  date?: Date;
};

function normalizeMessageId(value: unknown): string | null {
  if (!value) return null;
  const raw = Array.isArray(value) ? String(value[0] ?? "") : String(value);
  return raw.replace(/^<|>$/g, "").trim() || null;
}

/** mailparser may return references as a string OR string[]. */
function normalizeReferences(refs: unknown): string[] {
  if (!refs) return [];
  const list = Array.isArray(refs) ? refs : [refs];
  return list
    .flatMap((r) => String(r).split(/\s+/))
    .map((r) => normalizeMessageId(r))
    .filter(Boolean) as string[];
}

async function matchOutboundMessage(
  inReplyTo: string | null,
  references: string[],
): Promise<string | null> {
  const candidates = [inReplyTo, ...references].filter(Boolean) as string[];
  if (candidates.length === 0) return null;

  for (const id of candidates) {
    const msg = await prisma.message.findFirst({
      where: {
        OR: [
          { metaMessageId: id },
          { metaMessageId: `<${id}>` },
          { id },
        ],
      },
      select: { id: true },
    });
    if (msg) return msg.id;
  }
  return null;
}

async function upsertInboundFromParsed(
  config: MailboxImapConfig,
  uid: number,
  parsed: ParsedMail,
): Promise<boolean> {
  const bodyText = parsed.text || "";
  const bodyHtml =
    typeof parsed.html === "string"
      ? parsed.html
      : parsed.html
        ? String(parsed.html)
        : "";
  const body = `${bodyText}\n${bodyHtml}`;
  const subject = parsed.subject || "(No subject)";
  const isBounce = isBounceNotification(subject, body);

  if (isBounce) {
    const bouncedEmail = parseBouncedRecipientFromBody(body);
    if (bouncedEmail) {
      await recordBounce({
        email: bouncedEmail,
        reason: "HARD_BOUNCE",
        inboxId: config.accountId,
        raw: body.slice(0, 4000),
      });
    }
    return false;
  }

  const fromEmail =
    parsed.from?.value?.[0]?.address?.toLowerCase().trim() ||
    "unknown@unknown";
  const fromName = parsed.from?.value?.[0]?.name || null;
  const toEmail =
    parsed.to?.value?.[0]?.address?.toLowerCase().trim() ||
    config.fromEmail.toLowerCase();
  const messageId = normalizeMessageId(parsed.messageId);
  const inReplyTo = normalizeMessageId(parsed.inReplyTo);
  const references = normalizeReferences(parsed.references);

  const contact = await prisma.contact.findFirst({
    where: { email: { equals: fromEmail, mode: "insensitive" } },
    select: { id: true },
  });

  const relatedOutboundId = await matchOutboundMessage(inReplyTo, references);
  const receivedAt = parsed.date || new Date();

  try {
    await prisma.inboundEmail.upsert({
      where: {
        inboxId_imapUid: {
          inboxId: config.accountId,
          imapUid: uid,
        },
      },
      create: {
        inboxId: config.accountId,
        imapUid: uid,
        messageId,
        fromEmail,
        fromName,
        toEmail,
        subject,
        bodyText: bodyText.slice(0, 50000) || null,
        bodyHtml: bodyHtml.slice(0, 100000) || null,
        isBounce: false,
        inReplyTo,
        relatedOutboundId,
        contactId: contact?.id,
        receivedAt,
      },
      update: {},
    });
  } catch (e) {
    // Concurrent sync / IDLE race on unique (inboxId, imapUid)
    const code =
      e && typeof e === "object" && "code" in e
        ? String((e as { code: unknown }).code)
        : "";
    if (code === "P2002") return false;
    throw e;
  }

  return true;
}

type ImapClient = {
  status: (
    path: string,
    query: { uidNext?: boolean },
  ) => Promise<{ uidNext?: number }>;
  fetch: (
    range: string,
    query: { uid?: boolean; source?: boolean },
  ) => AsyncIterable<{ uid?: number; source?: Buffer }>;
};

async function fetchAndStoreNewMessages(
  client: ImapClient,
  config: MailboxImapConfig,
): Promise<number> {
  const { simpleParser } = await import("mailparser");

  const account = await prisma.emailAccount.findUnique({
    where: { id: config.accountId },
    select: { lastInboxPollUid: true },
  });
  if (!account) return 0;

  let lastUid = account.lastInboxPollUid || 0;
  let newCount = 0;

  const status = await client.status("INBOX", { uidNext: true });
  const uidNext = status.uidNext || 1;

  let searchFrom: number;
  if (lastUid > 0) {
    searchFrom = lastUid + 1;
  } else {
    searchFrom = Math.max(1, uidNext - INITIAL_BACKFILL_COUNT);
  }

  // Avoid ImapFlow "Command failed" on empty UID ranges
  if (searchFrom >= uidNext) {
    await prisma.emailAccount.update({
      where: { id: config.accountId },
      data: {
        lastInboxSyncAt: new Date(),
        inboxSyncError: null,
      },
    });
    return 0;
  }

  for await (const msg of client.fetch(`${searchFrom}:*`, {
    uid: true,
    source: true,
  })) {
    if (!msg.uid || !msg.source) continue;
    lastUid = Math.max(lastUid, msg.uid);

    try {
      const parsed = (await simpleParser(msg.source)) as ParsedMail;
      const stored = await upsertInboundFromParsed(config, msg.uid, parsed);
      if (stored) newCount += 1;
    } catch (e) {
      const msgText = e instanceof Error ? e.message : String(e);
      console.warn(
        `Inbox parse/store failed for ${config.fromEmail} uid=${msg.uid}:`,
        msgText,
      );
      // Advance UID cursor so one bad message doesn't block the mailbox forever
    }
  }

  await prisma.emailAccount.update({
    where: { id: config.accountId },
    data: {
      lastInboxPollUid: lastUid,
      lastInboxSyncAt: new Date(),
      inboxSyncError: null,
    },
  });

  return newCount;
}

export async function syncInboxMailbox(
  config: MailboxImapConfig,
): Promise<number> {
  const { ImapFlow } = await import("imapflow");

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    logger: false,
    connectionTimeout: 20000,
    greetingTimeout: 15000,
  });

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");

  try {
    return await fetchAndStoreNewMessages(client, config);
  } finally {
    lock.release();
    await client.logout().catch(() => undefined);
  }
}

export async function syncAllInboxesOnce(): Promise<number> {
  const configs = await resolveMailboxImapConfigs();
  let total = 0;

  for (const config of configs) {
    if (config.accountId === "env-bounce") continue;
    try {
      const n = await syncInboxMailbox(config);
      total += n;
      if (n > 0) {
        console.log(`Inbox sync: ${n} new on ${config.fromEmail}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`Inbox sync skipped for ${config.fromEmail}:`, msg);
      await prisma.emailAccount
        .update({
          where: { id: config.accountId },
          data: { inboxSyncError: msg.slice(0, 500) },
        })
        .catch(() => undefined);
    }
  }

  if (total > 0) {
    console.log(`Inbox sync: ${total} new message(s) across mailboxes`);
  }
  return total;
}

/** Keep an IMAP IDLE connection per mailbox for near-instant delivery. */
export async function startInboxIdleWatcher(
  config: MailboxImapConfig,
): Promise<void> {
  if (config.accountId === "env-bounce") return;
  if (idleLoops.get(config.accountId)) return;
  idleLoops.set(config.accountId, true);

  void (async () => {
    while (idleLoops.get(config.accountId)) {
      try {
        const { ImapFlow } = await import("imapflow");
        const client = new ImapFlow({
          host: config.host,
          port: config.port,
          secure: config.secure,
          auth: { user: config.user, pass: config.pass },
          logger: false,
          connectionTimeout: 20000,
          greetingTimeout: 15000,
        });

        await client.connect();
        const lock = await client.getMailboxLock("INBOX");

        try {
          const initial = await fetchAndStoreNewMessages(client, config);
          if (initial > 0) {
            console.log(
              `Inbox sync: ${initial} message(s) on ${config.fromEmail}`,
            );
          }

          while (idleLoops.get(config.accountId)) {
            await client.idle();
            const n = await fetchAndStoreNewMessages(client, config);
            if (n > 0) {
              console.log(
                `Inbox IDLE: ${n} new message(s) on ${config.fromEmail}`,
              );
            }
          }
        } finally {
          lock.release();
        }

        await client.logout().catch(() => undefined);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`Inbox IDLE reconnect for ${config.fromEmail}:`, msg);
        await prisma.emailAccount
          .update({
            where: { id: config.accountId },
            data: { inboxSyncError: msg.slice(0, 500) },
          })
          .catch(() => undefined);
        await new Promise((r) => setTimeout(r, 30_000));
      }
    }
  })();
}

export async function startAllInboxIdleWatchers(): Promise<void> {
  const configs = await resolveMailboxImapConfigs();
  for (const config of configs) {
    void startInboxIdleWatcher(config);
  }
}
