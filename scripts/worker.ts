import { ensureDbSchema } from "../src/lib/prisma";
import { startCampaignWorker, processScheduledCampaigns } from "../src/lib/queue/campaign";
import { checkDailyReset } from "../src/lib/email/rotator";
import { pollBounceMailboxOnce } from "../src/lib/email/bounce-poller";
import {
  startAllInboxIdleWatchers,
  syncAllInboxesOnce,
} from "../src/lib/email/inbox-poller";
import { syncWarmupStages } from "../src/lib/email/warmup-sync";

async function bootWorker() {
  console.log("Starting DEVSYNX Email Outreach Worker…");
  await ensureDbSchema();
  startCampaignWorker();
  await checkDailyReset();
  await syncWarmupStages();

  setInterval(() => {
    void checkDailyReset();
    void syncWarmupStages();
  }, 3600_000);

  setInterval(() => {
    void processScheduledCampaigns();
  }, 60_000);
  void processScheduledCampaigns();

  setInterval(() => {
    void pollBounceMailboxOnce();
  }, 300_000);
  void pollBounceMailboxOnce();
  console.log("Bounce poller enabled (uses mailboxes from database)");

  void syncAllInboxesOnce();
  void startAllInboxIdleWatchers();
  setInterval(() => {
    void syncAllInboxesOnce();
  }, 120_000);
  console.log("Inbox sync enabled (IMAP IDLE + 2min fallback poll)");

  console.log("Worker ready — campaign queue + scheduler active");
}

bootWorker().catch((err) => {
  console.error("Worker boot failed:", err);
  process.exit(1);
});
