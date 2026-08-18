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
    company: z.string().optional(),
    city: z.string().optional(),
    tags: z.array(z.string()).optional(),
    customFields: z.record(z.string(), z.string()).optional(),
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

  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid contact input" },
        { status: 400 },
      );
    }

    const phone = parsed.data.phone?.trim()
      ? normalizePhone(parsed.data.phone)
      : null;
    const email = parsed.data.email?.trim() ? parsed.data.email.trim().toLowerCase() : null;

    if (phone && phone.length < 8) {
      return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
    }

    const customFields: Record<string, string> = {
      ...(parsed.data.customFields || {}),
    };
    if (parsed.data.company?.trim()) customFields.company = parsed.data.company.trim();
    if (parsed.data.city?.trim()) customFields.city = parsed.data.city.trim();

    // 1. Look up existing contact by email or phone
    const existing = await prisma.contact.findFirst({
      where: {
        OR: [
          ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
          ...(phone ? [{ phone }] : []),
        ],
      },
    });

    let contact;
    if (existing) {
      contact = await prisma.contact.update({
        where: { id: existing.id },
        data: {
          name: parsed.data.name?.trim() || undefined,
          phone: phone || undefined,
          email: email || undefined,
          tags: parsed.data.tags || undefined,
          customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
        },
      });
    } else {
      try {
        contact = await prisma.contact.create({
          data: {
            email: email || null,
            phone: phone || null,
            name: parsed.data.name?.trim() || null,
            tags: parsed.data.tags || [],
            customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
          },
        });
      } catch (createErr: any) {
        // Fallback for race condition or unique constraint collision
        const fallback = await prisma.contact.findFirst({
          where: {
            OR: [
              ...(email ? [{ email }] : []),
              ...(phone ? [{ phone }] : []),
            ],
          },
        });

        if (fallback) {
          contact = await prisma.contact.update({
            where: { id: fallback.id },
            data: {
              name: parsed.data.name?.trim() || undefined,
              tags: parsed.data.tags || undefined,
              customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
            },
          });
        } else {
          throw createErr;
        }
      }
    }

    return NextResponse.json({ ...contact, contact }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save contact";
    return NextResponse.json({ error: message }, { status: 400 });
  }
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
