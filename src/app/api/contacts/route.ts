import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { normalizePhone } from "@/lib/utils";

const createSchema = z
  .object({
    phone: z.string().optional(),
    name: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    tags: z.array(z.string()).optional(),
  })
  .refine((d) => Boolean(d.phone?.trim() || d.email?.trim()), {
    message: "Phone or email is required",
  });

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const q = req.nextUrl.searchParams.get("q")?.trim();
  const tag = req.nextUrl.searchParams.get("tag")?.trim();

  const contacts = await prisma.contact.findMany({
    where: {
      AND: [
        q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { phone: { contains: q } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
        tag ? { tags: { has: tag } } : {},
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return NextResponse.json(contacts);
}

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid contact" },
      { status: 400 },
    );
  }

  const phone = parsed.data.phone?.trim()
    ? normalizePhone(parsed.data.phone)
    : null;
  const email = parsed.data.email?.trim() || null;

  if (phone && phone.length < 8) {
    return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
  }

  if (phone) {
    const contact = await prisma.contact.upsert({
      where: { phone },
      update: {
        name: parsed.data.name || undefined,
        email: email || undefined,
        tags: parsed.data.tags || undefined,
      },
      create: {
        phone,
        name: parsed.data.name || null,
        email,
        tags: parsed.data.tags || [],
      },
    });
    return NextResponse.json(contact, { status: 201 });
  }

  const contact = await prisma.contact.upsert({
    where: { email: email! },
    update: {
      name: parsed.data.name || undefined,
      tags: parsed.data.tags || undefined,
    },
    create: {
      email: email!,
      name: parsed.data.name || null,
      tags: parsed.data.tags || [],
    },
  });

  return NextResponse.json(contact, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  await prisma.contact.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
