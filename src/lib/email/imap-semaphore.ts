/**
 * Cap concurrent IMAP sockets so cPanel/Dovecot
 * `mail_max_userip_connections` (often 32) is not exceeded.
 * Idle watchers + bounce polls + multi-mailbox sync otherwise open too many at once.
 */

const MAX_GLOBAL = Math.max(
  1,
  Number(process.env.IMAP_MAX_CONNECTIONS || 3),
);
const MAX_PER_HOST = Math.max(
  1,
  Number(process.env.IMAP_MAX_PER_HOST || 1),
);

let globalActive = 0;
const hostActive = new Map<string, number>();
type Waiter = { host: string; resolve: () => void };
const waitQueue: Waiter[] = [];

function normalizeHost(host: string) {
  return host.trim().toLowerCase();
}

function canAcquire(host: string): boolean {
  const h = normalizeHost(host);
  if (globalActive >= MAX_GLOBAL) return false;
  if ((hostActive.get(h) || 0) >= MAX_PER_HOST) return false;
  return true;
}

function wakeWaiters() {
  for (let i = 0; i < waitQueue.length; i++) {
    const w = waitQueue[i]!;
    if (!canAcquire(w.host)) continue;
    waitQueue.splice(i, 1);
    w.resolve();
    return;
  }
}

async function acquire(host: string): Promise<void> {
  if (canAcquire(host)) {
    const h = normalizeHost(host);
    globalActive += 1;
    hostActive.set(h, (hostActive.get(h) || 0) + 1);
    return;
  }
  await new Promise<void>((resolve) => {
    waitQueue.push({ host, resolve });
  });
  // Recurse after wake — another waiter may have sniped the slot
  return acquire(host);
}

function release(host: string) {
  const h = normalizeHost(host);
  globalActive = Math.max(0, globalActive - 1);
  const n = (hostActive.get(h) || 1) - 1;
  if (n <= 0) hostActive.delete(h);
  else hostActive.set(h, n);
  wakeWaiters();
}

/** Run `fn` while holding one IMAP connection slot for `host`. */
export async function withImapSlot<T>(
  host: string,
  fn: () => Promise<T>,
): Promise<T> {
  await acquire(host);
  try {
    return await fn();
  } finally {
    release(host);
  }
}

export function isImapConnectionLimitError(message: string): boolean {
  return /mail_max_userip_connections|maximum number of connections|userip_connections/i.test(
    message,
  );
}

/** Shorter message for UI / DB. */
export function friendlyImapError(raw: string): string {
  if (isImapConnectionLimitError(raw)) {
    return "IMAP connection limit on mail server — sync will retry with fewer connections.";
  }
  return raw.slice(0, 500);
}

export function imapSlotLimits() {
  return { maxGlobal: MAX_GLOBAL, maxPerHost: MAX_PER_HOST };
}
