import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import {
  normalizeMessageId,
  normalizeSubject,
} from "@/lib/email/thread";

export type ThreadItem = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  receivedAt: string;
  messageId: string | null;
  relatedOutboundId: string | null;
  isRead?: boolean;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;

  try {
    const root = await prisma.inboundEmail.findUnique({
      where: { id },
      include: {
        inbox: {
          select: { id: true, fromEmail: true, fromName: true },
        },
      },
    });

    if (!root) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const peer = root.fromEmail.toLowerCase();
    const normSubj = normalizeSubject(root.subject);
    const mailboxEmail = root.inbox.fromEmail.toLowerCase();

    const peerInbound = await prisma.inboundEmail.findMany({
      where: {
        inboxId: root.inboxId,
        isBounce: false,
        fromEmail: { equals: peer, mode: "insensitive" },
      },
      orderBy: { receivedAt: "asc" },
      take: 400,
    });

    const idSet = new Set<string>();
    const rootMid = normalizeMessageId(root.messageId);
    const rootIrt = normalizeMessageId(root.inReplyTo);
    if (rootMid) idSet.add(rootMid);
    if (rootIrt) idSet.add(rootIrt);

    for (const m of peerInbound) {
      if (normalizeSubject(m.subject) === normSubj) {
        const mid = normalizeMessageId(m.messageId);
        const irt = normalizeMessageId(m.inReplyTo);
        if (mid) idSet.add(mid);
        if (irt) idSet.add(irt);
      }
    }

    // Expand Message-ID / In-Reply-To chains a few rounds
    for (let round = 0; round < 4; round++) {
      let grew = false;
      for (const m of peerInbound) {
        const mid = normalizeMessageId(m.messageId);
        const irt = normalizeMessageId(m.inReplyTo);
        const linked =
          (mid && idSet.has(mid)) ||
          (irt && idSet.has(irt)) ||
          normalizeSubject(m.subject) === normSubj;
        if (!linked) continue;
        if (mid && !idSet.has(mid)) {
          idSet.add(mid);
          grew = true;
        }
        if (irt && !idSet.has(irt)) {
          idSet.add(irt);
          grew = true;
        }
      }
      if (!grew) break;
    }

    const inboundThread = peerInbound.filter((m) => {
      if (normalizeSubject(m.subject) === normSubj) return true;
      const mid = normalizeMessageId(m.messageId);
      const irt = normalizeMessageId(m.inReplyTo);
      return Boolean((mid && idSet.has(mid)) || (irt && idSet.has(irt)));
    });

    const relatedOutboundIds = inboundThread
      .map((m) => m.relatedOutboundId)
      .filter(Boolean) as string[];

    const outbound = await prisma.message.findMany({
      where: {
        channel: "EMAIL",
        direction: "OUTBOUND",
        OR: [
          { inboxId: root.inboxId },
          ...(relatedOutboundIds.length
            ? [{ id: { in: relatedOutboundIds } }]
            : []),
        ],
        contact: {
          email: { equals: peer, mode: "insensitive" },
        },
      },
      include: {
        contact: { select: { email: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 400,
    });

    const outboundThread = outbound.filter((m) => {
      if (relatedOutboundIds.includes(m.id)) return true;
      if (normalizeSubject(m.subject) === normSubj) return true;
      const mid = normalizeMessageId(m.metaMessageId);
      return Boolean(mid && idSet.has(mid));
    });

    const items: ThreadItem[] = [
      ...inboundThread.map((m) => ({
        id: m.id,
        direction: "INBOUND" as const,
        fromEmail: m.fromEmail,
        fromName: m.fromName,
        toEmail: m.toEmail,
        subject: m.subject || "(No subject)",
        bodyText: m.bodyText || "",
        bodyHtml: m.bodyHtml || "",
        receivedAt: m.receivedAt.toISOString(),
        messageId: m.messageId,
        relatedOutboundId: m.relatedOutboundId,
        isRead: m.isRead,
      })),
      ...outboundThread.map((m) => ({
        id: m.id,
        direction: "OUTBOUND" as const,
        fromEmail: mailboxEmail,
        fromName: root.inbox.fromName,
        toEmail: m.contact.email || peer,
        subject: m.subject || "(No subject)",
        bodyText: m.body || "",
        bodyHtml: "",
        receivedAt: m.createdAt.toISOString(),
        messageId: m.metaMessageId,
        relatedOutboundId: null,
      })),
    ].sort(
      (a, b) =>
        new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime(),
    );

    return NextResponse.json({
      rootId: root.id,
      subject: root.subject || "(No subject)",
      peerEmail: peer,
      mailboxEmail: root.inbox.fromEmail,
      mailboxName: root.inbox.fromName,
      items,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load thread";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
