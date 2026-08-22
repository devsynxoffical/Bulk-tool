import { prisma } from "@/lib/prisma";
import { getAutoWarmupStage, getWarmupDayNumber } from "./warmup";

/**
 * Syncs each inbox's warmupStage column to the auto-calculated stage for today.
 * Run once daily from the worker.
 */
export async function syncWarmupStages() {
  const inboxes = await prisma.emailAccount.findMany({
    where: { warmupEnabled: true },
    select: {
      id: true,
      warmupStage: true,
      warmupStartedAt: true,
      createdAt: true,
    },
  });

  let updated = 0;
  for (const inbox of inboxes) {
    const startedAt = inbox.warmupStartedAt ?? inbox.createdAt;
    const day = getWarmupDayNumber(startedAt);
    const stage = getAutoWarmupStage(day);
    if (inbox.warmupStage !== stage) {
      await prisma.emailAccount.update({
        where: { id: inbox.id },
        data: { warmupStage: stage },
      });
      updated += 1;
    }
  }

  if (updated > 0) {
    console.log(`Warmup: advanced ${updated} inbox(es) to new stage`);
  }
  return updated;
}

/** Reset warmup clock for a mailbox (e.g. after long pause or reputation issue). */
export async function restartMailboxWarmup(inboxId: string) {
  const now = new Date();
  await prisma.emailAccount.update({
    where: { id: inboxId },
    data: {
      warmupEnabled: true,
      warmupStartedAt: now,
      warmupStage: 1,
      sentToday: 0,
    },
  });
}
