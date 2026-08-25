import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";

export type AppSession = Session & {
  user: {
    id: string;
    email?: string | null;
    name?: string | null;
    role: "ADMIN" | "AGENT";
  };
};

type SessionOk = { session: AppSession; error: null };
type SessionErr = { session: null; error: NextResponse };

export async function requireSession(): Promise<SessionOk | SessionErr> {
  const session = (await auth()) as AppSession | null;
  if (!session?.user?.id) {
    return {
      session: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { session, error: null };
}

export async function requireAdmin(): Promise<SessionOk | SessionErr> {
  const result = await requireSession();
  if (result.error) return result;
  if (result.session.user.role !== "ADMIN") {
    return {
      session: null,
      error: NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 }),
    };
  }
  return result;
}

/**
 * Prisma where fragment for tenant isolation.
 * - AGENT: always their own ownerId
 * - ADMIN: all data, or filter by optional userId query param
 */
export function ownerScope(
  session: AppSession,
  filterUserId?: string | null,
): { ownerId?: string } {
  if (session.user.role === "ADMIN") {
    if (filterUserId?.trim()) return { ownerId: filterUserId.trim() };
    return {};
  }
  return { ownerId: session.user.id };
}

/** Owner id to stamp on creates. ADMIN may pass filterUserId; otherwise self. */
export function resolveOwnerId(
  session: AppSession,
  filterUserId?: string | null,
): string {
  if (session.user.role === "ADMIN" && filterUserId?.trim()) {
    return filterUserId.trim();
  }
  return session.user.id;
}

export function assertOwns(
  ownerId: string | null | undefined,
  session: AppSession,
): boolean {
  if (session.user.role === "ADMIN") return true;
  return Boolean(ownerId && ownerId === session.user.id);
}

export function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
