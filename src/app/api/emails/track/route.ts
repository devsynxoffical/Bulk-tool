import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get("id");

  if (messageId) {
    try {
      // Find message by ID or metaMessageId
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

          // If associated with a campaign or recipient
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
        }
      } else {
        // Check if messageId is directly a CampaignRecipient ID
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
        }
      }
    } catch (e) {
      console.warn("Tracking pixel update error:", e);
    }
  }

  // 1x1 transparent GIF binary
  const transparentGif = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64",
  );

  return new NextResponse(transparentGif, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}
