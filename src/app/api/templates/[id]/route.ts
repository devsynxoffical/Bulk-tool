import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";

const schema = z
  .object({
    channel: z.enum(["WHATSAPP", "EMAIL"]),
    name: z.string().min(2).max(64),
    category: z.string().min(2).max(32).default("MARKETING"),
    subject: z.string().max(200).optional(),
    body: z.string().min(1),
    header: z.string().max(200).optional(),
    footer: z.string().max(200).optional(),
    pdfUrl: z.string().max(1000).optional(),
  })
  .refine((d) => d.channel !== "EMAIL" || (d.subject && d.subject.length > 0), {
    message: "Email templates need a subject line",
    path: ["subject"],
  });

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Template ID required" }, { status: 400 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid template details";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    const sanitizeName = parsed.data.name.trim().toLowerCase().replace(/\s+/g, "_");

    const template = await prisma.template.update({
      where: { id },
      data: {
        channel: parsed.data.channel,
        name: sanitizeName,
        category: parsed.data.category,
        subject: parsed.data.subject ?? null,
        body: parsed.data.body,
        header: parsed.data.header ?? null,
        footer: parsed.data.footer ?? null,
        pdfUrl: parsed.data.pdfUrl || null,
      },
    });

    return NextResponse.json(template);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update template";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Template ID required" }, { status: 400 });
  }

  try {
    await prisma.template.delete({
      where: { id },
    });
    return NextResponse.json({ success: true, id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete template";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
