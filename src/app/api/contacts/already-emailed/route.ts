import { NextRequest, NextResponse } from "next/server";
import { ownerScope, requireSession } from "@/lib/api";
import { getAlreadyEmailedContactIds } from "@/lib/email/already-emailed";

/** IDs of contacts who already received an outbound email. */
export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error || !session) return error;

  const filterUserId = req.nextUrl.searchParams.get("userId");
  const scope = ownerScope(session, filterUserId);
  const ids = await getAlreadyEmailedContactIds(scope.ownerId);
  return NextResponse.json({
    contactIds: Array.from(ids),
    count: ids.size,
  });
}
