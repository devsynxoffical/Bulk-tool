import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api";
import { sendEmailMessage } from "@/lib/email/client";

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  try {
    const body = await req.json().catch(() => ({}));
    const targetEmail = body.to || session.user.email;

    if (!targetEmail) {
      return NextResponse.json(
        { error: "Target email address is required" },
        { status: 400 },
      );
    }

    const result = await sendEmailMessage({
      to: targetEmail,
      subject: "Test Email from WhatsApp Bulk App",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 500px; border: 1px solid #eee; rounded-radius: 8px;">
          <h2 style="color: #2563eb; margin-top: 0;">Email Connection Successful! 🎉</h2>
          <p>This is a test email sent from your <strong>WhatsApp & Email Bulk Messaging Dashboard</strong> using Resend API.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 15px 0;" />
          <p style="font-size: 12px; color: #666;">
            Sent to: ${targetEmail}<br/>
            Timestamp: ${new Date().toISOString()}
          </p>
        </div>
      `,
    });

    return NextResponse.json({
      ok: true,
      messageId: result.messageId,
      sentTo: targetEmail,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to send test email" },
      { status: 500 },
    );
  }
}
