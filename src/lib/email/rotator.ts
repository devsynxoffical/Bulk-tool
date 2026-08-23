import { prisma, ensureDbSchema } from "@/lib/prisma";
import {
  extractDomainFromEmail,
  MIN_INBOX_INTERVAL_SEC,
  MAX_INBOX_COOLDOWN_SEC,
  SENDING_DAY_SECONDS,
  BOUNCE_RATE_PAUSE_THRESHOLD,
} from "./constants";
import { getEffectiveDailyLimit } from "./warmup";

export type EmailAccountRecord = Awaited<
  ReturnType<typeof prisma.emailAccount.findFirst>
>;

type InboxWithDomain = Awaited<
  ReturnType<typeof prisma.emailAccount.findMany>
>[number] & {
  domain?: {
    id: string;
    domainName: string;
    dailyLimit: number;
    sentToday: number;
    isVerified: boolean;
  } | null;
};

/** Cooldown ms for an inbox — spreads its daily cap evenly over 24 hours. */
export function getInboxCooldownMs(inbox: {
  dailyLimit: number;
  warmupEnabled: boolean;
  warmupStartedAt?: Date | null;
  createdAt: Date;
}): number {
  const cap = getEffectiveDailyLimit(inbox);
  const evenSpreadSec = SENDING_DAY_SECONDS / Math.max(cap, 1);
  const spreadCooldownSec = Math.max(MIN_INBOX_INTERVAL_SEC, evenSpreadSec * 0.9);
  // Daily cap (e.g. 20/day warmup) is enforced separately — don't idle 65+ min between sends
  const cooldownSec = Math.min(spreadCooldownSec, MAX_INBOX_COOLDOWN_SEC);
  return Math.floor(cooldownSec * 1000);
}

export function inboxCooldownReady(
  inbox: { lastSentAt: Date | null } & Parameters<typeof getInboxCooldownMs>[0],
  now = Date.now(),
): boolean {
  if (!inbox.lastSentAt) return true;
  return now - inbox.lastSentAt.getTime() >= getInboxCooldownMs(inbox);
}

function inboxBounceRateOk(inbox: InboxWithDomain): boolean {
  if (inbox.sentToday < 10) return true;
  return inbox.bounceCount / inbox.sentToday < BOUNCE_RATE_PAUSE_THRESHOLD;
}

export async function checkDailyReset() {
  await ensureDbSchema();

  const today = new Date();
  const startOfDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  await prisma.emailAccount.updateMany({
    where: {
      sentToday: { gt: 0 },
      OR: [{ lastSentAt: null }, { lastSentAt: { lt: startOfDay } }],
    },
    data: { sentToday: 0, bounceCount: 0 },
  });

  await prisma.sendingDomain.updateMany({
    where: {
      sentToday: { gt: 0 },
      OR: [{ lastSentAt: null }, { lastSentAt: { lt: startOfDay } }],
    },
    data: { sentToday: 0 },
  });
}

function inboxHasCapacity(inbox: InboxWithDomain): boolean {
  const cap = getEffectiveDailyLimit({
    dailyLimit: inbox.dailyLimit,
    warmupEnabled: inbox.warmupEnabled,
    warmupStartedAt: inbox.warmupStartedAt,
    createdAt: inbox.createdAt,
  });
  return inbox.sentToday < cap;
}

function domainHasCapacity(domain: InboxWithDomain["domain"]): boolean {
  if (!domain) return true;
  return domain.sentToday < domain.dailyLimit;
}

function rankInboxes(inboxes: InboxWithDomain[]): InboxWithDomain[] {
  const byDomain = new Map<string, InboxWithDomain[]>();
  for (const inbox of inboxes) {
    const key =
      inbox.domain?.id ||
      extractDomainFromEmail(inbox.fromEmail) ||
      "unlinked";
    const list = byDomain.get(key) || [];
    list.push(inbox);
    byDomain.set(key, list);
  }

  let bestDomainKey: string | null = null;
  let bestDomainScore = Infinity;

  for (const [key, domainInboxes] of byDomain) {
    const domain = domainInboxes[0]?.domain;
    const domainLimit = domain?.dailyLimit ?? Infinity;
    const domainSent = domain?.sentToday ?? 0;
    const utilization = domainSent / Math.max(domainLimit, 1);
    if (utilization < bestDomainScore) {
      bestDomainScore = utilization;
      bestDomainKey = key;
    }
  }

  const pool = bestDomainKey ? byDomain.get(bestDomainKey)! : inboxes;
  return [...pool].sort((a, b) => {
    const healthDiff = (b.healthScore ?? 100) - (a.healthScore ?? 100);
    if (healthDiff !== 0) return healthDiff;
    return a.sentToday - b.sentToday;
  });
}

/**
 * Domain-first round-robin with per-inbox cooldown and bounce-rate filtering.
 */
export type GetNextSendingInboxOptions = {
  /** When false, manual one-off sends can go immediately (campaigns keep default true). */
  respectCooldown?: boolean;
};

function describeInboxBlockers(
  inbox: InboxWithDomain,
  now: number,
  respectCooldown: boolean,
): string[] {
  const reasons: string[] = [];
  if (!inboxHasCapacity(inbox)) {
    reasons.push(`daily cap (${inbox.sentToday}/${getEffectiveDailyLimit(inbox)})`);
  }
  if (!domainHasCapacity(inbox.domain)) {
    reasons.push(
      `domain cap (${inbox.domain?.sentToday ?? 0}/${inbox.domain?.dailyLimit ?? "?"})`,
    );
  }
  if (!inboxBounceRateOk(inbox)) reasons.push("bounce rate");
  if (respectCooldown && !inboxCooldownReady(inbox, now)) {
    const waitSec = inbox.lastSentAt
      ? Math.max(
          0,
          Math.ceil(
            (inbox.lastSentAt.getTime() +
              getInboxCooldownMs(inbox) -
              now) /
              1000,
          ),
        )
      : 0;
    reasons.push(`cooldown (${waitSec}s)`);
  }
  return reasons;
}

export async function getNextSendingInbox(
  options: GetNextSendingInboxOptions = {},
): Promise<EmailAccountRecord> {
  const { respectCooldown = true } = options;
  await checkDailyReset();

  const inboxes = await prisma.emailAccount.findMany({
    where: { isActive: true },
    include: {
      domain: {
        select: {
          id: true,
          domainName: true,
          dailyLimit: true,
          sentToday: true,
          isVerified: true,
        },
      },
    },
  });

  if (inboxes.length === 0) return null;

  const eligible = inboxes.filter(
    (inbox) =>
      inboxHasCapacity(inbox) &&
      domainHasCapacity(inbox.domain) &&
      inboxBounceRateOk(inbox) &&
      (respectCooldown ? inboxCooldownReady(inbox) : true),
  );

  if (eligible.length === 0) return null;

  return rankInboxes(eligible)[0];
}

/** Milliseconds until any inbox becomes ready (for job retry delay). */
export async function getMsUntilInboxAvailable(): Promise<number> {
  await checkDailyReset();

  const inboxes = await prisma.emailAccount.findMany({
    where: { isActive: true },
    include: {
      domain: {
        select: {
          id: true,
          domainName: true,
          dailyLimit: true,
          sentToday: true,
          isVerified: true,
        },
      },
    },
  });

  const now = Date.now();
  let minWait = 60_000;

  for (const inbox of inboxes) {
    if (!inboxHasCapacity(inbox) || !domainHasCapacity(inbox.domain)) continue;
    if (!inboxBounceRateOk(inbox)) continue;
    if (!inbox.lastSentAt) return 0;
    const readyAt = inbox.lastSentAt.getTime() + getInboxCooldownMs(inbox);
    const wait = readyAt - now;
    if (wait <= 0) return 0;
    minWait = Math.min(minWait, wait);
  }

  return Math.max(minWait, 5000);
}

export function explainInboxAvailability(
  inboxes: InboxWithDomain[],
  respectCooldown = true,
): string {
  const now = Date.now();
  const lines = inboxes
    .filter((i) => i.isActive)
    .map((inbox) => {
      const blockers = describeInboxBlockers(inbox, now, respectCooldown);
      return blockers.length
        ? `${inbox.fromEmail}: ${blockers.join(", ")}`
        : `${inbox.fromEmail}: ready`;
    });
  return lines.join("; ");
}

export async function recordInboxSend(
  inboxId: string,
  domainId?: string | null,
  options: { applyCooldown?: boolean } = {},
) {
  const { applyCooldown = true } = options;
  try {
    await prisma.emailAccount.update({
      where: { id: inboxId },
      data: {
        sentToday: { increment: 1 },
        ...(applyCooldown ? { lastSentAt: new Date() } : {}),
      },
    });

    if (domainId) {
      await prisma.sendingDomain.update({
        where: { id: domainId },
        data: {
          sentToday: { increment: 1 },
          lastSentAt: new Date(),
        },
      });
    }
  } catch {
    // Non-fatal
  }
}

export async function getSendingCapacityStats() {
  await checkDailyReset();

  const [inboxes, domains] = await Promise.all([
    prisma.emailAccount.findMany({
      where: { isActive: true },
      include: { domain: true },
    }),
    prisma.sendingDomain.findMany({ orderBy: { domainName: "asc" } }),
  ]);

  let inboxCapacityToday = 0;
  let inboxSentToday = 0;

  for (const inbox of inboxes) {
    inboxCapacityToday += getEffectiveDailyLimit({
      dailyLimit: inbox.dailyLimit,
      warmupEnabled: inbox.warmupEnabled,
      warmupStartedAt: inbox.warmupStartedAt,
      createdAt: inbox.createdAt,
    });
    inboxSentToday += inbox.sentToday;
  }

  let domainCapacityToday = 0;
  let domainSentToday = 0;
  for (const domain of domains) {
    domainCapacityToday += domain.dailyLimit;
    domainSentToday += domain.sentToday;
  }

  const avgCooldownSec =
    inboxes.length > 0
      ? inboxes.reduce((sum, i) => sum + getInboxCooldownMs(i) / 1000, 0) /
        inboxes.length
      : 0;

  const theoreticalDailyMax = inboxes.reduce((sum, i) => {
    return (
      sum +
      getEffectiveDailyLimit({
        dailyLimit: i.dailyLimit,
        warmupEnabled: i.warmupEnabled,
        warmupStartedAt: i.warmupStartedAt,
        createdAt: i.createdAt,
      })
    );
  }, 0);

  return {
    activeInboxes: inboxes.length,
    activeDomains: domains.length,
    inboxCapacityToday,
    inboxSentToday,
    inboxRemainingToday: Math.max(0, inboxCapacityToday - inboxSentToday),
    domainCapacityToday,
    domainSentToday,
    verifiedDomains: domains.filter((d) => d.isVerified).length,
    avgInboxCooldownSec: Math.round(avgCooldownSec),
    theoreticalDailyMax,
  };
}
