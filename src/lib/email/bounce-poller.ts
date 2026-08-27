import {
  isBounceNotification,
  resolveMailboxImapConfigs,
  type MailboxImapConfig,
} from "./imap-config";
import {
  parseBouncedRecipientFromBody,
  recordBounce,
} from "./bounce-handler";
import { withImapSlot } from "./imap-semaphore";

/** Last seen IMAP UID per mailbox for bounce-only polling (in-memory). */
const lastBounceUidByAccount = new Map<string, number>();

function imapErrorMessage(e: unknown): string {
  if (!e || typeof e !== "object") return String(e);
  const err = e as {
    message?: string;
    responseText?: string;
    response?: string;
    code?: string;
  };
  const parts = [
    err.message,
    err.responseText,
    typeof err.response === "string" ? err.response : null,
    err.code,
  ].filter(Boolean);
  return [...new Set(parts)].join(" — ").slice(0, 500) || "Unknown IMAP error";
}

async function pollBouncesOnMailbox(config: MailboxImapConfig): Promise<number> {
  return withImapSlot(config.host, async () => {
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
      greetingTimeout: 15000,
    });

    client.on("error", (err: Error) => {
      console.warn(
        `Bounce IMAP socket (${config.fromEmail}):`,
        imapErrorMessage(err),
      );
    });

    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      // Use selected mailbox metadata — never STATUS while INBOX is open
      // (causes "Command failed" on many cPanel/Dovecot hosts).
      const uidNext =
        client.mailbox && typeof client.mailbox === "object"
          ? client.mailbox.uidNext || 1
          : 1;
      const searchFrom =
        lastPollUid > 0 ? lastPollUid + 1 : Math.max(1, uidNext - 100);
      if (searchFrom >= uidNext) {
        lastBounceUidByAccount.set(config.accountId, lastPollUid);
        return 0;
      }

      let uids: number[] = [];
      try {
        const found = await client.search(
          { uid: `${searchFrom}:${uidNext - 1}` },
          { uid: true },
        );
        if (Array.isArray(found)) uids = found;
      } catch {
        // Fall through to open-ended fetch
      }

      const range: string | number[] =
        uids.length > 0 ? uids : `${searchFrom}:*`;

      for await (const msg of client.fetch(range, {
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

    await client.logout().catch(() => undefined);
    lastBounceUidByAccount.set(config.accountId, lastPollUid);
    return processed;
  });
}

/**
 * Dedicated bounce IMAP poll — off by default.
 * Inbox sync already records DSN bounces; a second pass doubles connections
 * and trips cPanel `mail_max_userip_connections`. Set BOUNCE_IMAP_POLL=true
 * only if you need the env-only bounce mailbox path.
 */
export async function pollBounceMailboxOnce(): Promise<number> {
  if (process.env.BOUNCE_IMAP_POLL !== "true") {
    return 0;
  }

  const configs = await resolveMailboxImapConfigs();
  if (configs.length === 0) return 0;

  let total = 0;
  for (const config of configs) {
    try {
      const n = await pollBouncesOnMailbox(config);
      total += n;
      await new Promise((r) => setTimeout(r, 800));
    } catch (e) {
      console.warn(
        `Bounce IMAP poll skipped for ${config.user} (imap ${config.host}):`,
        imapErrorMessage(e),
      );
    }
  }

  if (total > 0) {
    console.log(`Bounce poller: processed ${total} bounce(s) across mailboxes`);
  }
  return total;
}
