import { startCampaignWorker } from "../src/lib/queue/campaign";
import { checkDailyReset } from "../src/lib/email/rotator";

console.log("Starting DEVSYNX Email Outreach Worker…");
startCampaignWorker();

// Periodically check daily limit counter resets every hour
setInterval(() => {
  void checkDailyReset();
}, 3600_000);

// Keep worker process alive
setInterval(() => {}, 60_000);
