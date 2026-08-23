import { prisma } from "@/lib/prisma";
import { recalculateInboxHealth } from "./health";

export const BOUNCE_SMTP_PATTERNS =
  /550|552|554|421|mailbox (?:not found|unavailable|disabled)|user unknown|address rejected|recipient rejected|does not exist|no such user|invalid recipient|permanent failure|delivery failed permanently/i;

export type BounceReason = "HARD_BOUNCE" | "SOFT_BOUNCE" | "COMPLAINT";

export function isLikelySmtpBounce(errorMessage: string): boolean {
  return BOUNCE_SMTP_PATTERNS.test(errorMessage);
}

export function isValidRecipientEmail(email: string): boolean {
  const lower = email.trim().toLowerCase();
  if (!lower.includes("@")) return false;
  const domain = lower.split("@")[1] || "";
  if (/\.(png|jpg|jpeg|gif|webp|svg|pdf)$/i.test(domain)) return false;
  return /^[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}$/.test(lower);
}

function extractEmailFromText(text: string): string | null {
  const matches = text.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g) || [];
  for (const raw of matches) {
    const email = raw.toLowerCase();
    if (isValidRecipientEmail(email)) return email;
  }
  return null;
}

/**
 * Record a bounce: suppress recipient, penalize inbox health, optionally pause inbox.
 */
export async function recordBounce(params: {
  email: string;
  reason?: BounceReason;
  inboxId?: string | null;
  raw?: string;
  contactId?: string;
}) {
  const email = params.email.trim().toLowerCase();
  if (!isValidRecipientEmail(email)) return { ok: false, error: "Invalid email" };

  const reason = params.reason || "HARD_BOUNCE";
  const suppressionReason =
    reason === "COMPLAINT" ? "COMPLAINT" : "BOUNCED";

  await prisma.suppressionList.upsert({
    where: { email },
    create: { email, reason: suppressionReason },
    update: { reason: suppressionReason },
  });

  const contact = await prisma.contact.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });

  await prisma.contact.updateMany({
    where: { email: { equals: email, mode: "insensitive" } },
    data: { emailOptedOut: true },
  });

  if (contact) {
    const bounceNote = `Bounced (${reason})`;
    await prisma.campaignRecipient.updateMany({
      where: {
        contactId: contact.id,
        status: { in: ["SENT", "DELIVERED", "QUEUED", "READ"] },
      },
      data: {
        status: "FAILED",
        errorMessage: bounceNote,
      },
    });

    await prisma.message.updateMany({
      where: {
        contactId: contact.id,
        channel: "EMAIL",
        direction: "OUTBOUND",
        status: { in: ["SENT", "DELIVERED", "READ"] },
      },
      data: {
        status: "FAILED",
        errorMessage: params.raw?.slice(0, 500) || bounceNote,
      },
    });
  }

  await prisma.bounceEvent.create({
    data: {
      email,
      inboxId: params.inboxId ?? undefined,
      reason,
      raw: params.raw?.slice(0, 4000),
      contactId: params.contactId ?? contact?.id,
    },
  });

  if (params.inboxId) {
    await prisma.emailAccount.update({
      where: { id: params.inboxId },
      data: { bounceCount: { increment: 1 } },
    });
    // Health is driven by open rate (+ bounce drag), not stacked −15 forever
    await recalculateInboxHealth(params.inboxId);
  }

  return { ok: true, email, reason };
}

/**
 * Parse a bounce notification body and extract the failed recipient email.
 */
export function parseBouncedRecipientFromBody(body: string): string | null {
  const lower = body.toLowerCase();

  const finalRecipient = body.match(
    /final-recipient:\s*rfc822;\s*([\w.+-]+@[\w.-]+\.\w+)/i,
  );
  if (finalRecipient) {
    const addr = finalRecipient[1].toLowerCase();
    if (isValidRecipientEmail(addr)) return addr;
  }

  const original = body.match(
    /original-recipient:\s*rfc822;\s*([\w.+-]+@[\w.-]+\.\w+)/i,
  );
  if (original) {
    const addr = original[1].toLowerCase();
    if (isValidRecipientEmail(addr)) return addr;
  }

  if (lower.includes("mail delivery failed") || lower.includes("undeliverable")) {
    return extractEmailFromText(body);
  }

  return extractEmailFromText(body);
}

export async function getBounceStats(days = 7) {
  const since = new Date(Date.now() - days * 86400_000);
  const [total, recent, suppressed] = await Promise.all([
    prisma.bounceEvent.count(),
    prisma.bounceEvent.count({ where: { createdAt: { gte: since } } }),
    prisma.suppressionList.count({
      where: { reason: { in: ["BOUNCED", "COMPLAINT"] } },
    }),
  ]);
  return { total, recent, suppressed };
}
