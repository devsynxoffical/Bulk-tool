import { prisma } from "@/lib/prisma";
import {
  BOUNCE_RATE_PAUSE_THRESHOLD,
  HEALTH_PENALTY_PER_BOUNCE,
} from "./constants";

export const BOUNCE_SMTP_PATTERNS =
  /550|552|554|421|mailbox (?:not found|unavailable|disabled)|user unknown|address rejected|recipient rejected|does not exist|no such user|invalid recipient|permanent failure|delivery failed permanently/i;

export type BounceReason = "HARD_BOUNCE" | "SOFT_BOUNCE" | "COMPLAINT";

export function isLikelySmtpBounce(errorMessage: string): boolean {
  return BOUNCE_SMTP_PATTERNS.test(errorMessage);
}

function extractEmailFromText(text: string): string | null {
  const match = text.match(
    /[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/,
  );
  return match ? match[0].toLowerCase() : null;
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
  if (!email.includes("@")) return { ok: false, error: "Invalid email" };

  const reason = params.reason || "HARD_BOUNCE";
  const suppressionReason =
    reason === "COMPLAINT" ? "COMPLAINT" : "BOUNCED";

  await prisma.suppressionList.upsert({
    where: { email },
    create: { email, reason: suppressionReason },
    update: { reason: suppressionReason },
  });

  await prisma.contact.updateMany({
    where: { email },
    data: { emailOptedOut: true },
  });

  await prisma.bounceEvent.create({
    data: {
      email,
      inboxId: params.inboxId ?? undefined,
      reason,
      raw: params.raw?.slice(0, 4000),
      contactId: params.contactId,
    },
  });

  if (params.inboxId) {
    const inbox = await prisma.emailAccount.update({
      where: { id: params.inboxId },
      data: {
        bounceCount: { increment: 1 },
        healthScore: { decrement: HEALTH_PENALTY_PER_BOUNCE },
      },
    });

    const sent = Math.max(inbox.sentToday, 1);
    const bounceRate = inbox.bounceCount / sent;
    if (bounceRate >= BOUNCE_RATE_PAUSE_THRESHOLD || inbox.healthScore < 30) {
      await prisma.emailAccount.update({
        where: { id: params.inboxId },
        data: { isActive: false },
      });
    }
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
  if (finalRecipient) return finalRecipient[1].toLowerCase();

  const original = body.match(
    /original-recipient:\s*rfc822;\s*([\w.+-]+@[\w.-]+\.\w+)/i,
  );
  if (original) return original[1].toLowerCase();

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
