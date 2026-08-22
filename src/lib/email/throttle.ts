import { prisma } from "@/lib/prisma";
import { getBounceStats } from "./bounce-handler";
import {
  BOUNCE_RATE_PAUSE_THRESHOLD,
  SYSTEM_DAILY_TARGET,
} from "./constants";

/**
 * Returns a multiplier (0.5–1.0) to slow sending when system bounce rate is elevated.
 */
export async function getDeliverabilityThrottleFactor(): Promise<number> {
  const stats = await getBounceStats(1);
  const inboxes = await prisma.emailAccount.aggregate({
    _sum: { sentToday: true },
    where: { isActive: true },
  });

  const sentToday = inboxes._sum.sentToday ?? 0;
  if (sentToday < 20) return 1;

  const bounceRate = stats.recent / sentToday;
  if (bounceRate >= BOUNCE_RATE_PAUSE_THRESHOLD) return 0.5;
  if (bounceRate >= BOUNCE_RATE_PAUSE_THRESHOLD / 2) return 0.75;
  return 1;
}

/** Extra milliseconds to wait when deliverability is degraded. */
export async function getThrottleDelayMs(): Promise<number> {
  const factor = await getDeliverabilityThrottleFactor();
  if (factor >= 1) return 0;
  if (factor <= 0.5) return 30_000;
  return 15_000;
}

export function computeSpreadDelayMs(
  jobIndex: number,
  totalJobs: number,
  workerConcurrency: number,
): number {
  if (totalJobs <= 0) return 0;
  const avgIntervalSec = 86400 / Math.min(totalJobs, SYSTEM_DAILY_TARGET);
  const slotSec = avgIntervalSec / Math.max(workerConcurrency, 1);
  const baseMs = jobIndex * slotSec * 1000;
  const jitter = Math.floor(Math.random() * 2000);
  return Math.floor(baseMs + jitter);
}
