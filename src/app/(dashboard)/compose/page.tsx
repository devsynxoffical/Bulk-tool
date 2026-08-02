import { Suspense } from "react";
import { ComposeClient } from "./compose-client";

export default function ComposePage() {
  return (
    <Suspense
      fallback={
        <p className="py-20 text-center text-sm text-zinc-500">Loading…</p>
      }
    >
      <ComposeClient />
    </Suspense>
  );
}
