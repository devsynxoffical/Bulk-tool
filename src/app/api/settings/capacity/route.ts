import { NextRequest, NextResponse } from "next/server";
import { requireSession, ownerScope } from "@/lib/api";
import { getSendingCapacityStats } from "@/lib/email/rotator";
import { getBounceStats } from "@/lib/email/bounce-handler";
import { checkSmtpRelayHealth, isSmtpRelayEnabled } from "@/lib/email/smtp-relay-client";
import {
  RECOMMENDED_DOMAIN_COUNT,
  RECOMMENDED_INBOX_COUNT,
  SYSTEM_DAILY_TARGET,
  WORKER_CONCURRENCY,
} from "@/lib/email/constants";

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error || !session) return error;

  const filterUserId = req.nextUrl.searchParams.get("userId");
  const scope = ownerScope(session, filterUserId);
  // Agents: own stats. Admin with ?userId=: that user. Admin without: all (undefined).
  const ownerId = scope.ownerId;

  const [stats, bounces, relay] = await Promise.all([
    getSendingCapacityStats(ownerId),
    getBounceStats(1, ownerId),
    isSmtpRelayEnabled() ? checkSmtpRelayHealth() : Promise.resolve(null),
  ]);

  const sentToday = stats.inboxSentToday || 1;
  const bounceRate = bounces.recent / Math.max(sentToday, 1);

  return NextResponse.json({
    ...stats,
    systemDailyTarget: SYSTEM_DAILY_TARGET,
    recommendedInboxCount: RECOMMENDED_INBOX_COUNT,
    recommendedDomainCount: RECOMMENDED_DOMAIN_COUNT,
    workerConcurrency: WORKER_CONCURRENCY,
    bouncesToday: bounces.recent,
    bounceRate: Math.round(bounceRate * 1000) / 10,
    throttled: bounceRate >= 0.025,
    smtpRelayEnabled: isSmtpRelayEnabled(),
    smtpRelay: relay,
    readyFor5k:
      stats.inboxCapacityToday >= SYSTEM_DAILY_TARGET &&
      stats.verifiedDomains >= RECOMMENDED_DOMAIN_COUNT,
  });
}
