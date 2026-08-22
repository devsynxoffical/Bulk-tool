import {
  parseBouncedRecipientFromBody,
  recordBounce,
} from "./bounce-handler";

let lastPollUid = 0;

/**
 * Poll a dedicated bounce/IMAP mailbox for DSN failure notifications.
 * Configure via BOUNCE_IMAP_* environment variables.
 */
export async function pollBounceMailboxOnce(): Promise<number> {
  const host = process.env.BOUNCE_IMAP_HOST;
  const user = process.env.BOUNCE_IMAP_USER;
  const pass = process.env.BOUNCE_IMAP_PASSWORD;
  if (!host || !user || !pass) return 0;

  try {
    const { ImapFlow } = await import("imapflow");
    const { simpleParser } = await import("mailparser");

    const client = new ImapFlow({
      host,
      port: Number(process.env.BOUNCE_IMAP_PORT || 993),
      secure: process.env.BOUNCE_IMAP_SECURE !== "false",
      auth: { user, pass },
      logger: false,
    });

    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    let processed = 0;

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

        const isBounce =
          subject.toLowerCase().includes("delivery") ||
          subject.toLowerCase().includes("undeliverable") ||
          subject.toLowerCase().includes("failure") ||
          body.toLowerCase().includes("final-recipient");

        if (!isBounce) {
          if (msg.uid) lastPollUid = Math.max(lastPollUid, msg.uid);
          continue;
        }

        const email = parseBouncedRecipientFromBody(body);
        if (email) {
          await recordBounce({
            email,
            reason: "HARD_BOUNCE",
            raw: body.slice(0, 4000),
          });
          processed += 1;
        }

        if (msg.uid) lastPollUid = Math.max(lastPollUid, msg.uid);
      }
    } finally {
      lock.release();
    }

    await client.logout();
    if (processed > 0) {
      console.log(`Bounce poller: processed ${processed} bounce(s)`);
    }
    return processed;
  } catch (e) {
    console.warn(
      "Bounce IMAP poll skipped:",
      e instanceof Error ? e.message : e,
    );
    return 0;
  }
}
