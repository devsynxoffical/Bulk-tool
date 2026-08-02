import { NextRequest } from "next/server";
import { handleWebhookVerify, handleWebhookPost } from "@/lib/webhook-route";

export async function GET(req: NextRequest) {
  return handleWebhookVerify(req);
}

export async function POST(req: NextRequest) {
  return handleWebhookPost(req);
}
