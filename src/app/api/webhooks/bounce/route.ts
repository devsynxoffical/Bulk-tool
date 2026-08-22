import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  parseBouncedRecipientFromBody,
  recordBounce,
} from "@/lib/email/bounce-handler";

const schema = z.object({
  email: z.string().email().optional(),
  body: z.string().optional(),
  reason: z.enum(["HARD_BOUNCE", "SOFT_BOUNCE", "COMPLAINT"]).optional(),
  inboxId: z.string().optional(),
});

/**
 * Public bounce webhook — authenticate with header:
 * Authorization: Bearer <BOUNCE_WEBHOOK_SECRET>
 */
export async function POST(req: NextRequest) {
  const secret = process.env.BOUNCE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "BOUNCE_WEBHOOK_SECRET not configured" },
      { status: 503 },
    );
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  let email = parsed.data.email?.toLowerCase();
  if (!email && parsed.data.body) {
    email = parseBouncedRecipientFromBody(parsed.data.body) ?? undefined;
  }

  if (!email) {
    return NextResponse.json(
      { error: "Could not determine bounced email address" },
      { status: 400 },
    );
  }

  const result = await recordBounce({
    email,
    reason: parsed.data.reason || "HARD_BOUNCE",
    inboxId: parsed.data.inboxId,
    raw: parsed.data.body,
  });

  return NextResponse.json(result);
}
