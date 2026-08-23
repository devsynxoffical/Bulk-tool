import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { syncAllInboxesOnce } from "@/lib/email/inbox-poller";

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const inboxId = req.nextUrl.searchParams.get("inboxId")?.trim() || "";
  const unreadOnly = req.nextUrl.searchParams.get("unreadOnly") === "true";

  try {
    const mailboxes = await prisma.emailAccount.findMany({
      where: { isActive: true },
      select: {
        id: true,
        fromEmail: true,
        fromName: true,
        lastInboxSyncAt: true,
        inboxSyncError: true,
      },
      orderBy: { fromEmail: "asc" },
    });

    const unreadCounts = await prisma.inboundEmail.groupBy({
      by: ["inboxId"],
      where: { isRead: false, isBounce: false },
      _count: { _all: true },
    });
    const unreadByInbox = new Map(
      unreadCounts.map((r) => [r.inboxId, r._count._all]),
    );

    const where: {
      isBounce: boolean;
      inboxId?: string;
      isRead?: boolean;
    } = { isBounce: false };

    if (inboxId) where.inboxId = inboxId;
    if (unreadOnly) where.isRead = false;

    const messages = await prisma.inboundEmail.findMany({
      where,
      include: {
        inbox: {
          select: {
            id: true,
            fromEmail: true,
            fromName: true,
          },
        },
        contact: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { receivedAt: "desc" },
      take: 300,
    });

    const totalUnread = await prisma.inboundEmail.count({
      where: { isRead: false, isBounce: false },
    });

    return NextResponse.json({
      mailboxes: mailboxes.map((mb) => ({
        ...mb,
        unreadCount: unreadByInbox.get(mb.id) || 0,
      })),
      stats: {
        total: messages.length,
        totalUnread,
      },
      messages: messages.map((m) => ({
        id: m.id,
        inboxId: m.inboxId,
        mailboxEmail: m.inbox.fromEmail,
        mailboxName: m.inbox.fromName,
        fromEmail: m.fromEmail,
        fromName: m.fromName,
        toEmail: m.toEmail,
        subject: m.subject || "(No subject)",
        bodyText: m.bodyText || "",
        bodyHtml: m.bodyHtml || "",
        isRead: m.isRead,
        receivedAt: m.receivedAt,
        relatedOutboundId: m.relatedOutboundId,
        contact: m.contact,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load inbox";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST() {
  const { error } = await requireSession();
  if (error) return error;

  try {
    const synced = await syncAllInboxesOnce();
    return NextResponse.json({ success: true, synced });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Inbox sync failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
