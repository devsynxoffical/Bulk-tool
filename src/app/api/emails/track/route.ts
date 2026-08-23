import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recalculateInboxHealth } from "@/lib/email/health";

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

async function refreshInboxHealth(inboxId: string | null | undefined) {
  if (!inboxId) return;
  try {
    await recalculateInboxHealth(inboxId);
  } catch (e) {
    console.warn("Open-rate health refresh failed:", e);
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get("id");

  if (messageId) {
    try {
      const message = await prisma.message.findFirst({
        where: {
          OR: [{ id: messageId }, { metaMessageId: messageId }],
        },
      });

      if (message) {
        if (message.status !== "READ") {
          await prisma.message.update({
            where: { id: message.id },
            data: { status: "READ" },
          });

          if (message.campaignId) {
            const recipient = await prisma.campaignRecipient.findFirst({
              where: {
                campaignId: message.campaignId,
                contactId: message.contactId,
              },
            });

            if (recipient) {
              await prisma.campaignRecipient.update({
                where: { id: recipient.id },
                data: {
                  status: "READ",
                  readAt: recipient.readAt ?? new Date(),
                },
              });

              await prisma.campaign.update({
                where: { id: message.campaignId },
                data: { readCount: { increment: 1 } },
              });
            }
          }

          await refreshInboxHealth(message.inboxId);
        }
      } else {
        // Campaign sends use CampaignRecipient id as the tracking pixel id
        const recipient = await prisma.campaignRecipient.findUnique({
          where: { id: messageId },
        });

        if (recipient && recipient.status !== "READ") {
          await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: {
              status: "READ",
              readAt: new Date(),
            },
          });

          await prisma.campaign.update({
            where: { id: recipient.campaignId },
            data: { readCount: { increment: 1 } },
          });

          if (recipient.messageId) {
            await prisma.message.update({
              where: { id: recipient.messageId },
              data: { status: "READ" },
            });
          } else {
            await prisma.message.updateMany({
              where: {
                campaignId: recipient.campaignId,
                contactId: recipient.contactId,
                status: { not: "READ" },
              },
              data: { status: "READ" },
            });
          }

          await refreshInboxHealth(recipient.inboxId);
        } else if (recipient?.status === "READ" && recipient.messageId) {
          await prisma.message.updateMany({
            where: {
              id: recipient.messageId,
              status: { not: "READ" },
            },
            data: { status: "READ" },
          });
        }
      }
    } catch (e) {
      console.warn("Tracking pixel update error:", e);
    }
  }

  return new NextResponse(TRANSPARENT_GIF, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
