import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api";

const SCRAPER_URL = process.env.SCRAPER_URL || "http://127.0.0.1:8787";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await ctx.params;
  let res: Response;
  try {
    res = await fetch(`${SCRAPER_URL}/api/jobs/${id}/csv`, { cache: "no-store" });
  } catch {
    return NextResponse.json(
      { error: "Lead scraper service is offline." },
      { status: 503 },
    );
  }
  if (!res.ok) {
    return NextResponse.json(
      { error: "No leads to export yet." },
      { status: 404 },
    );
  }

  const body = new Uint8Array(await res.arrayBuffer());
  return new NextResponse(body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "text/csv",
      "Content-Disposition": res.headers.get("Content-Disposition") || "attachment",
    },
  });
}
