import { prisma } from "@/lib/prisma";
import { getAutoWarmupStage, getWarmupDayNumber } from "./warmup";
import { getEngineConfig, resolveWarmupMaxStage } from "./engine-config";

/**
 * Syncs each inbox's warmupStage column to the auto-calculated stage for today,
 * capped by engine / per-mailbox max stage.
 */
export async function syncWarmupStages() {
  const engine = await getEngineConfig();
  const inboxes = await prisma.emailAccount.findMany({
    where: { warmupEnabled: true },
    select: {
      id: true,
      warmupStage: true,
      warmupStartedAt: true,
      warmupMaxStage: true,
      createdAt: true,
    },
  });

  let updated = 0;
  for (const inbox of inboxes) {
    const startedAt = inbox.warmupStartedAt ?? inbox.createdAt;
    const day = getWarmupDayNumber(startedAt);
    const maxStage = resolveWarmupMaxStage(inbox.warmupMaxStage, engine);
    const stage = Math.min(getAutoWarmupStage(day), maxStage);
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
      sentThisHour: 0,
      hourWindowStart: null,
    },
  });
}
