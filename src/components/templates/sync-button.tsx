"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SyncTemplatesButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function sync() {
    setLoading(true);
    setMsg("");
    const res = await fetch("/api/templates/sync", { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMsg(data.error || "Sync failed");
      return;
    }
    setMsg(`Synced ${data.synced} templates`);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={sync} disabled={loading}>
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        Sync from Meta
      </Button>
      {msg ? <p className="text-xs text-slate-500">{msg}</p> : null}
    </div>
  );
}
