import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertOwns, forbidden, requireSession } from "@/lib/api";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireSession();
  if (error || !session) return error;

  const { id } = await ctx.params;
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!assertOwns(campaign.ownerId, session)) return forbidden();

  if (campaign.status !== "RUNNING") {
    return NextResponse.json({ error: "Campaign is not running" }, { status: 400 });
  }

  await prisma.campaign.update({
    where: { id },
    data: { status: "PAUSED" },
  });

  return NextResponse.json({ success: true });
}
