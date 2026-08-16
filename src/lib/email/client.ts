import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

export async function getActiveEmailAccount() {
  return prisma.emailAccount.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function sendEmailMessage(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const account = await getActiveEmailAccount();
  if (!account) {
    throw new Error("Email account not configured in Settings.");
  }

  const provider = account.provider?.toUpperCase() || (account.apiKey ? "RESEND" : "SMTP");

  if (provider === "RESEND") {
    const apiKey = account.apiKey || process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("Resend API key is missing. Please set your Resend API Key in Settings.");
    }

    const fromAddress = account.fromName
      ? `${account.fromName} <${account.fromEmail}>`
      : account.fromEmail;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text || params.html.replace(/<[^>]+>/g, " "),
      }),
    });

    const resData = await response.json();
    if (!response.ok) {
      throw new Error(
        resData?.message || resData?.name || resData?.error || `Resend API error (${response.status})`,
      );
    }

    return { messageId: resData.id || `resend_${Date.now()}` };
  }

  // SMTP fallback
  if (!account.host || !account.username || !account.password) {
    throw new Error("SMTP settings are incomplete. Please check Settings.");
  }

  const transporter = nodemailer.createTransport({
    host: account.host,
    port: account.port || 587,
    secure: Boolean(account.secure),
    auth: {
      user: account.username,
      pass: account.password,
    },
  });

  const info = await transporter.sendMail({
    from: account.fromName
      ? `"${account.fromName}" <${account.fromEmail}>`
      : account.fromEmail,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text || params.html.replace(/<[^>]+>/g, " "),
  });

  return { messageId: info.messageId };
}

export function renderTemplateString(
  template: string,
  vars: Record<string, string>,
) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}
