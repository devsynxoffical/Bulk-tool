import { startCampaignWorker, processScheduledCampaigns } from "../src/lib/queue/campaign";
import { checkDailyReset } from "../src/lib/email/rotator";
import { pollBounceMailboxOnce } from "../src/lib/email/bounce-poller";
import { syncWarmupStages } from "../src/lib/email/warmup-sync";

console.log("Starting DEVSYNX Email Outreach Worker…");
startCampaignWorker();

void checkDailyReset();
void syncWarmupStages();

// Hourly daily-limit reset + warmup stage sync
setInterval(() => {
  void checkDailyReset();
  void syncWarmupStages();
}, 3600_000);

// Scheduled campaign launcher (every minute)
setInterval(() => {
  void processScheduledCampaigns();
}, 60_000);
void processScheduledCampaigns();

// IMAP bounce mailbox poll (every 5 minutes when configured)
if (process.env.BOUNCE_IMAP_HOST) {
  setInterval(() => {
    void pollBounceMailboxOnce();
  }, 300_000);
  void pollBounceMailboxOnce();
  console.log("Bounce IMAP poller enabled");
}

console.log("Worker ready — campaign queue + scheduler active");
