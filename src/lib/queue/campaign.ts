import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@/lib/prisma";
import { renderTemplateString, sendEmailMessage } from "@/lib/email/client";
import { renderTemplateBody, sendMessageViaSocket } from "@/lib/whatsapp/sender";

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

function resolveBodyParams(
  mapping: Record<string, string> | null | undefined,
  vars: Record<string, string>,
) {
  if (!mapping) return [];
  return Object.keys(mapping)
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => {
      const field = mapping[key];
      return vars[field] ?? field ?? "";
    });
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

  const channel = recipient.campaign.channel;
  const vars = contactVars(recipient.contact);

  if (channel === "WHATSAPP" && recipient.contact.optedOut) {
    await prisma.campaignRecipient.update({
      where: { id: recipientId },
      data: { status: "SKIPPED", errorMessage: "WhatsApp opted out" },
    });
    return;
  }

  if (channel === "EMAIL" && recipient.contact.emailOptedOut) {
    await prisma.campaignRecipient.update({
      where: { id: recipientId },
      data: { status: "SKIPPED", errorMessage: "Email opted out" },
    });
    return;
  }

  const mapping = recipient.campaign.variableMapping as
    | Record<string, string>
    | null
    | undefined;

  try {
    await prisma.campaignRecipient.update({
      where: { id: recipientId },
      data: { status: "QUEUED" },
    });

    let externalId: string | undefined;
    let subject: string | null = null;
    let preview = "";

    if (channel === "EMAIL") {
      if (!recipient.contact.email) {
        throw new Error("Contact has no email");
      }

      subject = renderTemplateString(
        recipient.campaign.template.subject || "Message from Dispatch",
        vars,
      );
      const html = renderTemplateString(
        recipient.campaign.template.body || "",
        vars,
      );
      preview = subject;

      const result = await sendEmailMessage({
        to: recipient.contact.email,
        subject,
        html,
      });
      externalId = result.messageId;
    } else {
      if (!recipient.contact.phone) {
        throw new Error("Contact has no phone number");
      }

      const bodyParams = resolveBodyParams(mapping, vars);
      const rendered = renderTemplateBody(
        recipient.campaign.template.body,
        vars,
        bodyParams,
      );

      const conv = await prisma.conversation.upsert({
        where: {
          contactId_channel: {
            contactId: recipient.contactId,
            channel,
          },
        },
        create: {
          contactId: recipient.contactId,
          channel,
          lastMessageAt: new Date(),
          lastMessagePreview: `Template: ${recipient.campaign.template.name}`,
        },
        update: {
          lastMessageAt: new Date(),
          lastMessagePreview: `Template: ${recipient.campaign.template.name}`,
        },
      });

      const message = await prisma.message.create({
        data: {
          conversationId: conv.id,
          contactId: recipient.contactId,
          campaignId,
          channel,
          direction: "OUTBOUND",
          type: "template",
          body: rendered,
          templateName: recipient.campaign.template.name,
          status: "PENDING",
        },
      });

      await sendMessageViaSocket(message.id);

      await prisma.campaignRecipient.update({
        where: { id: recipientId },
        data: { status: "SENT", messageId: message.id, sentAt: new Date() },
      });

      await prisma.campaign.update({
        where: { id: campaignId },
        data: { sentCount: { increment: 1 } },
      });

      await prisma.contact.update({
        where: { id: recipient.contactId },
        data: { lastMessageAt: new Date() },
      });
      return;
    }

    const conversation = await prisma.conversation.upsert({
      where: {
        contactId_channel: {
          contactId: recipient.contactId,
          channel,
        },
      },
      create: {
        contactId: recipient.contactId,
        channel,
        lastMessageAt: new Date(),
        lastMessagePreview: preview.slice(0, 140),
      },
      update: {
        lastMessageAt: new Date(),
        lastMessagePreview: preview.slice(0, 140),
      },
    });

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        contactId: recipient.contactId,
        campaignId,
        channel,
        direction: "OUTBOUND",
        type: channel === "EMAIL" ? "email" : "template",
        subject,
        body: recipient.campaign.template.body,
        templateName: recipient.campaign.template.name,
        metaMessageId: externalId,
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
  const limiter = Math.max(1, campaign.rateLimitPerSecond);

  const jobs = campaign.recipients.map((r, index) => ({
    name: "send",
    data: { campaignId, recipientId: r.id } satisfies CampaignJobData,
    opts: {
      delay: Math.floor(index / limiter) * 1000,
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
      concurrency: 5,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`Campaign job ${job?.id} failed:`, err.message);
  });

  console.log("Campaign worker started");
  return worker;
}
