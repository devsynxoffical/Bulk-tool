import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";

const schema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().min(1),
  password: z.string().min(1).optional(),
  fromEmail: z.string().email(),
  fromName: z.string().optional(),
});

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const account = await prisma.emailAccount.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  if (!account) return NextResponse.json(null);

  return NextResponse.json({
    id: account.id,
    host: account.host,
    port: account.port,
    secure: account.secure,
    username: account.username,
    fromEmail: account.fromEmail,
    fromName: account.fromName,
    isActive: account.isActive,
    hasPassword: Boolean(account.password),
  });
}

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { password, ...rest } = parsed.data;
  const existing = await prisma.emailAccount.findFirst();

  const account = existing
    ? await prisma.emailAccount.update({
        where: { id: existing.id },
        data:
          password !== undefined
            ? { ...rest, password, isActive: true }
            : { ...rest, isActive: true },
      })
    : await prisma.emailAccount.create({
        data: { ...rest, password: password ?? "", isActive: true },
      });

  return NextResponse.json({
    id: account.id,
    host: account.host,
    port: account.port,
    secure: account.secure,
    username: account.username,
    fromEmail: account.fromEmail,
    fromName: account.fromName,
    isActive: account.isActive,
  });
}
