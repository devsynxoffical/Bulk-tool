import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";

const createSchema = z.object({
  name: z.string().min(2),
  channel: z.enum(["WHATSAPP", "EMAIL"]).default("EMAIL"),
  templateId: z.string().min(1),
  customSubject: z.string().optional(),
  customBody: z.string().optional(),
  tag: z.string().optional(),
  rateLimitPerSecond: z.number().int().min(1).max(80).optional(),
  variableMapping: z.record(z.string(), z.string()).optional(),
});

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { template: true },
  });
  return NextResponse.json(campaigns);
}

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid campaign parameters" }, { status: 400 });
  }

  let template = await prisma.template.findUnique({
    where: { id: parsed.data.templateId },
  });
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // If user provided customized subject or body, update template content
  if (parsed.data.customSubject || parsed.data.customBody) {
    template = await prisma.template.update({
      where: { id: template.id },
      data: {
        subject: parsed.data.customSubject || template.subject,
        body: parsed.data.customBody || template.body,
      },
    });
  }

  const contacts = await prisma.contact.findMany({
    where: {
      emailOptedOut: false,
      email: { not: null },
      ...(parsed.data.tag ? { tags: { has: parsed.data.tag } } : {}),
    },
  });

  if (!contacts.length) {
    return NextResponse.json(
      { error: "No contacts with email found for this target audience" },
      { status: 400 },
    );
  }

  const campaign = await prisma.campaign.create({
    data: {
      name: parsed.data.name,
      channel: "EMAIL",
      templateId: template.id,
      rateLimitPerSecond: parsed.data.rateLimitPerSecond || 10,
      variableMapping: parsed.data.variableMapping || {},
      audienceFilter: parsed.data.tag ? { tag: parsed.data.tag } : undefined,
      totalCount: contacts.length,
      recipients: {
        create: contacts.map((c) => ({ contactId: c.id })),
      },
    },
    include: { template: true },
  });

  return NextResponse.json(campaign, { status: 201 });
}
