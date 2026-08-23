import nodemailer from "nodemailer";

export type SmtpDeliveryPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
  from: string;
  listUnsubscribe?: string;
  /** Threading headers for replies */
  inReplyTo?: string;
  references?: string;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
  };
  dkim?: {
    domainName: string;
    keySelector: string;
    privateKey: string;
  };
  attachments?: Array<{ filename: string; content: string }>;
};

export async function deliverViaSmtp(payload: SmtpDeliveryPayload) {
  const transporter = nodemailer.createTransport({
    host: payload.smtp.host,
    port: payload.smtp.port,
    secure: payload.smtp.secure,
    auth: {
      user: payload.smtp.username,
      pass: payload.smtp.password,
    },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    dkim: payload.dkim,
  } as nodemailer.TransportOptions);

  const headers: Record<string, string> = {};
  if (payload.listUnsubscribe) {
    headers["List-Unsubscribe"] = `<${payload.listUnsubscribe}>`;
  }
  if (payload.inReplyTo) {
    headers["In-Reply-To"] = payload.inReplyTo.startsWith("<")
      ? payload.inReplyTo
      : `<${payload.inReplyTo}>`;
  }
  if (payload.references) {
    headers.References = payload.references;
  }

  const info = await transporter.sendMail({
    from: payload.from,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    attachments:
      payload.attachments && payload.attachments.length > 0
        ? payload.attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
            encoding: "base64",
          }))
        : undefined,
  });

  return { messageId: info.messageId || `msg_${Date.now()}` };
}
