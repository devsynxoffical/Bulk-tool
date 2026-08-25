import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ownerScope,
  requireSession,
  resolveOwnerId,
} from "@/lib/api";
import { recordBounce, getBounceStats } from "@/lib/email/bounce-handler";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  email: z.string().email(),
  reason: z.enum(["HARD_BOUNCE", "SOFT_BOUNCE", "COMPLAINT"]).optional(),
  inboxId: z.string().optional(),
  raw: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error || !session) return error;

  const filterUserId = req.nextUrl.searchParams.get("userId");
  const scope = ownerScope(session, filterUserId);

  const [stats, recent] = await Promise.all([
    getBounceStats(7, scope.ownerId),
    prisma.bounceEvent.findMany({
      where: { ...scope },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return NextResponse.json({ stats, events: recent });
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error || !session) return error;

  const filterUserId = req.nextUrl.searchParams.get("userId");
  const ownerId = resolveOwnerId(session, filterUserId);

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid bounce payload" }, { status: 400 });
  }

  const result = await recordBounce({ ...parsed.data, ownerId });
  return NextResponse.json(result);
}
