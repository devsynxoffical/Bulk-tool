import nodemailer from "nodemailer";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

export async function getActiveEmailAccount() {
  return prisma.emailAccount.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });
}

export type EmailAttachment = {
  filename: string;
  content?: string; // Base64 or string content
  path?: string;    // URL or file path
  contentType?: string;
};

export async function sendEmailMessage(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  pdfUrl?: string;
  attachments?: EmailAttachment[];
}) {
  const account = await getActiveEmailAccount();
  if (!account) {
    throw new Error("Email account not configured in Settings.");
  }

  const acc = account as typeof account & {
    provider?: string;
    apiKey?: string;
    signature?: string | null;
  };
  const provider = acc.provider?.toUpperCase() || (acc.apiKey ? "RESEND" : "SMTP");

  // 1. Prepare HTML body with Email Signature if configured
  let finalHtml = params.html;
  if (acc.signature && acc.signature.trim() && !finalHtml.includes("email-signature-container")) {
    finalHtml += `
      <div class="email-signature-container" style="margin-top: 32px; pt-4; border-top: 1px solid #e2e8f0; font-family: sans-serif; color: #334155;">
        ${acc.signature}
      </div>
    `;
  }

  // 2. Prepare Attachments (PDFs or files)
  const preparedAttachments: Array<{ filename: string; content?: string; path?: string }> = [];

  if (params.attachments && params.attachments.length > 0) {
    preparedAttachments.push(...params.attachments);
  }

  if (params.pdfUrl && params.pdfUrl.trim()) {
    try {
      const cleanUrl = params.pdfUrl.trim();
      const rawName = cleanUrl.split("/").pop()?.split("?")[0] || "document.pdf";
      const safeFilename = rawName.toLowerCase().endsWith(".pdf") ? rawName : `${rawName}.pdf`;

      if (cleanUrl.startsWith("http://") || cleanUrl.startsWith("https://")) {
        const res = await fetch(cleanUrl);
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          preparedAttachments.push({
            filename: safeFilename,
            content: buffer.toString("base64"),
          });
        }
      } else if (cleanUrl.startsWith("/uploads/")) {
        // Read local uploaded file from disk
        const localPath = path.join(process.cwd(), "public", cleanUrl);
        const buffer = await fs.readFile(localPath);
        preparedAttachments.push({
          filename: safeFilename,
          content: buffer.toString("base64"),
        });
      } else {
        preparedAttachments.push({ filename: safeFilename, path: cleanUrl });
      }
    } catch (e) {
      console.warn("Failed to process attachment from pdfUrl:", e);
    }
  }

  // 3. Send via Resend API
  if (provider === "RESEND") {
    const apiKey = acc.apiKey || process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("Resend API key is missing. Please set your Resend API Key in Settings.");
    }

    const fromAddress = account.fromName
      ? `${account.fromName} <${account.fromEmail}>`
      : account.fromEmail;

    const resendBody: Record<string, unknown> = {
      from: fromAddress,
      to: [params.to],
      subject: params.subject,
      html: finalHtml,
      text: params.text || finalHtml.replace(/<[^>]+>/g, " "),
    };

    if (preparedAttachments.length > 0) {
      resendBody.attachments = preparedAttachments.map((att) => ({
        filename: att.filename,
        content: att.content || undefined,
        path: att.path || undefined,
      }));
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resendBody),
    });

    const resData = await response.json();
    if (!response.ok) {
      throw new Error(
        resData?.message || resData?.name || resData?.error || `Resend API error (${response.status})`,
      );
    }

    return { messageId: resData.id || `resend_${Date.now()}` };
  }

  // 4. Send via SMTP (Nodemailer)
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
    html: finalHtml,
    text: params.text || finalHtml.replace(/<[^>]+>/g, " "),
    attachments: preparedAttachments.length > 0 ? preparedAttachments : undefined,
  });

  return { messageId: info.messageId };
}

export function renderTemplateString(
  template: string,
  vars: Record<string, string>,
) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}
