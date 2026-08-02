import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api";

export async function POST() {
  const { error } = await requireSession();
  if (error) return error;

  return NextResponse.json({
    synced: 0,
    message:
      "Templates are stored locally now — WhatsApp messages are sent as free-form text through your linked number. No Meta sync or template approval needed.",
  });
}
