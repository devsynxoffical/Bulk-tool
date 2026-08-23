"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MailCheck,
  Megaphone,
  Search,
  Settings,
  Users,
  FileText,
  PenSquare,
  Mail,
  ShieldCheck,
  Globe,
  Inbox,
  MailOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/emails", label: "Sent Email Tracker", icon: MailCheck },
  { href: "/inbox", label: "Mailbox Inbox", icon: MailOpen },
  { href: "/compose", label: "Compose Email", icon: PenSquare },
  { href: "/campaigns", label: "Outreach Campaigns", icon: Megaphone },
  { href: "/templates", label: "Email Templates", icon: FileText },
  { href: "/leads", label: "Email Finder", icon: Search },
  { href: "/verifier", label: "Email Verifier", icon: ShieldCheck },
  { href: "/contacts", label: "Client Database", icon: Users },
  { href: "/mailboxes", label: "Sending Mailboxes", icon: Inbox },
  { href: "/domains", label: "Sending Domains", icon: Globe },
  { href: "/settings", label: "Engine Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[230px] shrink-0 flex-col border-r border-zinc-200/90 bg-white">
      <div className="flex h-14 items-center gap-2.5 border-b border-zinc-200/80 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-blue-700 to-indigo-600 shadow-xs">
          <Mail className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-tight text-zinc-900">
            DEVSYNX Suite
          </p>
          <p className="truncate text-[10px] font-medium text-blue-600">Pure Cold Email Engine</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 p-3 overflow-y-auto">
        <p className="px-2 pb-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          Cold Email Suite
        </p>
        {nav.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150",
                active
                  ? "bg-blue-600 text-white font-semibold shadow-xs"
                  : "text-zinc-600 hover:bg-zinc-100/80 hover:text-zinc-900",
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4",
                  active ? "text-white" : "text-zinc-400 group-hover:text-zinc-600",
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-zinc-200/80 p-3">
        <div className="rounded-xl border border-blue-200/80 bg-gradient-to-b from-blue-50/80 to-indigo-50/40 p-3 shadow-2xs">
          <p className="text-[11px] font-bold text-blue-950">Cold Email Infrastructure</p>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-zinc-700 font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>DKIM &amp; Rotation Active</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
