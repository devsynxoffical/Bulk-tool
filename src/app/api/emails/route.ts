import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ownerScope, requireSession } from "@/lib/api";

const SENT_LIKE = new Set(["SENT", "DELIVERED", "READ", "FAILED", "SKIPPED"]);

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error || !session) return error;

  const filterUserId = req.nextUrl.searchParams.get("userId");
  const scope = ownerScope(session, filterUserId);

  try {
    // Source of truth for sent mail (compose + campaigns that created a Message)
    const emailMessages = await prisma.message.findMany({
      where: {
        channel: "EMAIL",
        direction: "OUTBOUND",
        contact: { ...scope },
      },
      include: {
        contact: true,
        campaign: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    });

    // Campaign opens may be on CampaignRecipient while Message stayed SENT
    const openRecipients = await prisma.campaignRecipient.findMany({
      where: {
        status: "READ",
        OR: [
          { messageId: { in: emailMessages.map((m) => m.id).filter(Boolean) } },
          {
            AND: [
              { campaignId: { in: emailMessages.map((m) => m.campaignId).filter(Boolean) as string[] } },
              { contactId: { in: emailMessages.map((m) => m.contactId) } },
            ],
          },
        ],
      },
      select: {
        messageId: true,
        campaignId: true,
        contactId: true,
        readAt: true,
      },
    });

    const openByMessageId = new Map(
      openRecipients
        .filter((r) => r.messageId)
        .map((r) => [r.messageId as string, r.readAt] as const),
    );
    const openByCampaignContact = new Set(
      openRecipients.map((r) => `${r.campaignId}:${r.contactId}`),
    );

    const directRecords = emailMessages.map((msg) => {
      const openedViaCampaign =
        (msg.id && openByMessageId.has(msg.id)) ||
        (msg.campaignId &&
          openByCampaignContact.has(`${msg.campaignId}:${msg.contactId}`));
      const status = openedViaCampaign && msg.status !== "READ" ? "READ" : msg.status;
      const readAt =
        status === "READ"
          ? openByMessageId.get(msg.id) ||
            (msg.status === "READ" ? msg.updatedAt : null)
          : null;

      return {
        id: msg.id,
        type: msg.campaignId ? "CAMPAIGN" : "DIRECT",
        recipientEmail: msg.contact.email || "No email",
        recipientName: msg.contact.name || "Valued Client",
        subject: msg.subject || "No Subject",
        body: msg.body || "",
        status,
        sentAt: msg.createdAt,
        readAt,
        campaignName: msg.campaign?.name || null,
        pdfUrl: null,
      };
    });

    // Campaign rows only when there is no Message yet (avoids duplicate {{company}} rows)
    const campaignRecipients = await prisma.campaignRecipient.findMany({
      where: {
        campaign: { channel: "EMAIL", ...scope },
        status: { in: ["SENT", "DELIVERED", "READ", "FAILED", "SKIPPED"] },
        messageId: null,
      },
      include: {
        contact: true,
        campaign: {
          include: {
            template: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });

    const campaignOnlyRecords = campaignRecipients.map((cr) => ({
      id: cr.id,
      type: "CAMPAIGN",
      recipientEmail: cr.contact.email || "No email",
      recipientName: cr.contact.name || "Valued Client",
      subject: cr.campaign.name,
      body: "",
      status: cr.status,
      sentAt: cr.sentAt || cr.createdAt,
      readAt: cr.readAt,
      campaignName: cr.campaign.name,
      pdfUrl: cr.campaign.template?.pdfUrl || null,
      errorMessage: cr.errorMessage || null,
    }));

    const combined = [...directRecords, ...campaignOnlyRecords].sort(
      (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
    );

    const countable = combined.filter((r) => SENT_LIKE.has(r.status));
    const totalSent = countable.filter((r) =>
      ["SENT", "DELIVERED", "READ"].includes(r.status),
    ).length;
    const totalOpened = countable.filter((r) => r.status === "READ").length;
    const totalDelivered = countable.filter(
      (r) => r.status === "DELIVERED" || r.status === "READ",
    ).length;
    const totalFailed = countable.filter((r) => r.status === "FAILED").length;
    const openRate =
      totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : "0.0";

    return NextResponse.json({
      stats: {
        totalSent,
        totalOpened,
        totalDelivered,
        totalFailed,
        openRate,
      },
      emails: combined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load sent emails";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
