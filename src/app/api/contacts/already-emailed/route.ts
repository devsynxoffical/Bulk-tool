import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api";
import { getAlreadyEmailedContactIds } from "@/lib/email/already-emailed";

/** IDs of contacts who already received an outbound email. */
export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const ids = await getAlreadyEmailedContactIds();
  return NextResponse.json({
    contactIds: Array.from(ids),
    count: ids.size,
  });
}
