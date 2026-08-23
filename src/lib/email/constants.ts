/** System-wide daily send target (5k/day cold outreach). */
export const SYSTEM_DAILY_TARGET = 5000;

/** Recommended per-inbox daily cap at full warmup. */
export const DEFAULT_INBOX_DAILY_LIMIT = 250;

/** Recommended per-domain daily cap (≈4 inboxes × 250). */
export const DEFAULT_DOMAIN_DAILY_LIMIT = 1000;

/** Minimum seconds between sends from the same inbox (floor). */
export const MIN_INBOX_INTERVAL_SEC = 45;

/** Max seconds between sends from the same inbox — daily cap is the real limit. */
export const MAX_INBOX_COOLDOWN_SEC = 180;

/** Parallel campaign workers (one send per inbox slot). */
export const WORKER_CONCURRENCY = 4;

/** Seconds in a sending day for spread calculations. */
export const SENDING_DAY_SECONDS = 86400;

/** Bounce rate above this pauses an inbox automatically. */
export const BOUNCE_RATE_PAUSE_THRESHOLD = 0.05;

/** Health score penalty per hard bounce. */
export const HEALTH_PENALTY_PER_BOUNCE = 15;

/** Soft-cap health on SMTP auth failure (535) — no longer stacks forever. */
export const HEALTH_PENALTY_AUTH_FAILURE = 70;

/**
 * Open rate that maps to 100 health (cold email: ~20% open is excellent).
 * health = min(100, round((openRate / TARGET) * 100))
 */
export const OPEN_RATE_HEALTH_TARGET = 0.2;

/** Minimum sends before open-rate health replaces the default score. */
export const OPEN_RATE_MIN_SAMPLE = 10;

/** Lookback window (days) for open-rate health. */
export const OPEN_RATE_LOOKBACK_DAYS = 30;

/** Minimum seconds between campaign job enqueue (stagger worker pickup). */
export const JOB_STAGGER_MIN_SEC = 3;

/** Maximum seconds between campaign job enqueue. */
export const JOB_STAGGER_MAX_SEC = 8;

/** @deprecated Use per-inbox cooldown instead; kept for jitter helper */
export const CAMPAIGN_SEND_DELAY_MIN_SEC = JOB_STAGGER_MIN_SEC;

/** @deprecated Use per-inbox cooldown instead */
export const CAMPAIGN_SEND_DELAY_MAX_SEC = JOB_STAGGER_MAX_SEC;

/** Inboxes needed at 250/day each to hit 5k. */
export const RECOMMENDED_INBOX_COUNT = Math.ceil(
  SYSTEM_DAILY_TARGET / DEFAULT_INBOX_DAILY_LIMIT,
);

/** Domains needed at 1000/day each to hit 5k. */
export const RECOMMENDED_DOMAIN_COUNT = Math.ceil(
  SYSTEM_DAILY_TARGET / DEFAULT_DOMAIN_DAILY_LIMIT,
);

export function extractDomainFromEmail(email: string): string | null {
  const part = email.trim().toLowerCase().split("@")[1];
  return part || null;
}

export function buildSpfRecordHint(_domainName: string, _mxHost?: string): string {
  // Standard cPanel / shared-hosting SPF when mail sends from the domain's A/MX records
  return "v=spf1 a mx ~all";
}
