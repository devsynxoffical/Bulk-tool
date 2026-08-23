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
    // Show ALL mailboxes (active + paused) so users can filter any inbox
    const mailboxes = await prisma.emailAccount.findMany({
      select: {
        id: true,
        fromEmail: true,
        fromName: true,
        isActive: true,
        lastInboxSyncAt: true,
        inboxSyncError: true,
        username: true,
        password: true,
      },
      orderBy: [{ isActive: "desc" }, { fromEmail: "asc" }],
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
      take: 500,
    });

    const totalUnread = await prisma.inboundEmail.count({
      where: { isRead: false, isBounce: false },
    });

    return NextResponse.json({
      mailboxes: mailboxes.map((mb) => ({
        id: mb.id,
        fromEmail: mb.fromEmail,
        fromName: mb.fromName,
        isActive: mb.isActive,
        lastInboxSyncAt: mb.lastInboxSyncAt,
        inboxSyncError: mb.inboxSyncError,
        canSync: Boolean(mb.username?.trim() && mb.password?.trim()),
        unreadCount: unreadByInbox.get(mb.id) || 0,
      })),
      stats: {
        total: messages.length,
        totalUnread,
        mailboxCount: mailboxes.length,
        activeMailboxCount: mailboxes.filter((m) => m.isActive).length,
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
        messageId: m.messageId,
        relatedOutboundId: m.relatedOutboundId,
        contact: m.contact,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load inbox";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  try {
    let deep = false;
    try {
      const body = await req.json();
      deep = Boolean(body?.deep);
    } catch {
      // empty body = incremental sync
    }
    const synced = await syncAllInboxesOnce({ deep });
    return NextResponse.json({ success: true, synced, deep });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Inbox sync failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
