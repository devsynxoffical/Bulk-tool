import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import {
  getWhatsAppWindowStatus,
  sendSingleEmail,
  sendSingleWhatsAppTemplate,
  sendSingleWhatsAppText,
} from "@/lib/messages/send-single";

const schema = z.discriminatedUnion("channel", [
  z.object({
    channel: z.literal("WHATSAPP"),
    contactId: z.string().min(1),
    mode: z.enum(["text", "template"]),
    body: z.string().optional(),
    templateId: z.string().optional(),
    bodyParams: z.array(z.string()).optional(),
  }),
  z.object({
    channel: z.literal("EMAIL"),
    contactId: z.string().min(1),
    subject: z.string().min(1),
    body: z.string().min(1),
    templateId: z.string().optional(),
  }),
]);

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const contactId = req.nextUrl.searchParams.get("contactId");
  if (!contactId) {
    return NextResponse.json({ error: "contactId required" }, { status: 400 });
  }

  const status = await getWhatsAppWindowStatus(contactId);
  return NextResponse.json(status);
}

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const data = parsed.data;

    if (data.channel === "WHATSAPP") {
      if (data.mode === "text") {
        if (!data.body?.trim()) {
          return NextResponse.json(
            { error: "Message body required" },
            { status: 400 },
          );
        }
        const result = await sendSingleWhatsAppText({
          contactId: data.contactId,
          body: data.body.trim(),
        });
        return NextResponse.json(result, { status: 201 });
      }

      if (!data.templateId) {
        return NextResponse.json(
          { error: "Template required for WhatsApp outside the 24h window" },
          { status: 400 },
        );
      }

      const result = await sendSingleWhatsAppTemplate({
        contactId: data.contactId,
        templateId: data.templateId,
        bodyParams: data.bodyParams,
      });
      return NextResponse.json(result, { status: 201 });
    }

    const result = await sendSingleEmail({
      contactId: data.contactId,
      subject: data.subject,
      body: data.body,
      templateId: data.templateId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Send failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
