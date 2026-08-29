import { prisma, ensureDbSchema } from "@/lib/prisma";
import {
  extractDomainFromEmail,
  MIN_INBOX_INTERVAL_SEC,
  SENDING_DAY_SECONDS,
  BOUNCE_RATE_PAUSE_THRESHOLD,
} from "./constants";
import { getEffectiveDailyLimit } from "./warmup";
import {
  getEngineConfig,
  resolveHourlyCap,
  resolveSendIntervalSec,
  resolveWarmupMaxStage,
  type EnginePacingConfig,
} from "./engine-config";

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

function hourWindowFresh(
  hourWindowStart: Date | null | undefined,
  now = Date.now(),
): boolean {
  if (!hourWindowStart) return false;
  return now - hourWindowStart.getTime() < 3600_000;
}

function effectiveSentThisHour(inbox: {
  sentThisHour?: number | null;
  hourWindowStart?: Date | null;
}): number {
  if (!hourWindowFresh(inbox.hourWindowStart)) return 0;
  return inbox.sentThisHour ?? 0;
}

/** Cooldown ms for an inbox — respects engine/mailbox interval + daily spread. */
export function getInboxCooldownMs(
  inbox: {
    dailyLimit: number;
    warmupEnabled: boolean;
    warmupStartedAt?: Date | null;
    createdAt: Date;
    warmupMaxStage?: number | null;
    hourlyCap?: number | null;
    sendIntervalSec?: number | null;
  },
  engine: EnginePacingConfig,
): number {
  const maxStage = resolveWarmupMaxStage(inbox.warmupMaxStage, engine);
  const cap = getEffectiveDailyLimit(inbox, maxStage);
  const hourlyCap = resolveHourlyCap(inbox.hourlyCap, engine);
  const intervalSec = resolveSendIntervalSec(
    inbox.sendIntervalSec,
    engine,
    hourlyCap,
  );

  const evenSpreadSec = SENDING_DAY_SECONDS / Math.max(cap, 1);
  const spreadCooldownSec = Math.max(
    MIN_INBOX_INTERVAL_SEC,
    evenSpreadSec * 0.9,
    intervalSec * 0.85,
  );
  // Prefer configured interval as the real pacing floor/ceiling
  const cooldownSec = Math.max(
    MIN_INBOX_INTERVAL_SEC,
    Math.min(spreadCooldownSec, intervalSec),
  );
  return Math.floor(cooldownSec * 1000);
}

export function inboxCooldownReady(
  inbox: {
    lastSentAt: Date | null;
  } & Parameters<typeof getInboxCooldownMs>[0],
  engine: EnginePacingConfig,
  now = Date.now(),
): boolean {
  if (!inbox.lastSentAt) return true;
  return (
    now - inbox.lastSentAt.getTime() >= getInboxCooldownMs(inbox, engine)
  );
}

function inboxHourlyOk(
  inbox: {
    sentThisHour?: number | null;
    hourWindowStart?: Date | null;
    hourlyCap?: number | null;
  },
  engine: EnginePacingConfig,
): boolean {
  const cap = resolveHourlyCap(inbox.hourlyCap, engine);
  return effectiveSentThisHour(inbox) < cap;
}

function inboxBounceRateOk(inbox: InboxWithDomain): boolean {
  if (inbox.sentToday < 10) return true;
  return inbox.bounceCount / inbox.sentToday < BOUNCE_RATE_PAUSE_THRESHOLD;
}

let lastDailyResetKey: string | null = null;

export async function checkDailyReset() {
  const key = new Date().toISOString().slice(0, 10);
  if (lastDailyResetKey === key) return;
  lastDailyResetKey = key;

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

function inboxHasCapacity(
  inbox: InboxWithDomain,
  engine: EnginePacingConfig,
): boolean {
  const maxStage = resolveWarmupMaxStage(inbox.warmupMaxStage, engine);
  const cap = getEffectiveDailyLimit(
    {
      dailyLimit: inbox.dailyLimit,
      warmupEnabled: inbox.warmupEnabled,
      warmupStartedAt: inbox.warmupStartedAt,
      createdAt: inbox.createdAt,
      warmupMaxStage: inbox.warmupMaxStage,
    },
    maxStage,
  );
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

export type GetNextSendingInboxOptions = {
  respectCooldown?: boolean;
  ownerId?: string;
};

function describeInboxBlockers(
  inbox: InboxWithDomain,
  engine: EnginePacingConfig,
  now: number,
  respectCooldown: boolean,
): string[] {
  const reasons: string[] = [];
  const maxStage = resolveWarmupMaxStage(inbox.warmupMaxStage, engine);
  const dailyCap = getEffectiveDailyLimit(inbox, maxStage);
  if (!inboxHasCapacity(inbox, engine)) {
    reasons.push(`daily cap (${inbox.sentToday}/${dailyCap})`);
  }
  if (!domainHasCapacity(inbox.domain)) {
    reasons.push(
      `domain cap (${inbox.domain?.sentToday ?? 0}/${inbox.domain?.dailyLimit ?? "?"})`,
    );
  }
  if (!inboxBounceRateOk(inbox)) reasons.push("bounce rate");
  if (!inboxHourlyOk(inbox, engine)) {
    const cap = resolveHourlyCap(inbox.hourlyCap, engine);
    reasons.push(`hourly cap (${effectiveSentThisHour(inbox)}/${cap})`);
  }
  if (respectCooldown && !inboxCooldownReady(inbox, engine, now)) {
    const waitSec = inbox.lastSentAt
      ? Math.max(
          0,
          Math.ceil(
            (inbox.lastSentAt.getTime() +
              getInboxCooldownMs(inbox, engine) -
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
  const { respectCooldown = true, ownerId } = options;
  await checkDailyReset();
  const engine = await getEngineConfig();

  const inboxes = await prisma.emailAccount.findMany({
    where: {
      isActive: true,
      ...(ownerId ? { ownerId } : {}),
    },
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
      inboxHasCapacity(inbox, engine) &&
      domainHasCapacity(inbox.domain) &&
      inboxBounceRateOk(inbox) &&
      inboxHourlyOk(inbox, engine) &&
      (respectCooldown ? inboxCooldownReady(inbox, engine) : true),
  );

  if (eligible.length === 0) return null;

  return rankInboxes(eligible)[0];
}

export async function getMsUntilInboxAvailable(
  ownerId?: string,
): Promise<number> {
  await checkDailyReset();
  const engine = await getEngineConfig();

  const inboxes = await prisma.emailAccount.findMany({
    where: {
      isActive: true,
      ...(ownerId ? { ownerId } : {}),
    },
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
    if (!inboxHasCapacity(inbox, engine) || !domainHasCapacity(inbox.domain)) {
      continue;
    }
    if (!inboxBounceRateOk(inbox)) continue;

    if (!inboxHourlyOk(inbox, engine)) {
      const windowStart = inbox.hourWindowStart?.getTime() ?? now;
      const waitHour = Math.max(5_000, windowStart + 3600_000 - now);
      minWait = Math.min(minWait, waitHour);
      continue;
    }

    if (!inbox.lastSentAt) return 0;
    const readyAt =
      inbox.lastSentAt.getTime() + getInboxCooldownMs(inbox, engine);
    const wait = readyAt - now;
    if (wait <= 0) return 0;
    minWait = Math.min(minWait, wait);
  }

  return Math.max(minWait, 5000);
}

export function explainInboxAvailability(
  inboxes: InboxWithDomain[],
  engine: EnginePacingConfig,
  respectCooldown = true,
): string {
  const now = Date.now();
  const lines = inboxes
    .filter((i) => i.isActive)
    .map((inbox) => {
      const blockers = describeInboxBlockers(
        inbox,
        engine,
        now,
        respectCooldown,
      );
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
    const now = new Date();
    const existing = await prisma.emailAccount.findUnique({
      where: { id: inboxId },
      select: { sentThisHour: true, hourWindowStart: true },
    });

    const windowFresh = hourWindowFresh(existing?.hourWindowStart, now.getTime());
    const nextHourCount = windowFresh ? (existing?.sentThisHour ?? 0) + 1 : 1;

    await prisma.emailAccount.update({
      where: { id: inboxId },
      data: {
        sentToday: { increment: 1 },
        sentThisHour: nextHourCount,
        hourWindowStart: windowFresh
          ? existing?.hourWindowStart ?? now
          : now,
        ...(applyCooldown ? { lastSentAt: now } : {}),
      },
    });

    if (domainId) {
      await prisma.sendingDomain.update({
        where: { id: domainId },
        data: {
          sentToday: { increment: 1 },
          lastSentAt: now,
        },
      });
    }
  } catch {
    // Non-fatal
  }
}

export async function getSendingCapacityStats(ownerId?: string) {
  await checkDailyReset();
  const engine = await getEngineConfig();

  const ownerFilter = ownerId ? { ownerId } : {};

  const [inboxes, domains] = await Promise.all([
    prisma.emailAccount.findMany({
      where: { isActive: true, ...ownerFilter },
      include: { domain: true },
    }),
    prisma.sendingDomain.findMany({
      where: ownerFilter,
      orderBy: { domainName: "asc" },
    }),
  ]);

  let inboxCapacityToday = 0;
  let inboxSentToday = 0;

  for (const inbox of inboxes) {
    const maxStage = resolveWarmupMaxStage(inbox.warmupMaxStage, engine);
    inboxCapacityToday += getEffectiveDailyLimit(inbox, maxStage);
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
      ? inboxes.reduce(
          (sum, i) => sum + getInboxCooldownMs(i, engine) / 1000,
          0,
        ) / inboxes.length
      : 0;

  const theoreticalDailyMax = inboxes.reduce((sum, i) => {
    const maxStage = resolveWarmupMaxStage(i.warmupMaxStage, engine);
    return sum + getEffectiveDailyLimit(i, maxStage);
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
    warmupMaxStage: engine.warmupMaxStage,
    inboxHourlyCap: engine.inboxHourlyCap,
    inboxIntervalSec: engine.inboxIntervalSec,
  };
}
