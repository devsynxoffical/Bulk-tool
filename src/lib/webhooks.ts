import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";
import type { MetaWebhookPayload } from "@/lib/meta/types";

const OPT_OUT_KEYWORDS = ["stop", "unsubscribe", "optout", "opt-out", "cancel"];

export async function handleWhatsAppWebhook(payload: MetaWebhookPayload) {
  if (payload.object !== "whatsapp_business_account") return;

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== "messages") continue;
      const value = change.value;

      for (const status of value.statuses || []) {
        await handleStatusUpdate(status);
      }

      for (const message of value.messages || []) {
        const contactProfile = value.contacts?.find((c) => c.wa_id === message.from);
        await handleInboundMessage(message, contactProfile?.profile?.name);
      }
    }
  }
}

async function handleStatusUpdate(status: {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string; message?: string }>;
}) {
  const message = await prisma.message.findUnique({
    where: { metaMessageId: status.id },
  });
  if (!message) return;

  const statusMap = {
    sent: "SENT",
    delivered: "DELIVERED",
    read: "READ",
    failed: "FAILED",
  } as const;

  const next = statusMap[status.status];
  await prisma.message.update({
    where: { id: message.id },
    data: {
      status: next,
      errorCode: status.errors?.[0]?.code?.toString(),
      errorMessage: status.errors?.[0]?.message || status.errors?.[0]?.title,
    },
  });

  if (message.campaignId) {
    const recipient = await prisma.campaignRecipient.findFirst({
      where: { messageId: message.id },
    });

    if (recipient) {
      const data: {
        status: "SENT" | "DELIVERED" | "READ" | "FAILED";
        deliveredAt?: Date;
        readAt?: Date;
        errorMessage?: string;
      } = { status: next };

      if (status.status === "delivered") data.deliveredAt = new Date();
      if (status.status === "read") data.readAt = new Date();
      if (status.status === "failed") {
        data.errorMessage =
          status.errors?.[0]?.message || status.errors?.[0]?.title;
      }

      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data,
      });

      if (
        status.status === "delivered" &&
        recipient.status !== "DELIVERED" &&
        recipient.status !== "READ"
      ) {
        await prisma.campaign.update({
          where: { id: message.campaignId },
          data: { deliveredCount: { increment: 1 } },
        });
      }
      if (status.status === "read" && recipient.status !== "READ") {
        await prisma.campaign.update({
          where: { id: message.campaignId },
          data: {
            readCount: { increment: 1 },
            ...(recipient.status !== "DELIVERED"
              ? { deliveredCount: { increment: 1 } }
              : {}),
          },
        });
      }
    }
  }
}

async function handleInboundMessage(
  message: {
    from: string;
    id: string;
    timestamp: string;
    type: string;
    text?: { body: string };
    button?: { text: string; payload: string };
    interactive?: {
      button_reply?: { title: string };
      list_reply?: { title: string };
    };
  },
  profileName?: string,
) {
  const existing = await prisma.message.findUnique({
    where: { metaMessageId: message.id },
  });
  if (existing) return;

  const phone = normalizePhone(message.from);
  let contact = await prisma.contact.findUnique({ where: { phone } });
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        phone,
        name: profileName || null,
      },
    });
  } else if (profileName && !contact.name) {
    contact = await prisma.contact.update({
      where: { id: contact.id },
      data: { name: profileName },
    });
  }

  const body =
    message.text?.body ||
    message.button?.text ||
    message.interactive?.button_reply?.title ||
    message.interactive?.list_reply?.title ||
    `[${message.type}]`;

  if (OPT_OUT_KEYWORDS.includes(body.trim().toLowerCase())) {
    await prisma.contact.update({
      where: { id: contact.id },
      data: { optedOut: true },
    });
  }

  const windowExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const conversation = await prisma.conversation.upsert({
    where: {
      contactId_channel: { contactId: contact.id, channel: "WHATSAPP" },
    },
    create: {
      contactId: contact.id,
      channel: "WHATSAPP",
      lastMessageAt: new Date(),
      lastMessagePreview: body.slice(0, 140),
      unreadCount: 1,
      windowExpiresAt,
      status: "OPEN",
    },
    update: {
      lastMessageAt: new Date(),
      lastMessagePreview: body.slice(0, 140),
      unreadCount: { increment: 1 },
      windowExpiresAt,
      status: "OPEN",
    },
  });

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      contactId: contact.id,
      channel: "WHATSAPP",
      direction: "INBOUND",
      type: message.type,
      body,
      metaMessageId: message.id,
      status: "DELIVERED",
    },
  });

  await prisma.contact.update({
    where: { id: contact.id },
    data: { lastMessageAt: new Date() },
  });
}
