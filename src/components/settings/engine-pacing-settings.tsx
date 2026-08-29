"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { WARMUP_SCHEDULE } from "@/lib/email/warmup";

type EngineConfigState = {
  warmupMaxStage: number;
  inboxHourlyCap: number;
  inboxIntervalSec: number | null;
  suggestedIntervalSec: number;
};

export function EnginePacingSettings() {
  const [config, setConfig] = useState<EngineConfigState | null>(null);
  const [warmupMaxStage, setWarmupMaxStage] = useState(2);
  const [inboxHourlyCap, setInboxHourlyCap] = useState(6);
  const [useManualInterval, setUseManualInterval] = useState(false);
  const [inboxIntervalSec, setInboxIntervalSec] = useState(600);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/engine");
      if (!res.ok) {
        setMessage({ ok: false, text: "Failed to load engine settings." });
        return;
      }
      const data = (await res.json()) as EngineConfigState;
      setConfig(data);
      setWarmupMaxStage(data.warmupMaxStage);
      setInboxHourlyCap(data.inboxHourlyCap);
      if (data.inboxIntervalSec != null) {
        setUseManualInterval(true);
        setInboxIntervalSec(data.inboxIntervalSec);
      } else {
        setUseManualInterval(false);
        setInboxIntervalSec(data.suggestedIntervalSec);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setMessage(null);
    setForbidden(false);
    try {
      const res = await fetch("/api/settings/engine", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warmupMaxStage,
          inboxHourlyCap,
          inboxIntervalSec: useManualInterval ? inboxIntervalSec : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setForbidden(true);
        setMessage({
          ok: false,
          text: "Only admins can change engine pacing.",
        });
        return;
      }
      if (!res.ok) {
        setMessage({
          ok: false,
          text:
            typeof data.error === "string"
              ? data.error
              : "Failed to save engine settings.",
        });
        return;
      }
      setMessage({
        ok: true,
        text:
          typeof data.message === "string"
            ? data.message
            : "Engine pacing saved.",
      });
      await load();
    } finally {
      setSaving(false);
    }
  }

  const stageInfo = WARMUP_SCHEDULE.find((s) => s.stage === warmupMaxStage);
  const autoInterval = Math.max(45, Math.floor(3600 / Math.max(inboxHourlyCap, 1)));

  if (loading && !config) {
    return (
      <p className="flex items-center gap-2 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading engine pacing…
      </p>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sending pace &amp; warmup cap</CardTitle>
        <CardDescription>
          Cap how far warmup can ramp, and how fast each mailbox may send per hour.
          Defaults: stage 2 (50/day) · 6 emails/hour/mailbox.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="warmup-max-stage">Max warmup stage</Label>
            <select
              id="warmup-max-stage"
              value={warmupMaxStage}
              onChange={(e) => setWarmupMaxStage(Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            >
              {WARMUP_SCHEDULE.map((s) => (
                <option key={s.stage} value={s.stage}>
                  Stage {s.stage} — {s.dailyCap}/day ({s.label})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-zinc-500">
              Inboxes stop ramping at this stage
              {stageInfo ? ` (${stageInfo.dailyCap}/day)` : ""}.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hourly-cap">Emails per mailbox / hour</Label>
            <Input
              id="hourly-cap"
              type="number"
              min={1}
              max={250}
              value={inboxHourlyCap}
              onChange={(e) => setInboxHourlyCap(Number(e.target.value))}
            />
            <p className="text-[11px] text-zinc-500">
              Hard cap per rolling hour (e.g. 6 ≈ one every ~{autoInterval}s).
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <input
              id="manual-interval"
              type="checkbox"
              checked={useManualInterval}
              onChange={(e) => {
                setUseManualInterval(e.target.checked);
                if (e.target.checked) {
                  setInboxIntervalSec(autoInterval);
                }
              }}
              className="h-4 w-4"
            />
            <Label htmlFor="manual-interval" className="font-normal">
              Set send interval manually (seconds between emails on the same mailbox)
            </Label>
          </div>

          {useManualInterval ? (
            <div className="space-y-1.5 max-w-xs">
              <Label htmlFor="interval-sec">Interval (seconds)</Label>
              <Input
                id="interval-sec"
                type="number"
                min={30}
                max={3600}
                value={inboxIntervalSec}
                onChange={(e) => setInboxIntervalSec(Number(e.target.value))}
              />
              <p className="text-[11px] text-zinc-500">
                {inboxIntervalSec >= 60
                  ? `≈ ${(inboxIntervalSec / 60).toFixed(1)} minutes between sends`
                  : `${inboxIntervalSec}s between sends`}
                . Must still respect the hourly cap above.
              </p>
            </div>
          ) : (
            <p className="text-xs text-zinc-500">
              Auto interval from hourly cap: <strong>~{autoInterval}s</strong> between
              sends on the same mailbox.
            </p>
          )}
        </div>

        {message ? (
          <p
            className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-600"}`}
          >
            {message.text}
          </p>
        ) : null}

        <Button onClick={() => void save()} disabled={saving || forbidden}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save pacing
        </Button>
      </CardContent>
    </Card>
  );
}
