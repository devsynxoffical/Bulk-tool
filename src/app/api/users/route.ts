import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma, ensureDbSchema } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api";

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(200),
  role: z.enum(["ADMIN", "AGENT"]).optional().default("AGENT"),
});

const updateUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  role: z.enum(["ADMIN", "AGENT"]).optional(),
  password: z.string().min(8).max(200).optional(),
  isActive: z.boolean().optional(),
});

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  await ensureDbSchema();

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
      _count: {
        select: {
          emailAccounts: true,
          sendingDomains: true,
          campaigns: true,
          contacts: true,
        },
      },
    },
  });

  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error || !session) return error;

  await ensureDbSchema();

  try {
    const body = await req.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }

    const email = parsed.data.email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "A user with that email already exists" },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        name: parsed.data.name.trim(),
        passwordHash,
        role: parsed.data.role,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, user });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create user";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error || !session) return error;

  await ensureDbSchema();

  try {
    const body = await req.json();
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }

    const target = await prisma.user.findUnique({
      where: { id: parsed.data.id },
    });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Prevent admin from locking themselves out
    if (
      target.id === session.user.id &&
      (parsed.data.isActive === false || parsed.data.role === "AGENT")
    ) {
      return NextResponse.json(
        { error: "You cannot deactivate or demote your own admin account" },
        { status: 400 },
      );
    }

    const data: {
      name?: string;
      role?: "ADMIN" | "AGENT";
      isActive?: boolean;
      passwordHash?: string;
    } = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
    if (parsed.data.role !== undefined) data.role = parsed.data.role;
    if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;
    if (parsed.data.password) {
      data.passwordHash = await bcrypt.hash(parsed.data.password, 12);
    }

    const user = await prisma.user.update({
      where: { id: parsed.data.id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, user });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update user";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
