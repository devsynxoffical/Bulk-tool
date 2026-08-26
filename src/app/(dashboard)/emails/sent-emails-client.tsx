"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCheck,
  Eye,
  FileText,
  Mail,
  Paperclip,
  PenSquare,
  RefreshCw,
  Search,
  Send,
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type SentEmailRecord = {
  id: string;
  type: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  body: string;
  status: "PENDING" | "QUEUED" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "SKIPPED";
  sentAt: string;
  readAt: string | null;
  campaignName: string | null;
  pdfUrl: string | null;
  errorMessage?: string | null;
};

type Stats = {
  totalSent: number;
  totalOpened: number;
  totalDelivered: number;
  totalFailed: number;
  openRate: string;
};

export function SentEmailsClient() {
  const [emails, setEmails] = useState<SentEmailRecord[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalSent: 0,
    totalOpened: 0,
    totalDelivered: 0,
    totalFailed: 0,
    openRate: "0.0",
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "READ" | "DELIVERED" | "FAILED">("ALL");
  const [selectedEmail, setSelectedEmail] = useState<SentEmailRecord | null>(null);

  async function loadEmails(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await fetch("/api/emails");
      if (res.ok) {
        const data = await res.json();
        setEmails(data.emails || []);
        setStats(
          data.stats || {
            totalSent: 0,
            totalOpened: 0,
            totalDelivered: 0,
            totalFailed: 0,
            openRate: "0.0",
          },
        );
      }
    } catch {
      // ignore transient network errors
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadEmails();
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      void loadEmails({ silent: true });
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  const filtered = emails.filter((item) => {
    if (filterStatus === "READ" && item.status !== "READ") return false;
    if (filterStatus === "DELIVERED" && item.status !== "DELIVERED" && item.status !== "READ") return false;
    if (filterStatus === "FAILED" && item.status !== "FAILED") return false;

    if (!search.trim()) return true;
    const query = search.toLowerCase();
    return (
      item.recipientEmail.toLowerCase().includes(query) ||
      item.recipientName.toLowerCase().includes(query) ||
      item.subject.toLowerCase().includes(query) ||
      (item.campaignName && item.campaignName.toLowerCase().includes(query))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-600" />
            Sent Email Records &amp; Open Tracker
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Monitor real-time email deliverability, open tracking timestamps, and attachments.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadEmails()}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Link href="/compose">
            <Button size="sm" className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700">
              <PenSquare className="h-3.5 w-3.5" />
              Compose Email
            </Button>
          </Link>
        </div>
      </div>

      {/* Analytics KPI Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-zinc-200 bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Total Sent Emails
            </CardTitle>
            <Send className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-900">{stats.totalSent}</div>
            <p className="text-[11px] text-zinc-500 mt-1">Direct &amp; bulk campaign messages</p>
          </CardContent>
        </Card>

        <Card className="border-emerald-100 bg-emerald-50/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
              Opened (Read Rate)
            </CardTitle>
            <Eye className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">{stats.totalOpened}</div>
            <p className="text-[11px] font-medium text-emerald-600 mt-1">
              {stats.openRate}% Open Rate verified by pixel
            </p>
          </CardContent>
        </Card>

        <Card className="border-blue-100 bg-blue-50/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-blue-800">
              Delivered
            </CardTitle>
            <CheckCheck className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{stats.totalDelivered}</div>
            <p className="text-[11px] text-blue-600 mt-1">Successfully reached inbox</p>
          </CardContent>
        </Card>

        <Card className="border-red-100 bg-red-50/30">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-red-800">
              Bounced / Failed
            </CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">{stats.totalFailed}</div>
            <p className="text-[11px] text-red-600 mt-1">Invalid addresses or API rejections</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-zinc-100 p-1 border border-zinc-200">
          <button
            type="button"
            onClick={() => setFilterStatus("ALL")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filterStatus === "ALL"
                ? "bg-white text-zinc-900 shadow-xs"
                : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            All Sent ({emails.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus("READ")}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filterStatus === "READ"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            <Eye className="h-3 w-3" />
            Opened ({emails.filter((e) => e.status === "READ").length})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus("DELIVERED")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filterStatus === "DELIVERED"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            Delivered ({emails.filter((e) => e.status === "DELIVERED" || e.status === "READ").length})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus("FAILED")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filterStatus === "FAILED"
                ? "bg-red-600 text-white shadow-xs"
                : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            Failed ({emails.filter((e) => e.status === "FAILED").length})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email, name or subject…"
            className="pl-8 text-xs bg-white"
          />
        </div>
      </div>

      {/* Sent Emails Records Table */}
      <Card className="overflow-hidden border-zinc-200 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 text-zinc-500 border-b border-zinc-200 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Subject Line</th>
                <th className="px-4 py-3">Source / Campaign</th>
                <th className="px-4 py-3">Open Status</th>
                <th className="px-4 py-3 text-right">Sent Date</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-zinc-500">
                    <FileText className="mx-auto h-8 w-8 text-zinc-300 mb-2" />
                    <p className="font-semibold text-sm text-zinc-700">No sent email records found</p>
                    <p className="text-xs text-zinc-400 mt-1">
                      Outbound emails sent via campaigns or direct compose will appear here.
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const sentFormatted = new Date(item.sentAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  });

                  const readFormatted = item.readAt
                    ? new Date(item.readAt).toLocaleString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : null;

                  return (
                    <tr key={item.id} className="hover:bg-zinc-50/80 transition-colors">
                      {/* Recipient */}
                      <td className="px-4 py-3">
                        <p className="font-semibold text-zinc-900 truncate max-w-[180px]">
                          {item.recipientName}
                        </p>
                        <p className="text-[11px] text-zinc-500 font-mono truncate max-w-[200px]">
                          {item.recipientEmail}
                        </p>
                      </td>

                      {/* Subject Line & Attachment */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-zinc-800 truncate max-w-[260px]">
                            {item.subject}
                          </span>
                          {item.pdfUrl ? (
                            <span className="inline-flex items-center gap-0.5 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 border border-blue-200">
                              <Paperclip className="h-3 w-3" />
                              PDF
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Campaign / Direct */}
                      <td className="px-4 py-3">
                        {item.campaignName ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded-md">
                            {item.campaignName}
                          </span>
                        ) : (
                          <span className="text-[11px] text-zinc-400">Direct Send</span>
                        )}
                      </td>

                      {/* Open Status */}
                      <td className="px-4 py-3">
                        {item.status === "READ" ? (
                          <Badge tone="success" className="gap-1 bg-emerald-100 text-emerald-800 border-emerald-200">
                            <Eye className="h-3 w-3 text-emerald-600" />
                            Opened {readFormatted ? `at ${readFormatted}` : ""}
                          </Badge>
                        ) : item.status === "DELIVERED" ? (
                          <Badge tone="info" className="gap-1">
                            <CheckCheck className="h-3 w-3" />
                            Delivered
                          </Badge>
                        ) : item.status === "FAILED" ? (
                          <Badge tone="danger" className="gap-1">
                            <XCircle className="h-3 w-3" />
                            Failed
                          </Badge>
                        ) : (
                          <Badge tone="default">Sent</Badge>
                        )}
                      </td>

                      {/* Sent Date */}
                      <td className="px-4 py-3 text-right text-zinc-500 font-mono text-[11px]">
                        {sentFormatted}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedEmail(item)}
                          className="h-7 px-2 text-xs text-blue-600 hover:bg-blue-50 hover:text-blue-800"
                        >
                          Inspect Email
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Inspect Email Detail Modal */}
      {selectedEmail ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-zinc-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 bg-zinc-50">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-blue-600" />
                <div>
                  <h3 className="text-base font-bold text-zinc-900">Email Record Inspection</h3>
                  <p className="text-xs text-zinc-500">
                    ID: <span className="font-mono text-zinc-700">{selectedEmail.id}</span>
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedEmail(null)}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Metadata Box */}
              <div className="grid gap-3 sm:grid-cols-2 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 text-xs">
                <div>
                  <span className="font-semibold text-zinc-500">To Recipient:</span>
                  <p className="font-medium text-zinc-900 text-sm mt-0.5">
                    {selectedEmail.recipientName} &lt;{selectedEmail.recipientEmail}&gt;
                  </p>
                </div>

                <div>
                  <span className="font-semibold text-zinc-500">Open Tracking Status:</span>
                  <div className="mt-1 flex items-center gap-2">
                    {selectedEmail.status === "READ" ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 border border-emerald-300">
                        <Eye className="h-3.5 w-3.5 text-emerald-600" />
                        Opened on {selectedEmail.readAt ? new Date(selectedEmail.readAt).toLocaleString() : "Record Verified"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 border border-blue-200">
                        <CheckCheck className="h-3.5 w-3.5" />
                        {selectedEmail.status}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <span className="font-semibold text-zinc-500">Sent Date:</span>
                  <p className="text-zinc-800 font-mono mt-0.5">
                    {new Date(selectedEmail.sentAt).toLocaleString()}
                  </p>
                </div>

                <div>
                  <span className="font-semibold text-zinc-500">Campaign / Source:</span>
                  <p className="text-zinc-800 font-medium mt-0.5">
                    {selectedEmail.campaignName || "Direct Outbound"}
                  </p>
                </div>
              </div>

              {selectedEmail.errorMessage ? (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
                  <strong>Delivery Failure Error:</strong> {selectedEmail.errorMessage}
                </div>
              ) : null}

              {/* Subject Line */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500">Subject Line</label>
                <div className="rounded-lg border border-zinc-200 bg-white p-3 font-semibold text-zinc-900 text-sm">
                  {selectedEmail.subject}
                </div>
              </div>

              {/* Email Content HTML Preview */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500">Email Body Preview</label>
                <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden min-h-[300px]">
                  {selectedEmail.body.includes("<") ? (
                    <iframe
                      srcDoc={selectedEmail.body}
                      title="Sent Email Content"
                      className="w-full min-h-[360px] border-0 bg-white"
                      sandbox="allow-same-origin allow-scripts"
                    />
                  ) : (
                    <div className="p-4 font-sans text-sm leading-relaxed text-zinc-800 whitespace-pre-wrap">
                      {selectedEmail.body}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end border-t border-zinc-200 px-6 py-3 bg-zinc-50">
              <Button type="button" variant="outline" onClick={() => setSelectedEmail(null)}>
                Close Record
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
