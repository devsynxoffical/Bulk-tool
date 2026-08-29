import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, requireSession } from "@/lib/api";
import {
  getEngineConfig,
  updateEngineConfig,
} from "@/lib/email/engine-config";

const patchSchema = z.object({
  warmupMaxStage: z.number().int().min(1).max(5).optional(),
  inboxHourlyCap: z.number().int().min(1).max(250).optional(),
  /** null clears manual interval (back to auto from hourly cap) */
  inboxIntervalSec: z.number().int().min(30).max(3600).nullable().optional(),
});

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const config = await getEngineConfig();
  return NextResponse.json({
    ...config,
    /** Suggested seconds when using hourly cap alone */
    suggestedIntervalSec: Math.max(
      45,
      Math.floor(3600 / Math.max(config.inboxHourlyCap, 1)),
    ),
  });
}

export async function PATCH(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }

    const config = await updateEngineConfig(parsed.data);
    return NextResponse.json({
      success: true,
      config,
      message: "Engine pacing updated.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update engine config" },
      { status: 500 },
    );
  }
}
