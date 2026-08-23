"use client";

import { usePathname } from "next/navigation";

export function ChatAwareMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullBleed = pathname === "/inbox" || pathname.startsWith("/inbox/");

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {fullBleed ? (
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-6 py-6">{children}</div>
        </div>
      )}
    </main>
  );
}
