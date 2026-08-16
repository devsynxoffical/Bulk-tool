import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { sendEmailMessage } from "@/lib/email/client";
import { getNextSendingInbox } from "@/lib/email/rotator";

const schema = z.object({
  body: z.string().min(1).max(4096),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Message body required" }, { status: 400 });
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: { contact: true },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  try {
    if (!conversation.contact.email) {
      return NextResponse.json(
        { error: "Contact has no email address" },
        { status: 400 },
      );
    }

    const sendingInbox = await getNextSendingInbox();

    const result = await sendEmailMessage({
      to: conversation.contact.email,
      subject: `Re: ${conversation.lastMessagePreview || "Outreach message"}`,
      html: `<p style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;white-space:pre-wrap">${parsed.data.body}</p>`,
      text: parsed.data.body,
      account: sendingInbox || undefined,
    });

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        contactId: conversation.contactId,
        channel: "EMAIL",
        direction: "OUTBOUND",
        type: "email",
        subject: `Re: ${conversation.lastMessagePreview || "Outreach message"}`,
        body: parsed.data.body,
        metaMessageId: result.messageId,
        status: "SENT",
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: parsed.data.body.slice(0, 140),
      },
    });

    return NextResponse.json(message, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Send failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
