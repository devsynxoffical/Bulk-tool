import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { sendEmailMessage } from "@/lib/email/client";

const bodySchema = z.object({
  body: z.string().min(1, "Reply body is required").max(50_000),
  subject: z.string().max(500).optional(),
});

function buildReplySubject(original: string | null | undefined): string {
  const s = (original || "").trim() || "(No subject)";
  return /^re:\s/i.test(s) ? s : `Re: ${s}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textToHtml(text: string): string {
  return escapeHtml(text).replace(/\n/g, "<br/>");
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;

  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid body" },
        { status: 400 },
      );
    }

    const inbound = await prisma.inboundEmail.findUnique({
      where: { id },
      include: { inbox: true },
    });

    if (!inbound) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const account = inbound.inbox;
    if (!account.host || !account.username || !account.password) {
      return NextResponse.json(
        {
          error:
            "This mailbox is missing SMTP settings. Update it under Sending Mailboxes.",
        },
        { status: 400 },
      );
    }

    const subject =
      parsed.data.subject?.trim() || buildReplySubject(inbound.subject);
    const replyText = parsed.data.body.trim();

    const when = inbound.receivedAt.toUTCString();
    const who = inbound.fromName
      ? `${inbound.fromName} <${inbound.fromEmail}>`
      : inbound.fromEmail;
    const originalPlain =
      inbound.bodyText?.trim() ||
      (inbound.bodyHtml || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim() ||
      "";
    const quoted = `\n\nOn ${when}, ${who} wrote:\n> ${originalPlain
      .split("\n")
      .join("\n> ")}`;
    const fullText = `${replyText}${quoted}`;
    const html = `<div>${textToHtml(replyText)}</div>
<blockquote style="margin-top:16px;padding-left:12px;border-left:3px solid #e4e4e7;color:#71717a;font-size:13px;white-space:pre-wrap;">${escapeHtml(
      quoted.trim(),
    )}</blockquote>`;

    const inReplyTo = inbound.messageId
      ? inbound.messageId.startsWith("<")
        ? inbound.messageId
        : `<${inbound.messageId}>`
      : undefined;

    const result = await sendEmailMessage({
      to: inbound.fromEmail,
      subject,
      html,
      text: fullText,
      account,
      applySendCooldown: false,
      skipSuppression: true,
      inReplyTo,
      references: inReplyTo,
    });

    let contactId = inbound.contactId;
    if (!contactId) {
      const existing = await prisma.contact.findFirst({
        where: { email: { equals: inbound.fromEmail, mode: "insensitive" } },
        select: { id: true },
      });
      if (existing) {
        contactId = existing.id;
      } else {
        const created = await prisma.contact.create({
          data: {
            email: inbound.fromEmail.toLowerCase(),
            name: inbound.fromName || inbound.fromEmail.split("@")[0],
          },
        });
        contactId = created.id;
      }
      await prisma.inboundEmail.update({
        where: { id: inbound.id },
        data: { contactId, isRead: true },
      });
    } else {
      await prisma.inboundEmail.update({
        where: { id: inbound.id },
        data: { isRead: true },
      });
    }

    await prisma.message.create({
      data: {
        contactId,
        inboxId: account.id,
        channel: "EMAIL",
        direction: "OUTBOUND",
        type: "text",
        subject,
        body: fullText.slice(0, 50_000),
        metaMessageId: result.messageId,
        status: "SENT",
      },
    });

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      to: inbound.fromEmail,
      from: account.fromEmail,
      subject,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to send reply";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
