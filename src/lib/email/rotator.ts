import { prisma } from "@/lib/prisma";

export type EmailAccountRecord = Awaited<ReturnType<typeof prisma.emailAccount.findFirst>>;

/**
 * Returns the best active sending inbox using weighted round-robin.
 * Filters for active inboxes with sentToday < dailyLimit and healthScore > 30.
 */
export async function getNextSendingInbox(): Promise<EmailAccountRecord> {
  const inboxes = await prisma.emailAccount.findMany({
    where: {
      isActive: true,
      healthScore: { gte: 30 },
    },
    orderBy: [
      { sentToday: "asc" },
      { lastSentAt: "asc" },
    ],
  });

  if (inboxes.length === 0) return null;

  // Find the first inbox with capacity left today
  const available = inboxes.find((i) => i.sentToday < i.dailyLimit);

  if (!available) {
    // If all inboxes have reached daily limit, return the least-sent one as fallback
    return inboxes[0];
  }

  return available;
}

/**
 * Increments sent count for an inbox and updates lastSentAt timestamp.
 */
export async function recordInboxSend(inboxId: string) {
  try {
    await prisma.emailAccount.update({
      where: { id: inboxId },
      data: {
        sentToday: { increment: 1 },
        lastSentAt: new Date(),
      },
    });
  } catch (e) {
    // Ignore non-fatal stats update errors
  }
}

/**
 * Resets sentToday counter for all inboxes if the date has rolled over to a new day.
 */
export async function checkDailyReset() {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const stale = await prisma.emailAccount.findFirst({
    where: {
      sentToday: { gt: 0 },
      lastSentAt: { lt: startOfDay },
    },
  });

  if (stale) {
    await prisma.emailAccount.updateMany({
      data: { sentToday: 0 },
    });
  }
}

/**
 * Generates a humanized randomized sending delay in milliseconds (default 15-60s)
 */
export function getRandomSendDelayMs(minSec = 15, maxSec = 60): number {
  const seconds = Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
  return seconds * 1000;
}
