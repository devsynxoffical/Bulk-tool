import { ensureDbSchema } from "../src/lib/prisma";
import { startCampaignWorker, processScheduledCampaigns } from "../src/lib/queue/campaign";
import { checkDailyReset } from "../src/lib/email/rotator";
import { pollBounceMailboxOnce } from "../src/lib/email/bounce-poller";
import {
  startAllInboxIdleWatchers,
  syncAllInboxesOnce,
} from "../src/lib/email/inbox-poller";
import { syncWarmupStages } from "../src/lib/email/warmup-sync";
import { autoResumePausedMailboxes } from "../src/lib/email/health";

async function bootWorker() {
  console.log("Starting DEVSYNX Email Outreach Worker…");
  await ensureDbSchema();
  startCampaignWorker();
  await checkDailyReset();
  await syncWarmupStages();
  try {
    await autoResumePausedMailboxes();
  } catch (e) {
    console.warn("Auto-resume skipped:", e instanceof Error ? e.message : e);
  }

  setInterval(() => {
    void checkDailyReset();
    void syncWarmupStages();
    void autoResumePausedMailboxes().catch((e) =>
      console.warn("Auto-resume skipped:", e instanceof Error ? e.message : e),
    );
  }, 3600_000);

  setInterval(() => {
    void processScheduledCampaigns();
  }, 60_000);
  void processScheduledCampaigns();

  // Bounce DSN handling runs inside inbox sync. Optional duplicate IMAP poll:
  // set BOUNCE_IMAP_POLL=true (uses shared connection semaphore).
  setInterval(() => {
    void pollBounceMailboxOnce();
  }, 300_000);
  void pollBounceMailboxOnce();
  console.log(
    process.env.BOUNCE_IMAP_POLL === "true"
      ? "Bounce IMAP poll enabled"
      : "Bounce IMAP poll off (bounces handled by inbox sync)",
  );

  // Poll-only by default — persistent IDLE × N mailboxes exceeds cPanel's
  // mail_max_userip_connections (~32). Opt in with IMAP_IDLE=true.
  void syncAllInboxesOnce();
  void startAllInboxIdleWatchers();
  setInterval(() => {
    void syncAllInboxesOnce();
  }, 120_000);
  console.log("Inbox sync enabled (staggered poll every 2min)");

  console.log("Worker ready — campaign queue + scheduler active");
}

bootWorker().catch((err) => {
  console.error("Worker boot failed:", err);
  process.exit(1);
});
