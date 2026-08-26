import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ownerScope, type AppSession } from "@/lib/api";

/** Session + owner filter for dashboard server components. */
export async function requirePageSession(): Promise<{
  session: AppSession;
  scope: { ownerId?: string };
}> {
  const session = (await auth()) as AppSession | null;
  if (!session?.user?.id) redirect("/login");
  return { session, scope: ownerScope(session) };
}
