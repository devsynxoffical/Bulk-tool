import { Worker } from "bullmq";
import { getConnection } from "@/lib/queue/whatsapp";
import { logoutSession } from "@/lib/whatsapp/session";

let controlWorkerStarted = false;

export function startControlWorker() {
  if (controlWorkerStarted) return;
  controlWorkerStarted = true;

  const worker = new Worker<Record<string, never>>(
    "whatsapp-control",
    async (job) => {
      if (job.name === "logout") {
        await logoutSession();
      }
    },
    {
      connection: getConnection(),
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`WhatsApp control job ${job?.id} failed:`, err.message);
  });

  console.log("WhatsApp control worker started");
  return worker;
}
