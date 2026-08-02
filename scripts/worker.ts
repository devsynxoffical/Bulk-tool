import { startCampaignWorker } from "../src/lib/queue/campaign";
import { startSendWorker } from "../src/lib/queue/whatsapp";
import { startControlWorker } from "../src/lib/queue/whatsapp-control";
import { start } from "../src/lib/whatsapp/session";

console.log("Starting Dispatch worker…");
start();
startCampaignWorker();
startSendWorker();
startControlWorker();

// Keep process alive
setInterval(() => {}, 60_000);
