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

const INITIAL_BACKFILL_COUNT = 200;
/** When user asks to load older mail, re-scan this many UIDs from the top. */
const DEEP_BACKFILL_COUNT = 500;
const idleLoops = new Map<string, boolean>();
/** Prevent IDLE + fallback poll from syncing the same mailbox at once. */
const syncLocks = new Map<string, Promise<number>>();

export type InboxSyncOptions = {
  /** Re-fetch a wide UID window so older thread messages are imported. */
  deep?: boolean;
};

type ParsedMail = {
  subject?: string;
  text?: string;
  html?: string | false;
  from?: { value?: Array<{ address?: string; name?: string }> };
  to?: { value?: Array<{ address?: string }> };
  messageId?: string;
  inReplyTo?: string | string[];
  references?: unknown;
  date?: Date;
};

function normalizeMessageId(value: unknown): string | null {
  if (!value) return null;
  const raw = Array.isArray(value) ? String(value[0] ?? "") : String(value);
  return raw.replace(/^<|>$/g, "").trim() || null;
}

/**
 * mailparser returns `references` as string | string[] | undefined.
 * Never call `.map` on it directly — a bare string has no .map.
 */
function normalizeReferences(refs: unknown): string[] {
  if (refs == null) return [];
  if (Array.isArray(refs)) {
    return refs
      .flatMap((r) => String(r).split(/\s+/))
      .map((r) => normalizeMessageId(r))
      .filter(Boolean) as string[];
  }
  if (typeof refs === "string") {
    return refs
      .split(/\s+/)
      .map((r) => normalizeMessageId(r))
      .filter(Boolean) as string[];
  }
  // Unexpected shape (object, number, etc.)
  return [];
}

function isUniqueConstraintError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { code?: string; message?: string };
  if (err.code === "P2002") return true;
  const msg = String(err.message || e);
  return (
    msg.includes("Unique constraint failed") &&
    (msg.includes("imapUid") || msg.includes("inboxId") || msg.includes("InboundEmail"))
  );
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

async function storeInboundFromParsed(
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

  if (isBounceNotification(subject, body)) {
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

  const existing = await prisma.inboundEmail.findUnique({
    where: {
      inboxId_imapUid: {
        inboxId: config.accountId,
        imapUid: uid,
      },
    },
    select: { id: true },
  });
  if (existing) return false;

  try {
    await prisma.inboundEmail.create({
      data: {
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
    });
    return true;
  } catch (e) {
    if (isUniqueConstraintError(e)) return false;
    throw e;
  }
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
  mailbox?: { exists?: number; uidNext?: number } | false;
};

async function fetchAndStoreNewMessages(
  client: ImapClient,
  config: MailboxImapConfig,
  options: InboxSyncOptions = {},
): Promise<number> {
  const { simpleParser } = await import("mailparser");

  const account = await prisma.emailAccount.findUnique({
    where: { id: config.accountId },
    select: { lastInboxPollUid: true },
  });
  if (!account) return 0;

  let lastUid = account.lastInboxPollUid || 0;
  let newCount = 0;

  let uidNext = 1;
  try {
    const status = await client.status("INBOX", { uidNext: true });
    uidNext = status.uidNext || 1;
  } catch {
    // Fall back to mailbox lock metadata if STATUS fails
    if (client.mailbox && typeof client.mailbox === "object") {
      uidNext = client.mailbox.uidNext || 1;
    }
  }

  let searchFrom: number;
  if (options.deep) {
    // Re-scan a wide window so older messages in a thread get imported.
    // Existing (inboxId, imapUid) rows are skipped safely.
    searchFrom = Math.max(1, uidNext - DEEP_BACKFILL_COUNT);
  } else if (lastUid > 0) {
    searchFrom = lastUid + 1;
  } else {
    searchFrom = Math.max(1, uidNext - INITIAL_BACKFILL_COUNT);
  }

  // Empty range → ImapFlow throws "Command failed"
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

  try {
    for await (const msg of client.fetch(`${searchFrom}:${uidNext - 1}`, {
      uid: true,
      source: true,
    })) {
      if (!msg.uid || !msg.source) continue;
      lastUid = Math.max(lastUid, msg.uid);

      try {
        const parsed = (await simpleParser(msg.source)) as ParsedMail;
        const stored = await storeInboundFromParsed(config, msg.uid, parsed);
        if (stored) newCount += 1;
      } catch (e) {
        const msgText = e instanceof Error ? e.message : String(e);
        // Never let one bad MIME message kill the whole mailbox sync
        console.warn(
          `Inbox parse/store failed for ${config.fromEmail} uid=${msg.uid}:`,
          msgText.slice(0, 200),
        );
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Common when UIDs were expunged mid-fetch — advance cursor and continue
    if (/command failed/i.test(msg) || /uid/i.test(msg)) {
      console.warn(
        `Inbox fetch range failed for ${config.fromEmail} (${searchFrom}:${uidNext - 1}):`,
        msg.slice(0, 200),
      );
      lastUid = Math.max(lastUid, uidNext - 1);
    } else {
      throw e;
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

async function withMailboxLock(
  accountId: string,
  fn: () => Promise<number>,
): Promise<number> {
  const prev = syncLocks.get(accountId) || Promise.resolve(0);
  let release!: (n: number) => void;
  const gate = new Promise<number>((resolve) => {
    release = resolve;
  });
  syncLocks.set(accountId, gate);

  try {
    await prev.catch(() => 0);
    const result = await fn();
    release(result);
    return result;
  } catch (e) {
    release(0);
    throw e;
  } finally {
    if (syncLocks.get(accountId) === gate) {
      syncLocks.delete(accountId);
    }
  }
}

export async function syncInboxMailbox(
  config: MailboxImapConfig,
  options: InboxSyncOptions = {},
): Promise<number> {
  return withMailboxLock(config.accountId, async () => {
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
      return await fetchAndStoreNewMessages(client, config, options);
    } finally {
      lock.release();
      await client.logout().catch(() => undefined);
    }
  });
}

export async function syncAllInboxesOnce(
  options: InboxSyncOptions = {},
): Promise<number> {
  const configs = await resolveMailboxImapConfigs();
  let total = 0;

  for (const config of configs) {
    if (config.accountId === "env-bounce") continue;
    try {
      const n = await syncInboxMailbox(config, options);
      total += n;
      if (n > 0) {
        console.log(
          `Inbox sync${options.deep ? " (deep)" : ""}: ${n} new on ${config.fromEmail}`,
        );
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
          const initial = await withMailboxLock(config.accountId, () =>
            fetchAndStoreNewMessages(client, config),
          );
          if (initial > 0) {
            console.log(
              `Inbox sync: ${initial} message(s) on ${config.fromEmail}`,
            );
          }

          while (idleLoops.get(config.accountId)) {
            await client.idle();
            const n = await withMailboxLock(config.accountId, () =>
              fetchAndStoreNewMessages(client, config),
            );
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
