import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  try {
    // 1. Fetch direct outbound Email Messages
    const emailMessages = await prisma.message.findMany({
      where: {
        channel: "EMAIL",
        direction: "OUTBOUND",
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
      take: 200,
    });

    // 2. Fetch Campaign Email Recipients
    const campaignRecipients = await prisma.campaignRecipient.findMany({
      where: {
        campaign: {
          channel: "EMAIL",
        },
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

    // Combine and structure email records
    const directRecords = emailMessages.map((msg) => ({
      id: msg.id,
      type: "DIRECT",
      recipientEmail: msg.contact.email || "No email",
      recipientName: msg.contact.name || "Valued Client",
      subject: msg.subject || "No Subject",
      body: msg.body || "",
      status: msg.status,
      sentAt: msg.createdAt,
      readAt: msg.status === "READ" ? msg.updatedAt : null,
      campaignName: msg.campaign?.name || null,
      pdfUrl: null,
    }));

    const campaignRecords = campaignRecipients.map((cr) => ({
      id: cr.id,
      type: "CAMPAIGN",
      recipientEmail: cr.contact.email || "No email",
      recipientName: cr.contact.name || "Valued Client",
      subject: cr.campaign.template?.subject || cr.campaign.name,
      body: cr.campaign.template?.body || "",
      status: cr.status,
      sentAt: cr.sentAt || cr.createdAt,
      readAt: cr.readAt,
      campaignName: cr.campaign.name,
      pdfUrl: cr.campaign.template?.pdfUrl || null,
      errorMessage: cr.errorMessage || null,
    }));

    // Deduplicate by recipient & subject if necessary, and sort by sentAt desc
    const combined = [...directRecords, ...campaignRecords].sort(
      (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
    );

    // Calculate aggregated KPIs
    const totalSent = combined.length;
    const totalOpened = combined.filter((r) => r.status === "READ").length;
    const totalDelivered = combined.filter((r) => r.status === "DELIVERED" || r.status === "READ").length;
    const totalFailed = combined.filter((r) => r.status === "FAILED").length;
    const openRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : "0.0";

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
