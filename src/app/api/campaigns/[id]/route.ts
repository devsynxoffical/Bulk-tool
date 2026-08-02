import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      template: true,
      recipients: {
        include: { contact: true },
        orderBy: { createdAt: "asc" },
        take: 200,
      },
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(campaign);
}
