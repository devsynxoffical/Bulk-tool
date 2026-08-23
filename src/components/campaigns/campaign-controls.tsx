"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CampaignControls({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function launch() {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/campaigns/${id}/launch`, { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Launch failed");
      return;
    }
    router.refresh();
  }

  async function pause() {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/campaigns/${id}/pause`, { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Pause failed");
      return;
    }
    router.refresh();
  }

  async function resumeQueue() {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/campaigns/${id}/resume`, { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Resume failed");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {["DRAFT", "PAUSED", "SCHEDULED"].includes(status) ? (
          <Button onClick={launch} disabled={loading}>
            {loading ? "Working…" : status === "SCHEDULED" ? "Launch now" : "Launch campaign"}
          </Button>
        ) : null}
        {status === "RUNNING" ? (
          <>
            <Button variant="outline" onClick={resumeQueue} disabled={loading}>
              {loading ? "Working…" : "Resume sending"}
            </Button>
            <Button variant="secondary" onClick={pause} disabled={loading}>
              Pause
            </Button>
          </>
        ) : null}
        {status === "PAUSED" ? (
          <Button variant="outline" onClick={resumeQueue} disabled={loading}>
            {loading ? "Working…" : "Resume sending"}
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
