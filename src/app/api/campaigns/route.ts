import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";

const createSchema = z.object({
  name: z.string().min(2),
  channel: z.enum(["WHATSAPP", "EMAIL"]).default("WHATSAPP"),
  templateId: z.string().min(1),
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
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const template = await prisma.template.findUnique({
    where: { id: parsed.data.templateId },
  });
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
  if (template.channel !== parsed.data.channel) {
    return NextResponse.json(
      { error: "Template channel does not match campaign channel" },
      { status: 400 },
    );
  }
  if (template.status !== "APPROVED") {
    return NextResponse.json(
      { error: "Only APPROVED templates can be used in campaigns" },
      { status: 400 },
    );
  }

  const contacts = await prisma.contact.findMany({
    where: {
      ...(parsed.data.channel === "WHATSAPP"
        ? { optedOut: false, phone: { not: null } }
        : { emailOptedOut: false, email: { not: null } }),
      ...(parsed.data.tag ? { tags: { has: parsed.data.tag } } : {}),
    },
  });

  if (!contacts.length) {
    return NextResponse.json(
      {
        error:
          parsed.data.channel === "EMAIL"
            ? "No contacts with email found for this audience"
            : "No contacts with phone found for this audience",
      },
      { status: 400 },
    );
  }

  const campaign = await prisma.campaign.create({
    data: {
      name: parsed.data.name,
      channel: parsed.data.channel,
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
