import { DEFAULT_INBOX_DAILY_LIMIT } from "./constants";

/** Daily send caps per warmup stage. */
export const WARMUP_STAGE_LIMITS = [20, 50, 100, 175, 250] as const;

export const WARMUP_SCHEDULE = [
  { stage: 1, fromDay: 1, toDay: 3, dailyCap: 20, label: "Days 1–3" },
  { stage: 2, fromDay: 4, toDay: 7, dailyCap: 50, label: "Days 4–7" },
  { stage: 3, fromDay: 8, toDay: 14, dailyCap: 100, label: "Days 8–14" },
  { stage: 4, fromDay: 15, toDay: 21, dailyCap: 175, label: "Days 15–21" },
  { stage: 5, fromDay: 22, toDay: null, dailyCap: 250, label: "Day 22+ (full)" },
] as const;

export const WARMUP_STAGE_LABELS = WARMUP_SCHEDULE.map(
  (s) => `Stage ${s.stage} (${s.label}): ${s.dailyCap}/day`,
);

export type WarmupContext = {
  enabled: boolean;
  warmupDay: number;
  stage: number;
  dailyCap: number;
  effectiveDailyLimit: number;
  isComplete: boolean;
  startedAt: Date;
  daysUntilNextStage: number | null;
  nextStage: (typeof WARMUP_SCHEDULE)[number] | null;
  stageLabel: string;
};

/** Calendar warmup day (1 = first day the inbox was connected). */
export function getWarmupDayNumber(startedAt: Date, now = new Date()): number {
  const start = new Date(startedAt);
  start.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, diffDays + 1);
}

/** Stage 1–5 from elapsed warmup days (automatic — not manual). */
export function getAutoWarmupStage(warmupDay: number): number {
  for (const entry of WARMUP_SCHEDULE) {
    const maxDay = entry.toDay ?? Infinity;
    if (warmupDay >= entry.fromDay && warmupDay <= maxDay) {
      return entry.stage;
    }
  }
  return WARMUP_SCHEDULE.length;
}

export function getWarmupDailyCap(stage: number): number {
  const idx = Math.min(
    Math.max(Math.floor(stage) - 1, 0),
    WARMUP_STAGE_LIMITS.length - 1,
  );
  return WARMUP_STAGE_LIMITS[idx];
}

export function getScheduleEntry(stage: number) {
  return WARMUP_SCHEDULE.find((s) => s.stage === stage) ?? WARMUP_SCHEDULE[4];
}

export function resolveWarmupContext(account: {
  dailyLimit: number;
  warmupEnabled: boolean;
  warmupStartedAt?: Date | null;
  createdAt: Date;
}): WarmupContext {
  const configured = account.dailyLimit || DEFAULT_INBOX_DAILY_LIMIT;
  const startedAt = account.warmupStartedAt ?? account.createdAt;

  if (!account.warmupEnabled) {
    return {
      enabled: false,
      warmupDay: 0,
      stage: 5,
      dailyCap: configured,
      effectiveDailyLimit: configured,
      isComplete: true,
      startedAt,
      daysUntilNextStage: null,
      nextStage: null,
      stageLabel: "Warmup disabled — full daily cap",
    };
  }

  const warmupDay = getWarmupDayNumber(startedAt);
  const stage = getAutoWarmupStage(warmupDay);
  const entry = getScheduleEntry(stage);
  const dailyCap = Math.min(configured, entry.dailyCap);
  const isComplete = stage >= 5 && warmupDay >= 22;

  let nextStage: (typeof WARMUP_SCHEDULE)[number] | null = null;
  let daysUntilNextStage: number | null = null;

  if (!isComplete && entry.toDay !== null) {
    nextStage = getScheduleEntry(stage + 1);
    daysUntilNextStage = Math.max(0, entry.toDay - warmupDay + 1);
  }

  return {
    enabled: true,
    warmupDay,
    stage,
    dailyCap: entry.dailyCap,
    effectiveDailyLimit: dailyCap,
    isComplete,
    startedAt,
    daysUntilNextStage,
    nextStage,
    stageLabel: `Stage ${stage} (${entry.label}): ${dailyCap}/day`,
  };
}

export function getEffectiveDailyLimit(account: {
  dailyLimit: number;
  warmupEnabled: boolean;
  warmupStartedAt?: Date | null;
  createdAt: Date;
  warmupStage?: number;
}): number {
  return resolveWarmupContext(account).effectiveDailyLimit;
}

export function getRandomCampaignDelayMs(minSec = 45, maxSec = 90): number {
  const seconds =
    Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
  return seconds * 1000;
}
