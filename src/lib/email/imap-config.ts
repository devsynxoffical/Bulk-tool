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
};

/** Resolve IMAP host — prefers SMTP host saved on the mailbox (works for cPanel relays). */
export function imapHostFromAccount(
  smtpHost: string | null | undefined,
  fromEmail: string,
): string {
  if (smtpHost?.trim()) return smtpHost.trim();

  const domain = fromEmail.split("@")[1]?.trim().toLowerCase();
  if (!domain) return "";

  const envHost = process.env.IMAP_HOST?.trim();
  if (envHost) return envHost.replace("{domain}", domain);

  return `mail.${domain}`;
}

export async function resolveMailboxImapConfigs(): Promise<MailboxImapConfig[]> {
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
        fromEmail: acc.fromEmail,
        fromName: acc.fromName,
        host,
        port: 993,
        secure: true,
        user,
        pass,
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
