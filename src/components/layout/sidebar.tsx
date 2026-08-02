"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageCircle,
  MessageSquare,
  Megaphone,
  Search,
  Settings,
  Users,
  FileText,
  PenSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/compose", label: "New chat", icon: PenSquare },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/leads", label: "Lead Finder", icon: Search },
  { href: "/contacts", label: "Clients", icon: Users },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-zinc-200 bg-white">
      <div className="flex h-14 items-center gap-2.5 border-b border-zinc-200 px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900">
          <MessageCircle className="h-3.5 w-3.5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-zinc-900">
            WhatsApp Bulk
          </p>
          <p className="truncate text-[10px] text-zinc-400">Inbox &amp; campaigns</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 p-2">
        <p className="px-2.5 pb-1.5 pt-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
          Marketing
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
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                active
                  ? "bg-zinc-100 text-zinc-900"
                  : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900",
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4",
                  active ? "text-zinc-900" : "text-zinc-400",
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-zinc-200 p-3">
        <div className="rounded-md border border-zinc-100 bg-zinc-50 px-2.5 py-2">
          <p className="text-[11px] font-medium text-zinc-500">Channels</p>
          <div className="mt-1.5 flex items-center gap-3 text-[11px] text-zinc-600">
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              WhatsApp
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              Email
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
