import { prisma } from "@/lib/prisma";
import {
  OPEN_RATE_HEALTH_TARGET,
  OPEN_RATE_LOOKBACK_DAYS,
  OPEN_RATE_MIN_SAMPLE,
  BOUNCE_RATE_PAUSE_THRESHOLD,
} from "./constants";


export type InboxOpenStats = {
  sent: number;
  opened: number;
  openRate: number;
  bounceCount: number;
  bounceRate: number;
  healthScore: number;
  sampleReady: boolean;
};

function clampHealth(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Map open rate → health 0–100.
 * At TARGET open rate (default 20%) health = 100.
 * Bounce rate then subtracts up to 40 points.
 */
export function computeHealthFromOpenRate(params: {
  sent: number;
  opened: number;
  bounceCount?: number;
}): number {
  const sent = Math.max(0, params.sent);
  const opened = Math.max(0, Math.min(params.opened, sent));
  const bounceCount = Math.max(0, params.bounceCount ?? 0);

  if (sent < OPEN_RATE_MIN_SAMPLE) {
    // Not enough data — start healthy, don't invent a bad score
    return 100;
  }

  const openRate = opened / sent;
  const openHealth = (openRate / OPEN_RATE_HEALTH_TARGET) * 100;
  const bounceRate = bounceCount / sent;
  const bounceDrag = Math.min(40, bounceRate * 400); // 10% bounce → −40

  return clampHealth(openHealth - bounceDrag);
}

export async function getInboxOpenStats(
  inboxId: string,
  lookbackDays = OPEN_RATE_LOOKBACK_DAYS,
): Promise<InboxOpenStats> {
  const since = new Date(Date.now() - lookbackDays * 86_400_000);

  const [sent, opened, bounceCount] = await Promise.all([
    prisma.message.count({
      where: {
        inboxId,
        channel: "EMAIL",
        direction: "OUTBOUND",
        status: { in: ["SENT", "DELIVERED", "READ"] },
        createdAt: { gte: since },
      },
    }),
    prisma.message.count({
      where: {
        inboxId,
        channel: "EMAIL",
        direction: "OUTBOUND",
        status: "READ",
        createdAt: { gte: since },
      },
    }),
    prisma.bounceEvent.count({
      where: {
        inboxId,
        createdAt: { gte: since },
      },
    }),
  ]);

  const openRate = sent > 0 ? opened / sent : 0;
  const bounceRate = sent > 0 ? bounceCount / sent : 0;
  const healthScore = computeHealthFromOpenRate({ sent, opened, bounceCount });

  return {
    sent,
    opened,
    openRate,
    bounceCount,
    bounceRate,
    healthScore,
    sampleReady: sent >= OPEN_RATE_MIN_SAMPLE,
  };
}

/**
 * Recompute and persist mailbox health from open rate (clamped 0–100).
 * Also auto-pauses if health &lt; 30 or bounce rate is too high.
 */
export async function recalculateInboxHealth(inboxId: string) {
  const stats = await getInboxOpenStats(inboxId);

  const inbox = await prisma.emailAccount.update({
    where: { id: inboxId },
    data: { healthScore: stats.healthScore },
  });

  if (
    stats.healthScore < 30 ||
    (stats.sampleReady && stats.bounceRate >= BOUNCE_RATE_PAUSE_THRESHOLD)
  ) {
    if (inbox.isActive) {
      await prisma.emailAccount.update({
        where: { id: inboxId },
        data: { isActive: false },
      });
    }
  }

  return stats;
}

/** Soft auth penalty: cap health at 25 instead of stacking forever into negatives. */
export async function applyAuthFailureHealthCap(inboxId: string) {
  const inbox = await prisma.emailAccount.findUnique({
    where: { id: inboxId },
    select: { healthScore: true },
  });
  if (!inbox) return;

  const capped = Math.min(inbox.healthScore, 25);
  await prisma.emailAccount.update({
    where: { id: inboxId },
    data: {
      healthScore: clampHealth(capped),
      isActive: capped < 30 ? false : undefined,
    },
  });
}

/** Recalculate health for every mailbox (e.g. after deploy / manual refresh). */
export async function recalculateAllInboxHealth() {
  const accounts = await prisma.emailAccount.findMany({ select: { id: true } });
  const results = [];
  for (const acc of accounts) {
    results.push({
      id: acc.id,
      ...(await recalculateInboxHealth(acc.id)),
    });
  }
  return results;
}
