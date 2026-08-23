"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Inbox,
  Mail,
  RefreshCw,
  Search,
  AlertCircle,
  Reply,
  X,
  Send,
  Loader2,
  CheckCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type MailboxOption = {
  id: string;
  fromEmail: string;
  fromName: string | null;
  isActive: boolean;
  canSync: boolean;
  unreadCount: number;
  lastInboxSyncAt: string | null;
  inboxSyncError: string | null;
};

type InboundMessage = {
  id: string;
  inboxId: string;
  mailboxEmail: string;
  mailboxName: string | null;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  isRead: boolean;
  receivedAt: string;
  relatedOutboundId: string | null;
  contact: { id: string; name: string | null; email: string | null } | null;
};

function formatDate(value: string) {
  const d = new Date(value);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function senderLabel(msg: InboundMessage) {
  return msg.fromName?.trim() || msg.fromEmail;
}

function replySubject(subject: string) {
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

export function InboxClient() {
  const [mailboxes, setMailboxes] = useState<MailboxOption[]>([]);
  const [messages, setMessages] = useState<InboundMessage[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedInboxId, setSelectedInboxId] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selected, setSelected] = useState<InboundMessage | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replyOk, setReplyOk] = useState<string | null>(null);

  const loadInbox = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedInboxId) params.set("inboxId", selectedInboxId);
      if (unreadOnly) params.set("unreadOnly", "true");
      const res = await fetch(`/api/inbox?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setMailboxes(data.mailboxes || []);
      setMessages(data.messages || []);
      setTotalUnread(data.stats?.totalUnread ?? 0);
      setSelected((prev) => {
        if (!prev) return prev;
        const fresh = (data.messages || []).find(
          (m: InboundMessage) => m.id === prev.id,
        );
        return fresh || prev;
      });
    } catch {
      // ignore transient errors
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [selectedInboxId, unreadOnly]);

  async function syncNow() {
    setSyncing(true);
    try {
      await fetch("/api/inbox", { method: "POST" });
      await loadInbox({ silent: true });
    } finally {
      setSyncing(false);
    }
  }

  async function markRead(msg: InboundMessage) {
    if (msg.isRead) return;
    try {
      await fetch(`/api/inbox/${msg.id}/read`, { method: "PATCH" });
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, isRead: true } : m)),
      );
      setTotalUnread((n) => Math.max(0, n - 1));
      setMailboxes((prev) =>
        prev.map((mb) =>
          mb.id === msg.inboxId
            ? { ...mb, unreadCount: Math.max(0, mb.unreadCount - 1) }
            : mb,
        ),
      );
      setSelected((prev) =>
        prev?.id === msg.id ? { ...prev, isRead: true } : prev,
      );
    } catch {
      // ignore
    }
  }

  function openMessage(msg: InboundMessage) {
    setSelected(msg);
    setReplyBody("");
    setReplyError(null);
    setReplyOk(null);
    void markRead(msg);
  }

  async function sendReply() {
    if (!selected || !replyBody.trim()) return;
    setReplySending(true);
    setReplyError(null);
    setReplyOk(null);
    try {
      const res = await fetch(`/api/inbox/${selected.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyBody.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReplyError(
          typeof data.error === "string" ? data.error : "Failed to send reply",
        );
        return;
      }
      setReplyOk(`Reply sent from ${data.from} → ${data.to}`);
      setReplyBody("");
    } catch {
      setReplyError("Network error while sending reply");
    } finally {
      setReplySending(false);
    }
  }

  useEffect(() => {
    void loadInbox();
    const interval = setInterval(() => void loadInbox({ silent: true }), 20_000);
    return () => clearInterval(interval);
  }, [loadInbox]);

  const filtered = useMemo(() => {
    if (!search.trim()) return messages;
    const q = search.toLowerCase();
    return messages.filter(
      (msg) =>
        msg.fromEmail.toLowerCase().includes(q) ||
        Boolean(msg.fromName?.toLowerCase().includes(q)) ||
        msg.subject.toLowerCase().includes(q) ||
        msg.bodyText.toLowerCase().includes(q) ||
        msg.mailboxEmail.toLowerCase().includes(q),
    );
  }, [messages, search]);

  const selectedMailbox = mailboxes.find((m) => m.id === selectedInboxId);
  const syncErrors = mailboxes.filter((m) => m.inboxSyncError);
  const activeCount = mailboxes.filter((m) => m.isActive).length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-zinc-50">
      {/* Top bar */}
      <div className="shrink-0 border-b border-zinc-200 bg-white px-6 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight text-zinc-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                <Inbox className="h-4 w-4" />
              </span>
              Mailbox Inbox
              {totalUnread > 0 && (
                <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                  {totalUnread} unread
                </span>
              )}
            </h1>
            <p className="mt-1 text-xs text-zinc-500">
              Incoming mail across all sending mailboxes — reply from the same inbox.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void syncNow()}
            disabled={syncing || loading}
            className="w-fit"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`}
            />
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        </div>

        {syncErrors.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p className="flex items-center gap-1.5 font-semibold">
              <AlertCircle className="h-3.5 w-3.5" />
              {syncErrors.length} mailbox{syncErrors.length === 1 ? "" : "es"} failed IMAP sync
            </p>
            <p className="mt-1 text-amber-800">
              Check credentials on{" "}
              <Link href="/mailboxes" className="font-medium underline">
                Sending Mailboxes
              </Link>
              . IMAP needs <code className="rounded bg-amber-100 px-1">mail.domain.com</code>, not
              an SMTP relay host.
            </p>
          </div>
        )}

        {/* Filters */}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={selectedInboxId}
            onChange={(e) => {
              setSelectedInboxId(e.target.value);
              setSelected(null);
              setReplyBody("");
              setReplyOk(null);
              setReplyError(null);
            }}
            className="h-9 min-w-[220px] rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500/25"
          >
            <option value="">
              All mailboxes ({mailboxes.length})
            </option>
            {mailboxes.map((mb) => (
              <option key={mb.id} value={mb.id}>
                {mb.isActive ? "" : "[Paused] "}
                {mb.fromEmail}
                {mb.unreadCount > 0 ? ` · ${mb.unreadCount} unread` : ""}
              </option>
            ))}
          </select>

          <Button
            type="button"
            size="sm"
            variant={unreadOnly ? "default" : "outline"}
            className={unreadOnly ? "bg-blue-600 hover:bg-blue-700" : ""}
            onClick={() => setUnreadOnly((v) => !v)}
          >
            Unread only
          </Button>

          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sender, subject, mailbox…"
              className="h-9 pl-9"
            />
          </div>

          <div className="hidden items-center gap-3 text-[11px] text-zinc-500 lg:flex">
            <span>
              <strong className="text-zinc-800">{activeCount}</strong> active
            </span>
            <span className="h-3 w-px bg-zinc-200" />
            <span>
              Showing{" "}
              <strong className="text-zinc-800">
                {selectedMailbox?.fromEmail || "all"}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Split panes */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[360px_1fr]">
        {/* Message list */}
        <div className="flex min-h-0 flex-col border-r border-zinc-200 bg-white">
          <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-4 py-2.5">
            <p className="text-xs font-semibold text-zinc-600">
              {filtered.length} message{filtered.length === 1 ? "" : "s"}
            </p>
            {loading && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && filtered.length === 0 ? (
              <p className="p-8 text-center text-sm text-zinc-500">Loading inbox…</p>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-16 text-center">
                <Mail className="mb-3 h-8 w-8 text-zinc-300" />
                <p className="text-sm font-medium text-zinc-600">No messages</p>
                <p className="mt-1 text-xs text-zinc-400">
                  Try another mailbox filter, or click Sync now.
                </p>
              </div>
            ) : (
              filtered.map((msg) => {
                const active = selected?.id === msg.id;
                return (
                  <button
                    key={msg.id}
                    type="button"
                    onClick={() => openMessage(msg)}
                    className={`w-full border-b border-zinc-100 px-4 py-3 text-left transition-colors ${
                      active
                        ? "bg-blue-50 border-l-2 border-l-blue-600"
                        : "border-l-2 border-l-transparent hover:bg-zinc-50"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          msg.isRead ? "bg-transparent" : "bg-blue-600"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p
                            className={`truncate text-[13px] ${
                              msg.isRead
                                ? "font-medium text-zinc-700"
                                : "font-semibold text-zinc-900"
                            }`}
                          >
                            {senderLabel(msg)}
                          </p>
                          <span className="shrink-0 text-[10px] text-zinc-400">
                            {formatDate(msg.receivedAt)}
                          </span>
                        </div>
                        <p
                          className={`mt-0.5 truncate text-xs ${
                            msg.isRead ? "text-zinc-500" : "font-medium text-zinc-800"
                          }`}
                        >
                          {msg.subject || "(No subject)"}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-zinc-400">
                          {msg.mailboxEmail}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Detail + reply */}
        <div className="flex min-h-0 flex-col bg-zinc-50/60">
          {selected ? (
            <>
              <div className="shrink-0 border-b border-zinc-200 bg-white px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-bold text-zinc-900 sm:text-lg">
                        {selected.subject || "(No subject)"}
                      </h2>
                      {!selected.isRead && (
                        <Badge tone="warning">Unread</Badge>
                      )}
                      {selected.relatedOutboundId && (
                        <Badge tone="success">
                          <Reply className="mr-1 h-3 w-3" />
                          Outreach reply
                        </Badge>
                      )}
                    </div>
                    <dl className="mt-3 grid gap-1 text-xs text-zinc-600 sm:grid-cols-2">
                      <div>
                        <span className="font-medium text-zinc-800">From:</span>{" "}
                        {senderLabel(selected)} &lt;{selected.fromEmail}&gt;
                      </div>
                      <div>
                        <span className="font-medium text-zinc-800">To:</span>{" "}
                        {selected.toEmail}
                      </div>
                      <div>
                        <span className="font-medium text-zinc-800">Mailbox:</span>{" "}
                        {selected.mailboxEmail}
                      </div>
                      <div>
                        <span className="font-medium text-zinc-800">Received:</span>{" "}
                        {formatDate(selected.receivedAt)}
                      </div>
                    </dl>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => {
                      setSelected(null);
                      setReplyBody("");
                      setReplyOk(null);
                      setReplyError(null);
                    }}
                    title="Close"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs">
                  {selected.bodyHtml ? (
                    <div
                      className="prose prose-sm max-w-none break-words text-zinc-800 prose-a:text-blue-600"
                      dangerouslySetInnerHTML={{ __html: selected.bodyHtml }}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-zinc-800">
                      {selected.bodyText || "(Empty message body)"}
                    </pre>
                  )}
                </div>
              </div>

              {/* Always-visible reply composer */}
              <div className="shrink-0 border-t border-zinc-200 bg-white px-6 py-4 shadow-[0_-4px_16px_rgba(0,0,0,0.04)]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
                    <Reply className="h-4 w-4 text-blue-600" />
                    Reply from {selected.mailboxEmail}
                  </p>
                  <p className="truncate text-[11px] text-zinc-500">
                    To: {selected.fromEmail} · {replySubject(selected.subject)}
                  </p>
                </div>

                {replyOk && (
                  <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    <CheckCheck className="h-3.5 w-3.5" />
                    {replyOk}
                  </div>
                )}

                <textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  rows={4}
                  placeholder="Write your reply…"
                  className="w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 shadow-xs placeholder:text-zinc-400 focus:border-blue-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                {replyError && (
                  <p className="mt-1.5 text-xs text-red-600">{replyError}</p>
                )}
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-zinc-400">
                    Sends via this mailbox’s SMTP · threaded reply headers included
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700"
                    onClick={() => void sendReply()}
                    disabled={replySending || !replyBody.trim()}
                  >
                    {replySending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Send reply
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100">
                <Mail className="h-7 w-7 text-zinc-400" />
              </div>
              <p className="text-sm font-semibold text-zinc-700">
                Select a message to read & reply
              </p>
              <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-zinc-400">
                Pick any email on the left. The reply box appears at the bottom so you
                can answer from that same sending mailbox.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
