import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertOwns, forbidden, requireSession } from "@/lib/api";
import { sendSingleEmail } from "@/lib/messages/send-single";

const schema = z.object({
  contactId: z.string().min(1, "Recipient contact ID is required"),
  subject: z.string().min(1, "Email subject line is required"),
  body: z.string().min(1, "Email body content is required"),
  templateId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error || !session) return error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues[0]?.message || "Invalid email request parameters";
    return NextResponse.json(
      { error: errorMsg, details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const data = parsed.data;
    const contact = await prisma.contact.findUnique({
      where: { id: data.contactId },
      select: { ownerId: true },
    });
    if (!contact) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    if (!assertOwns(contact.ownerId, session)) return forbidden();

    if (data.templateId) {
      const template = await prisma.template.findUnique({
        where: { id: data.templateId },
        select: { ownerId: true },
      });
      if (!template) {
        return NextResponse.json({ error: "Email template not found" }, { status: 404 });
      }
      if (!assertOwns(template.ownerId, session)) return forbidden();
    }

    const result = await sendSingleEmail({
      contactId: data.contactId,
      subject: data.subject,
      body: data.body,
      templateId: data.templateId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to send email message";
    console.error("POST /api/messages/send error:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
