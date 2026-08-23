import { prisma } from "@/lib/prisma";
import {
  parseBouncedRecipientFromBody,
  recordBounce,
} from "./bounce-handler";

/** Last seen IMAP UID per mailbox (in-memory; resets on worker restart). */
const lastPollUidByAccount = new Map<string, number>();

type MailboxImapConfig = {
  accountId: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
};

function imapHostFromAccount(host: string | null, fromEmail: string): string {
  if (host?.trim()) return host.trim();
  const domain = fromEmail.split("@")[1];
  return domain ? `mail.${domain}` : "";
}

async function resolveMailboxConfigs(): Promise<MailboxImapConfig[]> {
  const explicitHost = process.env.BOUNCE_IMAP_HOST?.trim();
  const explicitUser = process.env.BOUNCE_IMAP_USER?.trim();
  const explicitPass = process.env.BOUNCE_IMAP_PASSWORD?.trim();

  if (explicitHost && explicitUser && explicitPass) {
    return [
      {
        accountId: "env-bounce",
        host: explicitHost,
        port: Number(process.env.BOUNCE_IMAP_PORT || 993),
        secure: process.env.BOUNCE_IMAP_SECURE !== "false",
        user: explicitUser,
        pass: explicitPass,
      },
    ];
  }

  const accounts = await prisma.emailAccount.findMany({
    where: {
      isActive: true,
      password: { not: "" },
      username: { not: "" },
    },
    orderBy: { updatedAt: "desc" },
  });

  return accounts
    .map((acc) => {
      const host = imapHostFromAccount(acc.host, acc.fromEmail);
      const user = acc.username?.trim() || acc.fromEmail;
      const pass = acc.password?.trim();
      if (!host || !user || !pass) return null;
      return {
        accountId: acc.id,
        host,
        port: 993,
        secure: true,
        user,
        pass,
      };
    })
    .filter((c): c is MailboxImapConfig => c !== null);
}

async function pollOneMailbox(config: MailboxImapConfig): Promise<number> {
  const { ImapFlow } = await import("imapflow");
  const { simpleParser } = await import("mailparser");

  let processed = 0;
  let lastPollUid = lastPollUidByAccount.get(config.accountId) || 0;

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

      const isBounce =
        subject.toLowerCase().includes("delivery") ||
        subject.toLowerCase().includes("undeliverable") ||
        subject.toLowerCase().includes("failure") ||
        subject.toLowerCase().includes("returned mail") ||
        body.toLowerCase().includes("final-recipient");

      if (msg.uid) lastPollUid = Math.max(lastPollUid, msg.uid);

      if (!isBounce) continue;

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
  lastPollUidByAccount.set(config.accountId, lastPollUid);
  return processed;
}

/**
 * Poll sending mailboxes for DSN bounce notifications.
 * Uses every active mailbox from the app DB — no per-mailbox Railway env vars needed.
 * Optional override: BOUNCE_IMAP_HOST / USER / PASSWORD.
 */
export async function pollBounceMailboxOnce(): Promise<number> {
  const configs = await resolveMailboxConfigs();
  if (configs.length === 0) return 0;

  let total = 0;
  for (const config of configs) {
    try {
      const n = await pollOneMailbox(config);
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
