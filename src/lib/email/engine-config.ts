import { prisma, ensureDbSchema } from "@/lib/prisma";
import {
  DEFAULT_WARMUP_MAX_STAGE,
  INBOX_HOURLY_CAP,
} from "@/lib/email/constants";

export type EnginePacingConfig = {
  warmupMaxStage: number;
  inboxHourlyCap: number;
  /** Manual min seconds between sends; null = derive from hourly cap. */
  inboxIntervalSec: number | null;
};

const DEFAULTS: EnginePacingConfig = {
  warmupMaxStage: DEFAULT_WARMUP_MAX_STAGE,
  inboxHourlyCap: INBOX_HOURLY_CAP,
  inboxIntervalSec: null,
};

let cache: { value: EnginePacingConfig; at: number } | null = null;
const CACHE_MS = 15_000;

function clampStage(n: number) {
  return Math.min(5, Math.max(1, Math.round(n)));
}

function clampHourly(n: number) {
  return Math.min(250, Math.max(1, Math.round(n)));
}

function clampInterval(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.min(3600, Math.max(30, Math.round(n)));
}

export async function getEngineConfig(): Promise<EnginePacingConfig> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  await ensureDbSchema();

  try {
    const row = await prisma.engineConfig.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        warmupMaxStage: DEFAULTS.warmupMaxStage,
        inboxHourlyCap: DEFAULTS.inboxHourlyCap,
        inboxIntervalSec: null,
      },
      update: {},
    });

    const value: EnginePacingConfig = {
      warmupMaxStage: clampStage(row.warmupMaxStage),
      inboxHourlyCap: clampHourly(row.inboxHourlyCap),
      inboxIntervalSec: clampInterval(row.inboxIntervalSec),
    };
    cache = { value, at: Date.now() };
    return value;
  } catch {
    return DEFAULTS;
  }
}

export async function updateEngineConfig(
  patch: Partial<EnginePacingConfig>,
): Promise<EnginePacingConfig> {
  await ensureDbSchema();

  const data: {
    warmupMaxStage?: number;
    inboxHourlyCap?: number;
    inboxIntervalSec?: number | null;
  } = {};

  if (patch.warmupMaxStage != null) {
    data.warmupMaxStage = clampStage(patch.warmupMaxStage);
  }
  if (patch.inboxHourlyCap != null) {
    data.inboxHourlyCap = clampHourly(patch.inboxHourlyCap);
  }
  if (patch.inboxIntervalSec !== undefined) {
    data.inboxIntervalSec = clampInterval(patch.inboxIntervalSec);
  }

  const row = await prisma.engineConfig.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      warmupMaxStage: data.warmupMaxStage ?? DEFAULTS.warmupMaxStage,
      inboxHourlyCap: data.inboxHourlyCap ?? DEFAULTS.inboxHourlyCap,
      inboxIntervalSec: data.inboxIntervalSec ?? null,
    },
    update: data,
  });

  const value: EnginePacingConfig = {
    warmupMaxStage: clampStage(row.warmupMaxStage),
    inboxHourlyCap: clampHourly(row.inboxHourlyCap),
    inboxIntervalSec: clampInterval(row.inboxIntervalSec),
  };
  cache = { value, at: Date.now() };
  return value;
}

/** Effective hourly cap for a mailbox (per-mailbox override or engine default). */
export function resolveHourlyCap(
  mailboxHourlyCap: number | null | undefined,
  engine: EnginePacingConfig,
): number {
  if (mailboxHourlyCap != null && mailboxHourlyCap > 0) {
    return clampHourly(mailboxHourlyCap);
  }
  return engine.inboxHourlyCap;
}

/** Effective warmup max stage for a mailbox. */
export function resolveWarmupMaxStage(
  mailboxMax: number | null | undefined,
  engine: EnginePacingConfig,
): number {
  if (mailboxMax != null && mailboxMax >= 1) {
    return clampStage(mailboxMax);
  }
  return engine.warmupMaxStage;
}

/**
 * Cooldown seconds between sends on one inbox.
 * Priority: mailbox override → engine manual interval → auto from hourly cap.
 */
export function resolveSendIntervalSec(
  mailboxIntervalSec: number | null | undefined,
  engine: EnginePacingConfig,
  hourlyCap: number,
): number {
  if (mailboxIntervalSec != null && mailboxIntervalSec >= 30) {
    return Math.min(3600, mailboxIntervalSec);
  }
  if (engine.inboxIntervalSec != null) {
    return engine.inboxIntervalSec;
  }
  // Spread hourly cap evenly (6/hour → ~600s)
  return Math.max(45, Math.floor(3600 / Math.max(hourlyCap, 1)));
}

export function invalidateEngineConfigCache() {
  cache = null;
}
