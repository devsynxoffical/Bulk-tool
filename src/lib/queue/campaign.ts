import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@/lib/prisma";
import { renderTemplateString, sendEmailMessage } from "@/lib/email/client";
import { getNextSendingInbox } from "@/lib/email/rotator";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let connection: IORedis | null = null;
let campaignQueue: Queue | null = null;

function getConnection() {
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

export function getCampaignQueue() {
  if (!campaignQueue) {
    campaignQueue = new Queue("campaign-messages", {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }
  return campaignQueue;
}

export type CampaignJobData = {
  campaignId: string;
  recipientId: string;
};

function contactVars(contact: {
  name: string | null;
  phone: string | null;
  email: string | null;
  customFields: unknown;
}) {
  const custom =
    contact.customFields && typeof contact.customFields === "object"
      ? (contact.customFields as Record<string, string>)
      : {};

  return {
    name: contact.name || "",
    phone: contact.phone || "",
    email: contact.email || "",
    ...custom,
  };
}

export async function processCampaignJob(job: Job<CampaignJobData>) {
  const { campaignId, recipientId } = job.data;

  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: recipientId },
    include: {
      contact: true,
      campaign: { include: { template: true } },
    },
  });

  if (!recipient) return;
  if (
    recipient.campaign.status === "PAUSED" ||
    recipient.campaign.status === "CANCELLED"
  ) {
    return;
  }

  const vars = contactVars(recipient.contact);

  if (recipient.contact.emailOptedOut) {
    await prisma.campaignRecipient.update({
      where: { id: recipientId },
      data: { status: "SKIPPED", errorMessage: "Recipient opted out of email" },
    });
    return;
  }

  if (!recipient.contact.email) {
    await prisma.campaignRecipient.update({
      where: { id: recipientId },
      data: { status: "SKIPPED", errorMessage: "Contact has no email address" },
    });
    return;
  }

  try {
    await prisma.campaignRecipient.update({
      where: { id: recipientId },
      data: { status: "QUEUED" },
    });

    const subject = renderTemplateString(
      recipient.campaign.template.subject || "Outreach Message",
      vars,
    );
    const html = renderTemplateString(
      recipient.campaign.template.body || "",
      vars,
    );

    // Get healthiest sending mailbox via round-robin
    const sendingInbox = await getNextSendingInbox();

    const result = await sendEmailMessage({
      to: recipient.contact.email,
      subject,
      html,
      pdfUrl: recipient.campaign.template.pdfUrl || undefined,
      trackingId: recipientId,
      account: sendingInbox || undefined,
    });

    const conversation = await prisma.conversation.upsert({
      where: {
        contactId_channel: {
          contactId: recipient.contactId,
          channel: "EMAIL",
        },
      },
      create: {
        contactId: recipient.contactId,
        channel: "EMAIL",
        lastMessageAt: new Date(),
        lastMessagePreview: subject.slice(0, 140),
      },
      update: {
        lastMessageAt: new Date(),
        lastMessagePreview: subject.slice(0, 140),
      },
    });

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        contactId: recipient.contactId,
        campaignId,
        channel: "EMAIL",
        direction: "OUTBOUND",
        type: "email",
        subject,
        body: html,
        templateName: recipient.campaign.template.name,
        metaMessageId: result.messageId,
        status: "SENT",
      },
    });

    await prisma.campaignRecipient.update({
      where: { id: recipientId },
      data: {
        status: "SENT",
        messageId: message.id,
        sentAt: new Date(),
      },
    });

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { sentCount: { increment: 1 } },
    });

    await prisma.contact.update({
      where: { id: recipient.contactId },
      data: { lastMessageAt: new Date() },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Send failed";
    await prisma.campaignRecipient.update({
      where: { id: recipientId },
      data: { status: "FAILED", errorMessage: message },
    });
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { failedCount: { increment: 1 } },
    });
    throw error;
  } finally {
    await maybeCompleteCampaign(campaignId);
  }
}

async function maybeCompleteCampaign(campaignId: string) {
  const pending = await prisma.campaignRecipient.count({
    where: {
      campaignId,
      status: { in: ["PENDING", "QUEUED"] },
    },
  });

  if (pending === 0) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    if (campaign && campaign.status === "RUNNING") {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    }
  }
}

export async function enqueueCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { recipients: { where: { status: "PENDING" } } },
  });
  if (!campaign) throw new Error("Campaign not found");

  const queue = getCampaignQueue();
  // Staggered humanized delay interval: ~3 to 8 seconds per message
  const delayStepMs = Math.max(2000, 5000 / Math.max(1, campaign.rateLimitPerSecond));

  const jobs = campaign.recipients.map((r, index) => ({
    name: "send",
    data: { campaignId, recipientId: r.id } satisfies CampaignJobData,
    opts: {
      delay: index * delayStepMs,
      jobId: `${campaignId}-${r.id}`,
    },
  }));

  if (jobs.length) {
    await queue.addBulk(jobs);
  }

  return jobs.length;
}

let workerStarted = false;

export function startCampaignWorker() {
  if (workerStarted) return;
  workerStarted = true;

  const worker = new Worker<CampaignJobData>(
    "campaign-messages",
    async (job) => processCampaignJob(job),
    {
      connection: getConnection(),
      concurrency: 3,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`Campaign job ${job?.id} failed:`, err.message);
  });

  console.log("Campaign worker started");
  return worker;
}
