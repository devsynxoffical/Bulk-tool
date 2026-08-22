import { prisma } from "@/lib/prisma";
import { renderTemplateString, sendEmailMessage } from "@/lib/email/client";
import {
  getMsUntilInboxAvailable,
  getNextSendingInbox,
} from "@/lib/email/rotator";

function contactVars(contact: {
  name: string | null;
  phone: string | null;
  email: string | null;
  customFields: unknown;
}) {
  const custom =
    contact.customFields && typeof contact.customFields === "object"
      ? (contact.customFields as Record<string, string>)
      : {};

  return {
    name: contact.name || "",
    phone: contact.phone || "",
    email: contact.email || "",
    company: custom.company || custom.Company || "",
    city: custom.city || custom.City || "",
    location: custom.location || custom.city || "",
    ...custom,
  };
}

async function upsertConversation(params: {
  contactId: string;
  preview: string;
}) {
  return prisma.conversation.upsert({
    where: {
      contactId_channel: {
        contactId: params.contactId,
        channel: "EMAIL",
      },
    },
    create: {
      contactId: params.contactId,
      channel: "EMAIL",
      lastMessageAt: new Date(),
      lastMessagePreview: params.preview.slice(0, 140),
      status: "OPEN",
    },
    update: {
      lastMessageAt: new Date(),
      lastMessagePreview: params.preview.slice(0, 140),
      status: "OPEN",
    },
  });
}

export async function sendSingleEmail(params: {
  contactId: string;
  subject: string;
  body: string;
  templateId?: string;
}) {
  const contact = await prisma.contact.findUnique({
    where: { id: params.contactId },
  });
  if (!contact) throw new Error("Client not found");
  if (!contact.email) throw new Error("Client has no email address");
  if (contact.emailOptedOut) throw new Error("Client opted out of email outreach");

  const vars = contactVars(contact);
  let subject = params.subject;
  let html = params.body;
  let pdfUrl: string | undefined = undefined;

  if (params.templateId) {
    const template = await prisma.template.findUnique({
      where: { id: params.templateId },
    });
    if (!template || template.channel !== "EMAIL") {
      throw new Error("Email template not found");
    }
    subject = renderTemplateString(template.subject || subject, vars);
    html = renderTemplateString(template.body || html, vars);
    pdfUrl = template.pdfUrl || undefined;
  } else {
    subject = renderTemplateString(subject, vars);
    html = renderTemplateString(html, vars);
  }

  const sendingInbox = await getNextSendingInbox({ respectCooldown: false });
  if (!sendingInbox) {
    const waitMs = await getMsUntilInboxAvailable();
    if (waitMs > 0) {
      const waitMin = Math.max(1, Math.ceil(waitMs / 60_000));
      throw new Error(
        `Daily send limit reached for all mailboxes. Campaign queue resumes in about ${waitMin} minute(s).`,
      );
    }
    throw new Error(
      "No sending mailbox available (daily limits reached or inboxes paused). Check Mailboxes.",
    );
  }

  const conv = await upsertConversation({
    contactId: contact.id,
    preview: subject,
  });

  const message = await prisma.message.create({
    data: {
      conversationId: conv.id,
      contactId: contact.id,
      channel: "EMAIL",
      direction: "OUTBOUND",
      type: "email",
      subject,
      body: html,
      status: "SENT",
    },
  });

  const result = await sendEmailMessage({
    to: contact.email,
    subject,
    html: html.includes("<")
      ? html
      : `<p style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;white-space:pre-wrap">${html}</p>`,
    text: html.replace(/<[^>]+>/g, " ").trim(),
    pdfUrl,
    trackingId: message.id,
    account: sendingInbox || undefined,
    applySendCooldown: false,
  });

  if (result?.messageId) {
    await prisma.message.update({
      where: { id: message.id },
      data: { metaMessageId: result.messageId },
    });
  }

  await prisma.contact.update({
    where: { id: contact.id },
    data: { lastMessageAt: new Date() },
  });

  return { message, conversationId: conv.id };
}
