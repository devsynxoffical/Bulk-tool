"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Mail,
  Send,
  Plus,
  Trash2,
  Pencil,
  Server,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DEFAULT_INBOX_DAILY_LIMIT,
  RECOMMENDED_INBOX_COUNT,
  SYSTEM_DAILY_TARGET,
} from "@/lib/email/constants";
import { WARMUP_SCHEDULE } from "@/lib/email/warmup";

type DomainOption = {
  id: string;
  domainName: string;
  isVerified?: boolean;
};

type EmailAccount = {
  id: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromEmail: string;
  fromName: string | null;
  signature?: string;
  domainId: string | null;
  domainName: string | null;
  domainVerified: boolean;
  dailyLimit: number;
  effectiveDailyLimit: number;
  sentToday: number;
  healthScore: number;
  warmupEnabled: boolean;
  warmupStage: number;
  warmupDay: number;
  warmupComplete: boolean;
  warmupLabel: string;
  daysUntilNextStage: number | null;
  isActive: boolean;
  hasPassword: boolean;
};

type CapacityStats = {
  activeInboxes: number;
  inboxCapacityToday: number;
  inboxSentToday: number;
  inboxRemainingToday: number;
  verifiedDomains: number;
  readyFor5k: boolean;
  avgInboxCooldownSec?: number;
  theoreticalDailyMax?: number;
  bouncesToday?: number;
  bounceRate?: number;
  throttled?: boolean;
  workerConcurrency?: number;
};

export function MailboxManager() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [domains, setDomains] = useState<DomainOption[]>([]);
  const [capacity, setCapacity] = useState<CapacityStats | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [host, setHost] = useState("");
  const [port, setPort] = useState(465);
  const [secure, setSecure] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [domainId, setDomainId] = useState("");
  const [dailyLimit, setDailyLimit] = useState(DEFAULT_INBOX_DAILY_LIMIT);
  const [warmupEnabled, setWarmupEnabled] = useState(true);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmailTarget, setTestEmailTarget] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [diagReport, setDiagReport] = useState<Record<string, unknown> | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);

  const loadData = useCallback(() => {
    fetch("/api/settings/email")
      .then((r) => (r.ok ? r.json() : { accounts: [] }))
      .then((data: { accounts: EmailAccount[] }) => {
        if (Array.isArray(data.accounts)) setAccounts(data.accounts);
      })
      .catch(console.error);

    fetch("/api/domains")
      .then((r) => (r.ok ? r.json() : { domains: [] }))
      .then((data: { domains: DomainOption[] }) => {
        if (Array.isArray(data.domains)) setDomains(data.domains);
      })
      .catch(console.error);

    fetch("/api/settings/capacity")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setCapacity(data);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function handlePortChange(nextPort: number) {
    setPort(nextPort);
    if (nextPort === 465) setSecure(true);
    else if (nextPort === 587) setSecure(false);
  }

  function startEdit(acc: EmailAccount) {
    setEditingId(acc.id);
    setHost(acc.host);
    setPort(acc.port);
    setSecure(acc.secure);
    setUsername(acc.username);
    setPassword("");
    setFromEmail(acc.fromEmail);
    setFromName(acc.fromName || "");
    setDomainId(acc.domainId || "");
    setDailyLimit(acc.dailyLimit);
    setWarmupEnabled(acc.warmupEnabled);
    setMessage(null);
    document.getElementById("mailbox-form-card")?.scrollIntoView({ behavior: "smooth" });
  }

  function resetForm() {
    setEditingId(null);
    setHost("");
    setPort(465);
    setSecure(true);
    setUsername("");
    setPassword("");
    setFromEmail("");
    setFromName("");
    setDomainId("");
    setDailyLimit(DEFAULT_INBOX_DAILY_LIMIT);
    setWarmupEnabled(true);
    setMessage(null);
  }

  async function saveInbox(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId && !password) {
      setMessage({ ok: false, text: "Password is required for new mailboxes." });
      return;
    }

    setSaving(true);
    setMessage(null);

    const body: Record<string, unknown> = {
      id: editingId || undefined,
      host,
      port: Number(port),
      secure,
      username,
      fromEmail,
      fromName: fromName || undefined,
      domainId: domainId || undefined,
      dailyLimit: Number(dailyLimit) || DEFAULT_INBOX_DAILY_LIMIT,
      warmupEnabled,
    };
    if (password) body.password = password;

    try {
      const res = await fetch("/api/settings/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setSaving(false);

      if (!res.ok) {
        setMessage({
          ok: false,
          text: typeof data.error === "string" ? data.error : "Failed to save mailbox.",
        });
        return;
      }

      setMessage({ ok: true, text: "Mailbox saved to rotation pool." });
      resetForm();
      loadData();
    } catch {
      setSaving(false);
      setMessage({ ok: false, text: "Network error while saving." });
    }
  }

  async function restartWarmup(id: string) {
    if (!confirm("Restart warmup from day 1 (20 emails/day)?")) return;
    await fetch("/api/settings/email/warmup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inboxId: id }),
    });
    loadData();
  }

  async function deleteInbox(id: string) {
    if (!confirm("Remove this mailbox from rotation?")) return;
    await fetch(`/api/settings/email?id=${id}`, { method: "DELETE" });
    loadData();
  }

  async function sendTestEmail() {
    setTesting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: testEmailTarget || undefined,
          accountId: editingId || undefined,
          host: host || undefined,
          port: Number(port) || undefined,
          secure,
          username: username || undefined,
          password: password || undefined,
          fromEmail: fromEmail || undefined,
          fromName: fromName || undefined,
        }),
      });
      const data = await res.json();
      setTesting(false);
      if (!res.ok) {
        setMessage({ ok: false, text: data.error || "Test send failed." });
      } else {
        setMessage({ ok: true, text: `Test email sent to ${data.sentTo}.` });
      }
    } catch {
      setTesting(false);
      setMessage({ ok: false, text: "Test request failed." });
    }
  }

  async function runDiagnostics() {
    setDiagnosing(true);
    setDiagReport(null);
    try {
      const res = await fetch("/api/settings/email/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, username, password: password || undefined }),
      });
      setDiagReport(await res.json());
    } catch (e) {
      setDiagReport({ error: e instanceof Error ? e.message : "Diagnostic failed" });
    }
    setDiagnosing(false);
  }

  const domainWarning =
    fromEmail &&
    !domains.some(
      (d) =>
        d.domainName === fromEmail.split("@")[1]?.toLowerCase() ||
        d.id === domainId,
    );

  return (
    <div className="space-y-6">
      {capacity && (
        <Card className="border-blue-200 bg-gradient-to-r from-blue-50/80 to-indigo-50/40">
          <CardContent className="pt-5 pb-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-zinc-900">
                  5,000/day Sending Capacity
                </p>
                <p className="mt-1 text-xs text-zinc-600">
                  {capacity.activeInboxes} mailboxes · {capacity.inboxSentToday} sent today ·{" "}
                  <strong>{capacity.inboxRemainingToday}</strong> remaining ·{" "}
                  {capacity.verifiedDomains} verified domains
                </p>
              </div>
              <Badge tone={capacity.readyFor5k ? "success" : "warning"}>
                {capacity.readyFor5k
                  ? "Ready for 5k/day"
                  : `Need ~${RECOMMENDED_INBOX_COUNT} inboxes (${SYSTEM_DAILY_TARGET}/day)`}
              </Badge>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{
                  width: `${Math.min(100, (capacity.inboxCapacityToday / SYSTEM_DAILY_TARGET) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">
              Target: {RECOMMENDED_INBOX_COUNT} mailboxes × 250/day · {capacity.workerConcurrency ?? 4} parallel workers ·
              ~{capacity.avgInboxCooldownSec ?? 345}s cooldown/inbox · auto bounce suppression
              {capacity.throttled ? " · ⚠️ throttled (high bounce rate)" : ""}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Sending Mailboxes ({accounts.length})</CardTitle>
            <CardDescription>
              Domain-first round-robin with warmup limits to avoid spam folders.
            </CardDescription>
          </div>
          <Button onClick={resetForm} size="sm" className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-1" /> Add Mailbox
          </Button>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
              No mailboxes yet. Add SMTP accounts (recommended: 20 mailboxes for 5k/day).
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="rounded-lg border border-zinc-200 bg-white p-4 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{acc.fromEmail}</p>
                      <p className="text-[11px] text-zinc-500 truncate">
                        {acc.domainName || "No domain linked"}
                        {acc.domainVerified ? " · DNS verified" : " · DNS pending"}
                      </p>
                    </div>
                    <Badge tone={acc.isActive ? "success" : "default"}>
                      {acc.isActive ? "Active" : "Paused"}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>
                      {acc.sentToday}/{acc.effectiveDailyLimit} today
                    </span>
                    <span>Health {acc.healthScore}%</span>
                  </div>
                  {acc.warmupEnabled && !acc.warmupComplete && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between text-[11px] text-amber-800 font-medium">
                        <span>Warmup day {acc.warmupDay} · Stage {acc.warmupStage}/5</span>
                        {acc.daysUntilNextStage != null && (
                          <span>{acc.daysUntilNextStage}d to next stage</span>
                        )}
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-amber-100">
                        <div
                          className="h-full rounded-full bg-amber-500 transition-all"
                          style={{ width: `${Math.min(100, (acc.warmupStage / 5) * 100)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-zinc-500">{acc.warmupLabel}</p>
                    </div>
                  )}
                  {acc.warmupComplete && (
                    <p className="text-[11px] text-emerald-700 font-medium">Warmup complete — full capacity</p>
                  )}
                  <div className="flex justify-end gap-1 pt-2 border-t border-zinc-100">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => startEdit(acc)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                    {acc.warmupEnabled && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-amber-700"
                        onClick={() => restartWarmup(acc.id)}
                      >
                        Restart warmup
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-rose-600"
                      onClick={() => deleteInbox(acc.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div id="mailbox-form-card">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {editingId ? "Edit Mailbox" : "Connect New Mailbox"}
          </CardTitle>
          <CardDescription>cPanel / Gmail / Outlook SMTP — port 465 + SSL recommended</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveInbox} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>SMTP Host</Label>
                <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="mail.yourdomain.com" required />
              </div>
              <div className="space-y-1.5">
                <Label>Port</Label>
                <Input
                  type="number"
                  value={port}
                  onChange={(e) => handlePortChange(Number(e.target.value))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Username</Label>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="you@domain.com" required />
              </div>
              <div className="space-y-1.5">
                <Label>{editingId ? "Password (leave blank to keep)" : "Password *"}</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={!editingId}
                  placeholder={editingId ? "••••••••" : "App password"}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
              <input
                id="secure-ssl"
                type="checkbox"
                checked={secure}
                onChange={(e) => setSecure(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300"
              />
              <Label htmlFor="secure-ssl" className="cursor-pointer text-sm font-normal">
                Use SSL/TLS (required for port 465)
              </Label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label>From Email</Label>
                <Input type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>From Name</Label>
                <Input value={fromName} onChange={(e) => setFromName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Sending Domain</Label>
                <select
                  value={domainId}
                  onChange={(e) => setDomainId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                >
                  <option value="">Auto-detect from email</option>
                  {domains.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.domainName}
                      {d.isVerified ? " ✓" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Daily Cap</Label>
                <Input
                  type="number"
                  min={5}
                  max={500}
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4 space-y-3 text-xs text-amber-950">
              <p className="font-semibold text-sm">Automatic inbox warmup (required for new mailboxes)</p>
              <p>
                Volume increases automatically by calendar day — you never start at 5k/day on day 1.
              </p>
              <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {WARMUP_SCHEDULE.map((s) => (
                  <div key={s.stage} className="rounded bg-white/80 border border-amber-100 px-2 py-1.5">
                    <strong>Stage {s.stage}</strong> ({s.label}): {s.dailyCap}/day
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="warmup-enabled"
                type="checkbox"
                checked={warmupEnabled}
                onChange={(e) => setWarmupEnabled(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="warmup-enabled" className="font-normal">
                Enable automatic warmup (recommended — uncheck only for fully aged inboxes)
              </Label>
            </div>

            {domainWarning && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>
                  Domain <strong>{fromEmail.split("@")[1]}</strong> is not registered. Add it under{" "}
                  <strong>Domains</strong> and configure SPF/DKIM/DMARC before bulk sending.
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Mail className="h-4 w-4 mr-1" />}
                Save Mailbox
              </Button>
              <div className="flex items-center gap-2">
                <Input
                  type="email"
                  placeholder="Test recipient..."
                  value={testEmailTarget}
                  onChange={(e) => setTestEmailTarget(e.target.value)}
                  className="w-44 text-xs"
                />
                <Button type="button" variant="outline" size="sm" onClick={sendTestEmail} disabled={testing}>
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                  Test
                </Button>
              </div>
            </div>

            {message && (
              <div
                className={`p-3 rounded-md text-xs ${message.ok ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"}`}
              >
                {message.text}
              </div>
            )}
          </form>
        </CardContent>
      </Card>
      </div>

      <Card className="border-blue-200 bg-blue-50/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Server className="h-4 w-4 text-blue-600" /> SMTP Diagnostics
              </CardTitle>
              <CardDescription className="text-xs">Test port connectivity from this server</CardDescription>
            </div>
            <Button type="button" size="sm" onClick={runDiagnostics} disabled={diagnosing}>
              {diagnosing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
              Run Test
            </Button>
          </div>
        </CardHeader>
        {diagReport && (
          <CardContent className="text-xs font-mono whitespace-pre-wrap break-all">
            {JSON.stringify(diagReport, null, 2)}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
