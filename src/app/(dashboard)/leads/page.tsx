"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Download,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ScrapeJob, ScrapedLead } from "@/lib/scraper";

const POLL_MS = 3000;

export default function LeadFinderPage() {
  const [offline, setOffline] = useState(false);
  const [query, setQuery] = useState("");
  const [maxLeads, setMaxLeads] = useState(300);
  const [includeEmails, setIncludeEmails] = useState(true);

  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ScrapeJob | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const running = job?.status === "running";

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/scraper/health");
      const data = await res.json();
      setOffline(!data.ok);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function restoreSession() {
      try {
        const healthRes = await fetch("/api/scraper/health");
        const healthData = await healthRes.json();
        if (cancelled) return;
        setOffline(!healthData.ok);
        if (!healthData.ok) return;

        // Try fetching active or latest job from backend
        const activeRes = await fetch("/api/scraper/jobs/active");
        if (activeRes.ok) {
          const data = (await activeRes.json()) as { active: boolean; job: ScrapeJob | null };
          if (data.job && !cancelled) {
            setJob(data.job);
            setJobId(data.job.id);
            if (data.job.query) setQuery(data.job.query);
            localStorage.setItem("active_scrape_job_id", data.job.id);
            return;
          }
        }

        // Fallback to local storage saved job id if backend has no active job
        const savedId = localStorage.getItem("active_scrape_job_id");
        if (savedId && !cancelled) {
          const res = await fetch(`/api/scraper/jobs/${savedId}`);
          if (res.ok) {
            const data = (await res.json()) as ScrapeJob;
            setJob(data);
            setJobId(data.id);
            if (data.query) setQuery(data.query);
          } else {
            localStorage.removeItem("active_scrape_job_id");
          }
        }
      } catch {
        if (!cancelled) setOffline(true);
      }
    }

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!jobId || !running) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/scraper/jobs/${jobId}`);
        if (!res.ok) {
          if (res.status === 404) {
            localStorage.removeItem("active_scrape_job_id");
            setJob(null);
            setJobId(null);
            if (pollRef.current) clearInterval(pollRef.current);
          }
          return;
        }
        const data = (await res.json()) as ScrapeJob;
        setJob(data);
        if (data.status !== "running") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // transient — keep polling
      }
    }, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId, running]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setImportMsg("");
    setImporting(false);
    setJob(null);
    setJobId(null);
    setStarting(true);

    try {
      const res = await fetch("/api/scraper/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, includeEmails, maxLeads }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start the search");
        if (res.status === 503) setOffline(true);
        return;
      }
      setOffline(false);
      setJobId(data.jobId);
      localStorage.setItem("active_scrape_job_id", data.jobId);
      const first = await fetch(`/api/scraper/jobs/${data.jobId}`);
      setJob((await first.json()) as ScrapeJob);
    } catch {
      setError("Failed to start the search. Is the scraper service running?");
      setOffline(true);
    } finally {
      setStarting(false);
    }
  }

  async function importLeads() {
    if (!job || !job.leads.length) return;
    setImporting(true);
    setImportMsg("");
    try {
      const res = await fetch("/api/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: job.query, leads: job.leads }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportMsg(`Import failed: ${data.error || "unknown error"}`);
      } else {
        setImportMsg(
          `Saved ${data.saved} leads · ${data.imported} added to Clients (tag “${data.tag}”)`,
        );
      }
    } catch {
      setImportMsg("Import failed — try again.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Lead Finder"
        description="Search an area on Google Maps and pull business names, emails, and phone numbers into a CSV."
      />

      {offline ? (
        <Card className="mb-4 border-amber-200 bg-amber-50/60">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <p className="text-sm text-amber-800">
              The lead scraper service isn&apos;t running. Start it in a separate
              terminal with <code className="rounded bg-amber-100 px-1">npm run scraper</code>,
              then retry.
            </p>
            <Button variant="outline" size="sm" onClick={() => void checkHealth()}>
              <RefreshCw className="h-3.5 w-3.5" />
              Check again
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <form onSubmit={start} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Search an area</CardTitle>
            <CardDescription>
              Examples: &quot;dentists in Lahore&quot;, &quot;restaurants near
              Model Town&quot;, &quot;real estate agents in Islamabad&quot;.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Search query</Label>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="dentists in Lahore"
                required
                minLength={3}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Max leads</Label>
                <Select
                  value={maxLeads}
                  onChange={(e) => setMaxLeads(Number(e.target.value))}
                >
                  <option value={100}>100</option>
                  <option value={300}>300</option>
                  <option value={500}>500</option>
                </Select>
              </div>
              <label className="flex items-center gap-2 pt-6 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={includeEmails}
                  onChange={(e) => setIncludeEmails(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                Find email addresses (visits business websites — slower)
              </label>
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={starting || running}>
                {starting || running ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                {running ? "Searching…" : starting ? "Starting…" : "Find leads"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {running ? (
        <Card className="mt-4 border-blue-200 bg-blue-50/70">
          <CardContent className="flex items-center justify-between gap-3 py-3 text-sm text-blue-900">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500"></span>
              </span>
              <span>
                Scraping session active for <strong>&quot;{job?.query}&quot;</strong>. You can navigate freely — progress is saved automatically!
              </span>
            </div>
            <span className="text-xs text-blue-700 font-medium">
              {job?.stats.found || 0} leads found
            </span>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card className="mt-4 border-red-200 bg-red-50/60">
          <CardContent className="flex items-start justify-between gap-3 py-3">
            <p className="text-sm text-red-700">{error}</p>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-red-500"
              onClick={() => setError("")}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {job ? (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid flex-1 gap-3 sm:grid-cols-3">
              <StatCard
                label="Leads found"
                value={job.stats.found}
                hint={running ? "Still searching…" : undefined}
              />
              <StatCard label="With phone" value={job.stats.withPhone} />
              <StatCard label="With email" value={job.stats.withEmail} />
            </div>
            {job.status === "done" ? (
              <div className="flex flex-wrap gap-2">
                <a href={`/api/scraper/jobs/${job.id}/csv`} download>
                  <Button variant="outline">
                    <Download className="h-4 w-4" />
                    Download CSV
                  </Button>
                </a>
                <Button onClick={importLeads} disabled={importing || !job.leads.length}>
                  {importing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Users className="h-4 w-4" />
                  )}
                  Save to Clients
                </Button>
              </div>
            ) : null}
          </div>

          {job.status === "error" ? (
            <Card className="border-red-200 bg-red-50/60">
              <CardContent className="py-3 text-sm text-red-700">
                The search failed: {job.error || "unknown error"}
              </CardContent>
            </Card>
          ) : null}

          {importMsg ? (
            <Card className="border-emerald-200 bg-emerald-50/60">
              <CardContent className="py-3 text-sm text-emerald-800">
                {importMsg}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Results</CardTitle>
              <p className="text-[11px] text-zinc-400">
                {job.leads.length} loaded
                {job.leads.length > 200 ? " (showing first 200)" : ""}
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {job.leads.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-zinc-500">
                  {running
                    ? "Searching Google Maps…"
                    : "No results yet — try a different search."}
                </p>
              ) : (
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-zinc-100 bg-zinc-50/80 text-[11px] uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Phone</th>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">Category</th>
                      <th className="px-4 py-3 font-medium">Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.leads.slice(0, 200).map((lead, i) => (
                      <LeadRow key={lead.Name + i} lead={lead} />
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {job.status === "done" ? (
            <p className="flex items-start gap-2 rounded-md border border-zinc-100 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
              Saved leads are added to Clients under the tag “{job.query}”. Open{" "}
              <Link href="/campaigns/new" className="mx-0.5 underline">
                Campaigns
              </Link>{" "}
              to bulk-message or email them.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function LeadRow({ lead }: { lead: ScrapedLead }) {
  const phone = lead.Phone;
  const email = lead.Email;
  const website = lead.Website;

  return (
    <tr className="border-b border-zinc-50 last:border-0">
      <td className="px-4 py-3">
        <p className="font-medium text-zinc-900">{lead.Name}</p>
        {website ? (
          <a
            href={website}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-blue-600 hover:underline"
          >
            {website.replace(/^https?:\/\//, "")}
          </a>
        ) : null}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-zinc-600">
        {phone || "—"}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-zinc-600">
        {email ? (
          <a href={`mailto:${email}`} className="text-blue-600 hover:underline">
            {email}
          </a>
        ) : (
          "—"
        )}
      </td>
      <td className="px-4 py-3 text-xs text-zinc-500">{lead.Category || "—"}</td>
      <td className="px-4 py-3 text-xs text-zinc-500">
        {lead.Rating ? `★ ${lead.Rating}` : "—"}
      </td>
    </tr>
  );
}
