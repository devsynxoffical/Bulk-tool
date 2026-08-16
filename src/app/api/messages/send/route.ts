import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { sendSingleEmail } from "@/lib/messages/send-single";

const schema = z.object({
  contactId: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  templateId: z.string().optional(),
});

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
