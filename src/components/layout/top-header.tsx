"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Search } from "lucide-react";
import { signOut } from "next-auth/react";
import { Input } from "@/components/ui/input";

const titles: Record<string, { title: string; crumb: string }> = {
  "/": { title: "Overview", crumb: "DEVSYNX Email Suite" },
  "/emails": { title: "Sent Email Tracker", crumb: "Email Outbox" },
  "/inbox": { title: "Mailbox Inbox", crumb: "Incoming Mail" },
  "/compose": { title: "Compose Email", crumb: "Direct Email" },
  "/campaigns": { title: "Cold Campaigns", crumb: "Outreach" },
  "/campaigns/new": { title: "New Campaign", crumb: "Cold Outreach" },
  "/leads": { title: "Email Finder", crumb: "Discover Emails" },
  "/verifier": { title: "Email Verifier", crumb: "Lead Validation" },
  "/contacts": { title: "Client Database", crumb: "Audience" },
  "/templates": { title: "Email Templates", crumb: "Templates" },
  "/mailboxes": { title: "Sending Mailboxes", crumb: "Infrastructure" },
  "/domains": { title: "Sending Domains", crumb: "Infrastructure" },
  "/settings": { title: "Engine Settings", crumb: "Infrastructure" },
  "/users": { title: "Users", crumb: "Admin" },
};

function resolveMeta(pathname: string) {
  if (titles[pathname]) return titles[pathname];
  if (pathname.startsWith("/campaigns/")) {
    return { title: "Campaign Details", crumb: "Outreach" };
  }
  return { title: "DEVSYNX Email Suite", crumb: "Outreach & Scraper" };
}

export function TopHeader({
  userName,
  userEmail,
  userRole,
}: {
  userName?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
}) {
  const pathname = usePathname();
  const meta = resolveMeta(pathname);
  const initials = (userName || "A")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const roleLabel = userRole === "ADMIN" ? "Admin" : "Agent";

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur">
      <div className="flex h-14 items-center justify-between gap-4 px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            <Link href="/" className="hover:text-zinc-600">
              DEVSYNX Email Suite
            </Link>
            <span>/</span>
            <span>{meta.crumb}</span>
          </div>
          <h1 className="truncate text-sm font-semibold tracking-tight text-zinc-900">
            {meta.title}
          </h1>
        </div>

        <div className="hidden max-w-sm flex-1 md:block">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <Input
              placeholder="Search contacts, campaigns…"
              className="h-8 bg-zinc-50 pl-8 text-xs"
              readOnly
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-xs font-medium text-zinc-900">
              {roleLabel}
            </p>
            <p className="text-[11px] text-zinc-400">{userEmail || userName}</p>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-medium text-white">
            {initials}
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 cursor-pointer"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
