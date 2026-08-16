import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@/lib/prisma";
import { sendMessageViaSocket } from "@/lib/whatsapp/sender";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let connection: IORedis | null = null;

export function getConnection() {
  if (!connection) {
    connection = new IORedis(REDIS_URL, {
      family: 0,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    connection.on("error", (err) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Redis connection warning:", err.message);
      }
    });
  }
  return connection;
}

let sendQueue: Queue | null = null;

function getSendQueue() {
  if (!sendQueue) {
    sendQueue = new Queue("message-sends", {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }
  return sendQueue;
}

let controlQueue: Queue | null = null;

function getControlQueue() {
  if (!controlQueue) {
    controlQueue = new Queue("whatsapp-control", {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      },
    });
  }
  return controlQueue;
}

export async function enqueueSendMessage(messageId: string) {
  await getSendQueue().add(
    "send",
    { messageId },
    { jobId: `send-${messageId}` },
  );
}

export async function enqueueLogout() {
  await getControlQueue().add("logout", {}, { jobId: "logout" });
}

let sendWorkerStarted = false;

export function startSendWorker() {
  if (sendWorkerStarted) return;
  sendWorkerStarted = true;

  const worker = new Worker<{ messageId: string }>(
    "message-sends",
    async (job) => {
      await sendMessageViaSocket(job.data.messageId);
    },
    {
      connection: getConnection(),
      concurrency: 1,
    },
  );

  worker.on("failed", async (job, err) => {
    const messageId = job?.data?.messageId;
    if (messageId) {
      await prisma.message
        .updateMany({
          where: { id: messageId, status: "PENDING" },
          data: { status: "FAILED", errorMessage: err.message },
        })
        .catch(() => undefined);
    }
  });

  worker.on("completed", (job) => {
    console.log(`WhatsApp message ${job.data.messageId} sent`);
  });

  console.log("WhatsApp send worker started");
  return worker;
}
