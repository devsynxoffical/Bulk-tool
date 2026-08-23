import { DelayedError, Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@/lib/prisma";
import { renderTemplateString, sendEmailMessage } from "@/lib/email/client";
import {
  isLikelySmtpBounce,
  recordBounce,
} from "@/lib/email/bounce-handler";
import {
  computeSpreadDelayMs,
  getThrottleDelayMs,
} from "@/lib/email/throttle";
import {
  HEALTH_PENALTY_AUTH_FAILURE,
  WORKER_CONCURRENCY,
} from "@/lib/email/constants";
import {
  checkDailyReset,
  getMsUntilInboxAvailable,
  getNextSendingInbox,
} from "@/lib/email/rotator";

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
        attempts: 5,
        backoff: { type: "exponential", delay: 5000 },
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
    name: contact.name || "there",
    phone: contact.phone || "",
    email: contact.email || "",
    company:
      custom.company ||
      custom.Company ||
      custom.AgencyName ||
      contact.name ||
      "your business",
    city: custom.city || custom.City || custom.location || "your area",
    location: custom.location || custom.city || custom.City || "your area",
    FirstName: contact.name || "there",
    AgencyName:
      custom.company ||
      custom.Company ||
      custom.AgencyName ||
      contact.name ||
      "your business",
    City: custom.city || custom.City || custom.location || "your area",
    ...custom,
  };
}

function isSmtpAuthFailure(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("535") ||
    m.includes("incorrect authentication") ||
    m.includes("authentication failed") ||
    m.includes("invalid login") ||
    m.includes("username and password not accepted") ||
    m.includes("authentication credentials invalid")
  );
}

export async function processCampaignJob(
  job: Job<CampaignJobData>,
  token?: string,
) {
  await checkDailyReset();

  const throttleMs = await getThrottleDelayMs();
  if (throttleMs > 0) {
    await new Promise((r) => setTimeout(r, throttleMs));
  }

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

  // BullMQ retries — don't re-send or double-count terminal recipients
  if (["SENT", "DELIVERED", "READ", "FAILED", "SKIPPED"].includes(recipient.status)) {
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

  if (recipient.contact.email) {
    const suppressed = await prisma.suppressionList.findUnique({
      where: { email: recipient.contact.email.toLowerCase() },
    });
    if (suppressed) {
      await prisma.campaignRecipient.update({
        where: { id: recipientId },
        data: {
          status: "SKIPPED",
          errorMessage: `Suppressed (${suppressed.reason})`,
        },
      });
      return;
    }
  }

  const sendingInbox = await getNextSendingInbox();
  if (!sendingInbox) {
    const waitMs = await getMsUntilInboxAvailable();
    await job.moveToDelayed(Date.now() + waitMs, token ?? job.token);
    throw new DelayedError("No sending inbox available");
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

    const result = await sendEmailMessage({
      to: recipient.contact.email,
      subject,
      html,
      pdfUrl: recipient.campaign.template.pdfUrl || undefined,
      trackingId: recipientId,
      account: sendingInbox,
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

    // Wrong mailbox password — skip this inbox, retry lead on a different mailbox
    if (isSmtpAuthFailure(message)) {
      try {
        await prisma.emailAccount.update({
          where: { id: sendingInbox.id },
          data: {
            healthScore: { decrement: HEALTH_PENALTY_AUTH_FAILURE },
          },
        });
      } catch {
        /* non-fatal */
      }
      await prisma.campaignRecipient.update({
        where: { id: recipientId },
        data: {
          status: "PENDING",
          errorMessage: `Inbox login failed (${sendingInbox.fromEmail}) — will retry another mailbox`,
        },
      });
      console.warn(
        `SMTP auth failed for ${sendingInbox.fromEmail} — inbox penalized, recipient re-queued`,
      );
      await job.moveToDelayed(Date.now() + 60_000, token ?? job.token);
      throw new DelayedError(
        `SMTP auth failed for ${sendingInbox.fromEmail} — retry another mailbox`,
      );
    }

    if (recipient.contact.email && isLikelySmtpBounce(message)) {
      await recordBounce({
        email: recipient.contact.email,
        inboxId: sendingInbox.id,
        reason: "HARD_BOUNCE",
        raw: message,
        contactId: recipient.contactId,
      });
      await prisma.campaignRecipient.update({
        where: { id: recipientId },
        data: { status: "FAILED", errorMessage: `Bounced: ${message}` },
      });
    } else {
      await prisma.campaignRecipient.update({
        where: { id: recipientId },
        data: { status: "FAILED", errorMessage: message },
      });
    }

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
  const total = campaign.recipients.length;

  const jobs = campaign.recipients.map((r, index) => ({
    name: "send",
    data: { campaignId, recipientId: r.id } satisfies CampaignJobData,
    opts: {
      delay: computeSpreadDelayMs(index, total, WORKER_CONCURRENCY),
      jobId: `${campaignId}-${r.id}`,
    },
  }));

  if (jobs.length) {
    await queue.addBulk(jobs);
  }

  return jobs.length;
}

/** Launch campaigns whose scheduledAt has passed. */
export async function processScheduledCampaigns() {
  const due = await prisma.campaign.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: new Date() },
    },
  });

  for (const campaign of due) {
    try {
      startCampaignWorker();
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "RUNNING", startedAt: new Date() },
      });
      await enqueueCampaign(campaign.id);
      console.log(`Scheduled campaign launched: ${campaign.name}`);
    } catch (e) {
      console.error(`Failed to launch scheduled campaign ${campaign.id}:`, e);
    }
  }
}

let workerStarted = false;

export function startCampaignWorker() {
  if (workerStarted) return;
  workerStarted = true;

  const worker = new Worker<CampaignJobData>(
    "campaign-messages",
    async (job, token) => processCampaignJob(job, token),
    {
      connection: getConnection(),
      concurrency: WORKER_CONCURRENCY,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`Campaign job ${job?.id} failed:`, err.message);
  });

  console.log(
    `Campaign worker started (concurrency: ${WORKER_CONCURRENCY}, 5k/day spread pacing)`,
  );
  return worker;
}
