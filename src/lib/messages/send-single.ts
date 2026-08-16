import { prisma } from "@/lib/prisma";
import { renderTemplateString, sendEmailMessage } from "@/lib/email/client";
import { enqueueSendMessage } from "@/lib/queue/whatsapp";
import { isWhatsAppConnected, renderTemplateBody, sendMessageViaSocket } from "@/lib/whatsapp/sender";

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
    ...custom,
  };
}

async function upsertConversation(params: {
  contactId: string;
  channel: "WHATSAPP" | "EMAIL";
  preview: string;
}) {
  return prisma.conversation.upsert({
    where: {
      contactId_channel: {
        contactId: params.contactId,
        channel: params.channel,
      },
    },
    create: {
      contactId: params.contactId,
      channel: params.channel,
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

async function persistWhatsAppSend(params: {
  contactId: string;
  body: string;
  type: "text" | "template";
  templateName?: string;
  preview: string;
}) {
  const conv = await upsertConversation({
    contactId: params.contactId,
    channel: "WHATSAPP",
    preview: params.preview,
  });

  const message = await prisma.message.create({
    data: {
      conversationId: conv.id,
      contactId: params.contactId,
      channel: "WHATSAPP",
      direction: "OUTBOUND",
      type: params.type,
      body: params.body,
      templateName: params.templateName,
      status: "PENDING",
    },
  });

  await prisma.contact.update({
    where: { id: params.contactId },
    data: { lastMessageAt: new Date() },
  });

  const queued = !isWhatsAppConnected();
  if (queued) {
    await enqueueSendMessage(message.id);
  } else {
    await sendMessageViaSocket(message.id);
  }

  const saved = await prisma.message.findUnique({ where: { id: message.id } });
  return { message: saved ?? message, conversationId: conv.id, queued };
}

export async function sendSingleWhatsAppText(params: {
  contactId: string;
  body: string;
}) {
  const contact = await prisma.contact.findUnique({
    where: { id: params.contactId },
  });
  if (!contact) throw new Error("Client not found");
  if (!contact.phone) throw new Error("Client has no phone number");
  if (contact.optedOut) throw new Error("Client opted out of WhatsApp");

  return persistWhatsAppSend({
    contactId: contact.id,
    body: params.body,
    type: "text",
    preview: params.body,
  });
}

export async function sendSingleWhatsAppTemplate(params: {
  contactId: string;
  templateId: string;
  bodyParams?: string[];
}) {
  const contact = await prisma.contact.findUnique({
    where: { id: params.contactId },
  });
  if (!contact) throw new Error("Client not found");
  if (!contact.phone) throw new Error("Client has no phone number");
  if (contact.optedOut) throw new Error("Client opted out of WhatsApp");

  const template = await prisma.template.findUnique({
    where: { id: params.templateId },
  });
  if (!template || template.channel !== "WHATSAPP") {
    throw new Error("WhatsApp template not found");
  }

  const body = renderTemplateBody(
    template.body,
    contactVars(contact),
    params.bodyParams,
  );

  return persistWhatsAppSend({
    contactId: contact.id,
    body,
    type: "template",
    templateName: template.name,
    preview: `Template: ${template.name}`,
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
  if (!contact.email) throw new Error("Client has no email");
  if (contact.emailOptedOut) throw new Error("Client opted out of email");

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
  }

  const result = await sendEmailMessage({
    to: contact.email,
    subject,
    html: html.includes("<")
      ? html
      : `<p style="font-family:IBM Plex Sans,Arial,sans-serif;white-space:pre-wrap">${html}</p>`,
    text: html.replace(/<[^>]+>/g, " ").trim(),
    pdfUrl,
  });

  const conv = await upsertConversation({
    contactId: contact.id,
    channel: "EMAIL",
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
      metaMessageId: result.messageId,
      status: "SENT",
    },
  });

  await prisma.contact.update({
    where: { id: contact.id },
    data: { lastMessageAt: new Date() },
  });

  return { message, conversationId: conv.id };
}

export async function getWhatsAppWindowStatus(contactId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: {
      contactId_channel: { contactId, channel: "WHATSAPP" },
    },
  });

  return {
    open: true,
    expiresAt: null,
    conversationId: conversation?.id ?? null,
  };
}
