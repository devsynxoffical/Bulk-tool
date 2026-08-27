import { prisma } from "@/lib/prisma";
import {
  OPEN_RATE_HEALTH_TARGET,
  OPEN_RATE_LOOKBACK_DAYS,
  OPEN_RATE_MIN_SAMPLE,
  BOUNCE_RATE_PAUSE_THRESHOLD,
  BOUNCE_PAUSE_LOOKBACK_DAYS,
  AUTO_RESUME_BOUNCE_HOURS,
  AUTO_RESUME_AUTH_HOURS,
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
  options?: { hardBouncesOnly?: boolean },
): Promise<InboxOpenStats> {
  const since = new Date(Date.now() - lookbackDays * 86_400_000);
  const hardOnly = options?.hardBouncesOnly ?? false;

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
        ...(hardOnly
          ? { reason: { in: ["HARD_BOUNCE", "COMPLAINT"] } }
          : {}),
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
 * Auto-pause uses recent hard-bounce rate only — not the full health lookback —
 * so old history cannot immediately re-pause after resume.
 */
export async function recalculateInboxHealth(
  inboxId: string,
  options?: { allowPause?: boolean },
) {
  const allowPause = options?.allowPause !== false;
  const stats = await getInboxOpenStats(inboxId);
  const recent = await getInboxOpenStats(inboxId, BOUNCE_PAUSE_LOOKBACK_DAYS, {
    hardBouncesOnly: true,
  });

  await prisma.emailAccount.update({
    where: { id: inboxId },
    data: { healthScore: stats.healthScore },
  });

  if (
    allowPause &&
    recent.sampleReady &&
    recent.bounceRate >= BOUNCE_RATE_PAUSE_THRESHOLD
  ) {
    const inbox = await prisma.emailAccount.findUnique({
      where: { id: inboxId },
      select: { isActive: true },
    });
    if (inbox?.isActive) {
      await prisma.emailAccount.update({
        where: { id: inboxId },
        data: {
          isActive: false,
          pausedAt: new Date(),
          pauseReason: "AUTO_BOUNCE",
        },
      });
      console.warn(
        `Auto-paused mailbox ${inboxId}: recent bounce rate ${(recent.bounceRate * 100).toFixed(1)}% (${recent.bounceCount}/${recent.sent})`,
      );
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
      ...(capped < 30
        ? {
            isActive: false,
            pausedAt: new Date(),
            pauseReason: "AUTH",
          }
        : {}),
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

function resumeEligibleAt(pausedAt: Date | null, reason: string | null): number {
  const hours =
    reason === "AUTH" ? AUTO_RESUME_AUTH_HOURS : AUTO_RESUME_BOUNCE_HOURS;
  // Legacy pauses (no timestamp) are eligible immediately
  if (!pausedAt) return 0;
  return pausedAt.getTime() + hours * 3600_000;
}

/**
 * Resume auto-paused mailboxes after cooldown if recent bounce rate has cooled.
 * Manual pauses are never auto-resumed.
 */
export async function autoResumePausedMailboxes(): Promise<number> {
  const paused = await prisma.emailAccount.findMany({
    where: {
      isActive: false,
      NOT: { pauseReason: "MANUAL" },
    },
    select: {
      id: true,
      fromEmail: true,
      pausedAt: true,
      pauseReason: true,
    },
  });

  const now = Date.now();
  let resumed = 0;

  for (const inbox of paused) {
    if (now < resumeEligibleAt(inbox.pausedAt, inbox.pauseReason)) continue;

    const recent = await getInboxOpenStats(
      inbox.id,
      BOUNCE_PAUSE_LOOKBACK_DAYS,
      { hardBouncesOnly: true },
    );
    if (
      recent.sampleReady &&
      recent.bounceRate >= BOUNCE_RATE_PAUSE_THRESHOLD
    ) {
      continue;
    }

    await prisma.emailAccount.update({
      where: { id: inbox.id },
      data: {
        isActive: true,
        pausedAt: null,
        pauseReason: null,
      },
    });
    resumed += 1;
    console.log(`Auto-resumed mailbox ${inbox.fromEmail}`);
  }

  if (resumed > 0) {
    console.log(`Auto-resume: ${resumed} mailbox(es) back in rotation`);
  }
  return resumed;
}
