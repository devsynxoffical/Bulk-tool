import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { restartMailboxWarmup } from "@/lib/email/warmup-sync";

const schema = z.object({
  inboxId: z.string().min(1),
});

/** POST — restart warmup from stage 1 / day 1 for a mailbox */
export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "inboxId is required" }, { status: 400 });
  }

  await restartMailboxWarmup(parsed.data.inboxId);
  return NextResponse.json({ success: true, message: "Warmup restarted from day 1" });
}
