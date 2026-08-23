import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { resumeCampaign } from "@/lib/queue/campaign";

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

  if (!["RUNNING", "PAUSED"].includes(campaign.status)) {
    return NextResponse.json(
      { error: `Cannot resume campaign in ${campaign.status} status` },
      { status: 400 },
    );
  }

  try {
    const queued = await resumeCampaign(id);
    return NextResponse.json({
      success: true,
      queued,
      message:
        queued > 0
          ? `Re-queued ${queued} pending email(s). Sending will continue shortly.`
          : "No pending recipients to queue.",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Resume failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
