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
    throw new Error("Email account not configured");
  }

  const transporter = nodemailer.createTransport({
    host: account.host,
    port: account.port,
    secure: account.secure,
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
