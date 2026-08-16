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

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const templates = await prisma.template.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid template details";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    const sanitizeName = parsed.data.name.trim().toLowerCase().replace(/\s+/g, "_");

    const existing = await prisma.template.findFirst({
      where: {
        name: sanitizeName,
        language: "en_US",
        channel: parsed.data.channel,
      },
    });

    if (existing) {
      const updated = await prisma.template.update({
        where: { id: existing.id },
        data: {
          category: parsed.data.category,
          status: "APPROVED",
          subject: parsed.data.subject ?? null,
          body: parsed.data.body,
          header: parsed.data.header ?? null,
          footer: parsed.data.footer ?? null,
          pdfUrl: parsed.data.pdfUrl || null,
        },
      });
      return NextResponse.json(updated);
    }

    const template = await prisma.template.create({
      data: {
        channel: parsed.data.channel,
        name: sanitizeName,
        language: "en_US",
        category: parsed.data.category,
        status: "APPROVED",
        subject: parsed.data.subject ?? null,
        body: parsed.data.body,
        header: parsed.data.header ?? null,
        footer: parsed.data.footer ?? null,
        pdfUrl: parsed.data.pdfUrl || null,
        isSample: false,
      },
    });

    return NextResponse.json(template);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create template";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
