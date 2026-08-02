"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ChatAwareMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChat = pathname === "/inbox" || pathname.startsWith("/inbox/");

  return (
    <main
      className={cn(
        "flex-1",
        isChat ? "overflow-hidden" : "overflow-y-auto",
      )}
    >
      <div className={cn(isChat ? "h-full" : "mx-auto max-w-6xl px-6 py-6")}>
        {children}
      </div>
    </main>
  );
}
