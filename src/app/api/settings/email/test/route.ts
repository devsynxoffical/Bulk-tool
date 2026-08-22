import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { sendEmailMessage } from "@/lib/email/client";

const schema = z.object({
  to: z.string().email().optional().or(z.literal("")),
  accountId: z.string().optional(),
  host: z.string().optional(),
  port: z.number().optional(),
  secure: z.boolean().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  fromEmail: z.string().email().optional(),
  fromName: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please enter a valid recipient email address" },
        { status: 400 },
      );
    }

    let account = null;

    if (parsed.data.accountId) {
      account = await prisma.emailAccount.findUnique({
        where: { id: parsed.data.accountId },
      });
    } else if (parsed.data.host && parsed.data.username && parsed.data.password) {
      account = {
        id: "draft-test",
        provider: "SMTP",
        host: parsed.data.host,
        port: parsed.data.port || 587,
        secure: parsed.data.secure ?? Number(parsed.data.port) === 465,
        username: parsed.data.username,
        password: parsed.data.password,
        fromEmail: parsed.data.fromEmail || parsed.data.username,
        fromName: parsed.data.fromName || null,
        signature: null,
        domainId: null,
        isActive: true,
      };
    } else {
      account = await prisma.emailAccount.findFirst({
        where: { isActive: true },
        orderBy: { updatedAt: "desc" },
      });
    }

    if (!account) {
      return NextResponse.json(
        {
          error:
            "No mailbox to test. Save your SMTP settings first or fill in the form completely.",
        },
        { status: 400 },
      );
    }

    const target = parsed.data.to?.trim() || account.fromEmail;

    const sendPromise = sendEmailMessage({
      to: target,
      subject: "Test Email from DEVSYNX Email Suite",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #2563eb; margin-top: 0;">Test Email Confirmed</h2>
          <p>This is a test email sent from your <strong>DEVSYNX Cold Email Outreach Engine</strong>.</p>
          <p style="color: #64748b; font-size: 13px;">Sender: <strong>${account.fromEmail}</strong></p>
        </div>
      `,
      account: account as Parameters<typeof sendEmailMessage>[0]["account"],
      applySendCooldown: false,
    });

    const timeoutPromise = new Promise<{ messageId: string }>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `SMTP timeout: '${account.host}' port ${account.port} did not respond in 15s. Use port 465 with SSL enabled for cPanel hosts.`,
            ),
          ),
        15000,
      ),
    );

    const result = await Promise.race([sendPromise, timeoutPromise]);

    if (account.id !== "draft-test") {
      // Draft test accounts should not increment stats (handled in sendEmailMessage)
    }

    return NextResponse.json({ success: true, sentTo: target, messageId: result.messageId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Test email failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
