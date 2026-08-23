import {
  isBounceNotification,
  resolveMailboxImapConfigs,
  type MailboxImapConfig,
} from "./imap-config";
import {
  parseBouncedRecipientFromBody,
  recordBounce,
} from "./bounce-handler";

/** Last seen IMAP UID per mailbox for bounce-only polling (in-memory). */
const lastBounceUidByAccount = new Map<string, number>();

async function pollBouncesOnMailbox(config: MailboxImapConfig): Promise<number> {
  const { ImapFlow } = await import("imapflow");
  const { simpleParser } = await import("mailparser");

  let processed = 0;
  let lastPollUid = lastBounceUidByAccount.get(config.accountId) || 0;

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    logger: false,
    connectionTimeout: 15000,
  });

  await client.connect();
  const lock = await client.getMailboxLock("INBOX");

  try {
    const searchFrom = lastPollUid > 0 ? lastPollUid + 1 : 1;
    for await (const msg of client.fetch(`${searchFrom}:*`, {
      uid: true,
      source: true,
    })) {
      if (!msg.source) continue;
      const parsed = await simpleParser(msg.source);
      const body = `${parsed.text || ""}\n${parsed.html || ""}`;
      const subject = parsed.subject || "";

      if (msg.uid) lastPollUid = Math.max(lastPollUid, msg.uid);

      if (!isBounceNotification(subject, body)) continue;

      const email = parseBouncedRecipientFromBody(body);
      if (email) {
        await recordBounce({
          email,
          reason: "HARD_BOUNCE",
          inboxId: config.accountId === "env-bounce" ? null : config.accountId,
          raw: body.slice(0, 4000),
        });
        processed += 1;
      }
    }
  } finally {
    lock.release();
  }

  await client.logout();
  lastBounceUidByAccount.set(config.accountId, lastPollUid);
  return processed;
}

/**
 * Poll sending mailboxes for DSN bounce notifications.
 * Inbound replies are handled by inbox-poller.ts (IMAP IDLE).
 */
export async function pollBounceMailboxOnce(): Promise<number> {
  const configs = await resolveMailboxImapConfigs();
  if (configs.length === 0) return 0;

  let total = 0;
  for (const config of configs) {
    try {
      const n = await pollBouncesOnMailbox(config);
      total += n;
    } catch (e) {
      console.warn(
        `Bounce IMAP poll skipped for ${config.user}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  if (total > 0) {
    console.log(`Bounce poller: processed ${total} bounce(s) across mailboxes`);
  }
  return total;
}
