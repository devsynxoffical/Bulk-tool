import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { enqueueCampaign, startCampaignWorker } from "@/lib/queue/campaign";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!["DRAFT", "PAUSED", "SCHEDULED"].includes(campaign.status)) {
    return NextResponse.json(
      { error: `Cannot launch campaign in ${campaign.status} status` },
      { status: 400 },
    );
  }

  try {
    startCampaignWorker();
    await prisma.campaign.update({
      where: { id },
      data: { status: "RUNNING", startedAt: new Date() },
    });
    const queued = await enqueueCampaign(id);
    return NextResponse.json({ success: true, queued });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Launch failed";
    await prisma.campaign.update({
      where: { id },
      data: { status: "DRAFT" },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
