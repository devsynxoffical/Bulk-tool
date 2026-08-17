"use client";

export function ChatAwareMain({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-6">
        {children}
      </div>
    </main>
  );
}
