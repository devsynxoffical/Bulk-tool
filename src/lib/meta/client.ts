import { prisma } from "@/lib/prisma";
import type {
  MetaSendResult,
  MetaSendTemplatePayload,
  MetaSendTextPayload,
  MetaTemplate,
} from "@/lib/meta/types";

export class MetaApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "MetaApiError";
    this.status = status;
    this.details = details;
  }
}

const META_ERROR_HINTS: Record<number, string> = {
  131047:
    "WhatsApp blocked this message — it's been more than 24 hours since this person messaged your number, so free-form messages aren't allowed. Ask them to message you first, then reply within 24 hours. After that, only approved templates can be sent.",
  131026:
    "WhatsApp couldn't deliver this message (the recipient may not be on WhatsApp, or the template isn't approved).",
  133010:
    "WhatsApp couldn't deliver — this number can't receive messages (it isn't registered on WhatsApp).",
  131051:
    "This person has blocked your number or reported it as spam on WhatsApp.",
  131039:
    "Your business number can't send messages right now (it isn't registered on WhatsApp).",
  132000: "The template isn't approved yet by WhatsApp.",
  131015: "You've been rate-limited by WhatsApp. Wait a moment and try again.",
};

function metaErrorMessage(code: number | undefined, raw: string) {
  const hint = code ? META_ERROR_HINTS[code] : undefined;
  return hint ? `${hint} (Meta error ${code})` : raw;
}

export async function getActiveWhatsAppAccount() {
  const fromDb = await prisma.whatsAppAccount.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });

  if (fromDb?.accessToken && fromDb.phoneNumberId !== "pending") {
    return fromDb;
  }

  const token = process.env.META_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const wabaId = process.env.META_WABA_ID;

  if (token && phoneNumberId && wabaId) {
    return {
      id: "env",
      phoneNumberId,
      wabaId,
      accessToken: token,
      displayPhoneNumber: null,
      businessName: null,
      webhookVerifyToken:
        process.env.META_WEBHOOK_VERIFY_TOKEN || "whatsapp_bulk_verify_token",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  return fromDb;
}

function apiVersion() {
  return process.env.META_API_VERSION || "v21.0";
}

async function metaFetch<T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const url = `https://graph.facebook.com/${apiVersion()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const metaError = (data as { error?: { message?: string; code?: number } })
      ?.error;
    const message =
      metaError?.message || `Meta API error (${res.status})`;
    throw new MetaApiError(
      metaErrorMessage(metaError?.code, message),
      res.status,
      data,
    );
  }
  return data as T;
}

export async function listMessageTemplates(wabaId: string, accessToken: string) {
  const data = await metaFetch<{ data: MetaTemplate[] }>(
    `/${wabaId}/message_templates?limit=100`,
    accessToken,
  );
  return data.data || [];
}

export async function sendTextMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  body: string,
) {
  const payload: MetaSendTextPayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to.replace(/\D/g, ""),
    type: "text",
    text: { preview_url: false, body },
  };

  return metaFetch<MetaSendResult>(
    `/${phoneNumberId}/messages`,
    accessToken,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export async function sendTemplateMessage(params: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  templateName: string;
  language: string;
  bodyParams?: string[];
}) {
  const components: MetaSendTemplatePayload["template"]["components"] = [];

  if (params.bodyParams?.length) {
    components.push({
      type: "body",
      parameters: params.bodyParams.map((text) => ({ type: "text", text })),
    });
  }

  const payload: MetaSendTemplatePayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: params.to.replace(/\D/g, ""),
    type: "template",
    template: {
      name: params.templateName,
      language: { code: params.language },
      ...(components.length ? { components } : {}),
    },
  };

  return metaFetch<MetaSendResult>(
    `/${params.phoneNumberId}/messages`,
    params.accessToken,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export function extractTemplateBody(components?: MetaTemplate["components"]) {
  if (!components) return { body: null, header: null, footer: null };
  const body = components.find((c) => c.type === "BODY")?.text ?? null;
  const header = components.find((c) => c.type === "HEADER")?.text ?? null;
  const footer = components.find((c) => c.type === "FOOTER")?.text ?? null;
  return { body, header, footer };
}
