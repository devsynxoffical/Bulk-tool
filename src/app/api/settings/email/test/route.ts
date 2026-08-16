import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { sendEmailMessage } from "@/lib/email/client";

const schema = z.object({
  to: z.string().email().optional(),
});

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid test email" }, { status: 400 });
  }

  const account = await prisma.emailAccount.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!account) {
    return NextResponse.json({ error: "No active email account configured" }, { status: 400 });
  }

  const target = parsed.data.to || account.fromEmail;

  try {
    const result = await sendEmailMessage({
      to: target,
      subject: "Test Email from DEVSYNX Email Suite",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #2563eb; margin-top: 0;">Test Email Confirmed</h2>
          <p>This is a test email sent from your <strong>DEVSYNX Cold Email Outreach Engine</strong>.</p>
          <p style="color: #64748b; font-size: 13px;">Mailbox Provider: <strong>${account.provider}</strong> | Sender: <strong>${account.fromEmail}</strong></p>
        </div>
      `,
    });

    return NextResponse.json({ success: true, sentTo: target, messageId: result.messageId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Test email failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
