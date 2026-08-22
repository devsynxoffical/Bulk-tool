import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { recordBounce, getBounceStats } from "@/lib/email/bounce-handler";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  email: z.string().email(),
  reason: z.enum(["HARD_BOUNCE", "SOFT_BOUNCE", "COMPLAINT"]).optional(),
  inboxId: z.string().optional(),
  raw: z.string().optional(),
});

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const [stats, recent] = await Promise.all([
    getBounceStats(7),
    prisma.bounceEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return NextResponse.json({ stats, events: recent });
}

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid bounce payload" }, { status: 400 });
  }

  const result = await recordBounce(parsed.data);
  return NextResponse.json(result);
}
