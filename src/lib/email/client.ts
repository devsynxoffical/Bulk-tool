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
  trackingId?: string;
  account?: Awaited<ReturnType<typeof getActiveEmailAccount>>;
}) {
  const recipient = params.to.trim().toLowerCase();

  // 1. Suppression check
  const suppressed = await prisma.suppressionList.findUnique({
    where: { email: recipient },
  });
  if (suppressed) {
    throw new Error(`Email ${recipient} is on the Suppression List (${suppressed.reason}). Send aborted.`);
  }

  const account = params.account || (await getActiveEmailAccount());
  if (!account) {
    throw new Error("No active Email account configured in Settings.");
  }

  const acc = account as typeof account & {
    provider?: string;
    apiKey?: string;
    signature?: string | null;
  };
  const provider = acc.provider?.toUpperCase() || (acc.apiKey ? "RESEND" : "SMTP");

  const baseUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const unsubUrl = `${baseUrl}/api/unsubscribe?email=${encodeURIComponent(recipient)}`;

  // 2. Prepare HTML body with Email Signature & Unsubscribe Link
  let finalHtml = params.html;

  // Substitute {{UnsubscribeLink}} placeholder if present
  if (finalHtml.includes("{{UnsubscribeLink}}")) {
    finalHtml = finalHtml.replace(/\{\{UnsubscribeLink\}\}/g, unsubUrl);
  } else if (!finalHtml.includes("unsubscribe")) {
    // Append minimal compliant footer
    finalHtml += `
      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8; font-family: sans-serif;">
        You received this email because you are in our outreach directory. 
        <a href="${unsubUrl}" style="color: #64748b; text-decoration: underline;">Unsubscribe here</a>
      </div>
    `;
  }

  if (acc.signature && acc.signature.trim() && !finalHtml.includes("email-signature-container")) {
    finalHtml += `
      <div class="email-signature-container" style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-family: sans-serif; color: #334155;">
        ${acc.signature}
      </div>
    `;
  }

  // Embed open tracking pixel if trackingId is provided
  if (params.trackingId) {
    const trackPixel = `<img src="${baseUrl}/api/emails/track?id=${encodeURIComponent(params.trackingId)}" width="1" height="1" style="display:none !important; width:1px !important; height:1px !important;" alt="" />`;
    if (finalHtml.includes("</body>")) {
      finalHtml = finalHtml.replace("</body>", `${trackPixel}</body>`);
    } else {
      finalHtml += trackPixel;
    }
  }

  // 3. Prepare Attachments (PDFs or files)
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

  let resultMessageId = `msg_${Date.now()}`;

  // 4. Send via In-House Direct SMTP Engine with 2048-bit RSA DKIM Signing
  if (!account.host || !account.username || !account.password) {
    throw new Error("SMTP server settings (Host, Username, Password) are incomplete. Please check Settings.");
  }
    // Check if domain has cryptographic DKIM key pair configured
    const senderDomainName = account.fromEmail.split("@").pop()?.toLowerCase();
    let dkimConfig: { domainName: string; keySelector: string; privateKey: string } | undefined = undefined;

    if (senderDomainName) {
      const domainRecord = await prisma.sendingDomain.findUnique({
        where: { domainName: senderDomainName },
      });
      if (domainRecord && domainRecord.dkimPrivateKey) {
        dkimConfig = {
          domainName: senderDomainName,
          keySelector: domainRecord.dkimSelector || "dkim",
          privateKey: domainRecord.dkimPrivateKey,
        };
      }
    }

    const isPort465 = Number(account.port) === 465;
    const isSecure = isPort465 ? true : Boolean(account.secure);

    const transporter = nodemailer.createTransport({
      host: account.host,
      port: account.port || 587,
      secure: isSecure,
      auth: {
        user: account.username,
        pass: account.password,
      },
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 10000,
      greetingTimeout: 8000,
      socketTimeout: 12000,
      dkim: dkimConfig,
    } as nodemailer.TransportOptions);

    const info = await transporter.sendMail({
      from: account.fromName
        ? `"${account.fromName}" <${account.fromEmail}>`
        : account.fromEmail,
      to: recipient,
      subject: params.subject,
      html: finalHtml,
      text: params.text || finalHtml.replace(/<[^>]+>/g, " "),
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
      },
      attachments: preparedAttachments.length > 0 ? preparedAttachments : undefined,
    });

    resultMessageId = info.messageId || resultMessageId;

  // Update sending statistics on the account and linked domain
  if (account.id !== "draft-test") {
    try {
      const senderDomainName = account.fromEmail.split("@").pop()?.toLowerCase();
      let domainId: string | null =
        (account as { domainId?: string | null }).domainId ?? null;

      if (!domainId && senderDomainName) {
        const domainRecord = await prisma.sendingDomain.findUnique({
          where: { domainName: senderDomainName },
          select: { id: true },
        });
        domainId = domainRecord?.id ?? null;
      }

      const { recordInboxSend } = await import("@/lib/email/rotator");
      await recordInboxSend(account.id, domainId);
    } catch {
      // ignore non-critical stats update error
    }
  }

  return { messageId: resultMessageId };
}

export function renderTemplateString(
  template: string,
  vars: Record<string, string>,
) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}
