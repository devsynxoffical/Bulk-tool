import { prisma } from "@/lib/prisma";

export type MailboxImapConfig = {
  accountId: string;
  fromEmail: string;
  fromName: string | null;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  isActive: boolean;
};

/** SMTP relays often don't speak IMAP — prefer mail.{domain} for those. */
function isLikelySmtpRelayOnly(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h.includes("relay") ||
    h.startsWith("smtp.") ||
    h.includes("sendgrid") ||
    h.includes("mailgun") ||
    h.includes("amazonaws") ||
    h.includes("postmark") ||
    h.includes("sparkpost")
  );
}

/**
 * Resolve IMAP host for a mailbox.
 * Prefer mail.{from-domain} over SMTP relay hosts (relay.*.com usually has no IMAP).
 */
export function imapHostFromAccount(
  smtpHost: string | null | undefined,
  fromEmail: string,
): string {
  const domain = fromEmail.split("@")[1]?.trim().toLowerCase() || "";

  const envHost = process.env.IMAP_HOST?.trim();
  if (envHost) return envHost.replace("{domain}", domain);

  const smtp = smtpHost?.trim() || "";
  if (smtp && !isLikelySmtpRelayOnly(smtp)) return smtp;

  if (domain) return `mail.${domain}`;
  return smtp;
}

/**
 * All mailboxes with IMAP credentials (active + paused).
 * Paused inboxes still receive replies — they must sync.
 */
export async function resolveMailboxImapConfigs(options?: {
  activeOnly?: boolean;
}): Promise<MailboxImapConfig[]> {
  const explicitHost = process.env.BOUNCE_IMAP_HOST?.trim();
  const explicitUser = process.env.BOUNCE_IMAP_USER?.trim();
  const explicitPass = process.env.BOUNCE_IMAP_PASSWORD?.trim();

  if (explicitHost && explicitUser && explicitPass) {
    return [
      {
        accountId: "env-bounce",
        fromEmail: explicitUser,
        fromName: null,
        host: explicitHost,
        port: Number(process.env.BOUNCE_IMAP_PORT || 993),
        secure: process.env.BOUNCE_IMAP_SECURE !== "false",
        user: explicitUser,
        pass: explicitPass,
        isActive: true,
      },
    ];
  }

  const accounts = await prisma.emailAccount.findMany({
    where: {
      ...(options?.activeOnly ? { isActive: true } : {}),
      password: { not: "" },
      username: { not: "" },
    },
    orderBy: [{ isActive: "desc" }, { fromEmail: "asc" }],
  });

  return accounts
    .map((acc) => {
      const host = imapHostFromAccount(acc.host, acc.fromEmail);
      const user = acc.username?.trim() || acc.fromEmail;
      const pass = acc.password?.trim();
      if (!host || !user || !pass) return null;
      return {
        accountId: acc.id,
        fromEmail: acc.fromEmail,
        fromName: acc.fromName,
        host,
        port: 993,
        secure: true,
        user,
        pass,
        isActive: acc.isActive,
      };
    })
    .filter((c): c is MailboxImapConfig => c !== null);
}

export function isBounceNotification(subject: string, body: string): boolean {
  const s = subject.toLowerCase();
  const b = body.toLowerCase();
  return (
    s.includes("delivery") ||
    s.includes("undeliverable") ||
    s.includes("failure") ||
    s.includes("returned mail") ||
    s.includes("mail delivery failed") ||
    b.includes("final-recipient") ||
    b.includes("status: 5.") ||
    b.includes("status: 4.")
  );
}
