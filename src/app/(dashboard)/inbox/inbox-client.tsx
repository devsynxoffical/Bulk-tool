"use client";

import { useCallback, useEffect, useState } from "react";
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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function senderLabel(msg: InboundMessage) {
  return msg.fromName?.trim() || msg.fromEmail;
}

export function InboxClient() {
  const [mailboxes, setMailboxes] = useState<MailboxOption[]>([]);
  const [messages, setMessages] = useState<InboundMessage[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [mailboxCount, setMailboxCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedInboxId, setSelectedInboxId] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selected, setSelected] = useState<InboundMessage | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replyOk, setReplyOk] = useState<string | null>(null);

  const loadInbox = useCallback(async () => {
    setLoading(true);
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
      setMailboxCount(data.stats?.mailboxCount ?? data.mailboxes?.length ?? 0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [selectedInboxId, unreadOnly]);

  async function syncNow() {
    setSyncing(true);
    try {
      await fetch("/api/inbox", { method: "POST" });
      await loadInbox();
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
    setReplyOpen(false);
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
      setReplyOk(`Sent from ${data.from} → ${data.to}`);
      setReplyBody("");
      setReplyOpen(false);
    } catch {
      setReplyError("Network error while sending reply");
    } finally {
      setReplySending(false);
    }
  }

  useEffect(() => {
    void loadInbox();
    const interval = setInterval(() => void loadInbox(), 15_000);
    return () => clearInterval(interval);
  }, [loadInbox]);

  const filtered = messages.filter((msg) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      msg.fromEmail.toLowerCase().includes(q) ||
      Boolean(msg.fromName?.toLowerCase().includes(q)) ||
      msg.subject.toLowerCase().includes(q) ||
      msg.bodyText.toLowerCase().includes(q) ||
      msg.mailboxEmail.toLowerCase().includes(q)
    );
  });

  const selectedMailbox = mailboxes.find((m) => m.id === selectedInboxId);
  const syncErrors = mailboxes.filter((m) => m.inboxSyncError);
  const activeCount = mailboxes.filter((m) => m.isActive).length;
  const pausedCount = mailboxes.length - activeCount;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-zinc-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-900">
            <Inbox className="h-5 w-5 text-blue-600" />
            Mailbox Inbox
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            Replies and incoming mail — filter by mailbox, then reply from that same inbox.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void syncNow()}
            disabled={syncing || loading}
            className="flex items-center gap-1.5 text-xs"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${syncing || loading ? "animate-spin" : ""}`}
            />
            Sync now
          </Button>
          {selected && (
            <Button
              type="button"
              size="sm"
              className="bg-blue-600 text-xs hover:bg-blue-700"
              onClick={() => {
                setReplyOpen(true);
                setReplyError(null);
                setReplyOk(null);
              }}
            >
              <Reply className="mr-1 h-3.5 w-3.5" />
              Reply
            </Button>
          )}
        </div>
      </div>

      {syncErrors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-900">
          <p className="flex items-center gap-1.5 font-semibold">
            <AlertCircle className="h-3.5 w-3.5" />
            Some mailboxes could not sync via IMAP
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {syncErrors.map((mb) => (
              <li key={mb.id}>
                <span className="font-medium">{mb.fromEmail}</span>: {mb.inboxSyncError}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-amber-800">
            Check username/password on{" "}
            <Link href="/mailboxes" className="font-medium underline">
              Sending Mailboxes
            </Link>
            . IMAP uses{" "}
            <code className="rounded bg-amber-100 px-1">mail.yourdomain.com</code>, not SMTP
            relay hosts.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-zinc-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase text-zinc-500">
              Unread
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{totalUnread}</div>
          </CardContent>
        </Card>
        <Card className="border-zinc-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase text-zinc-500">
              All mailboxes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-900">{mailboxCount}</div>
            <p className="mt-1 text-[11px] text-zinc-500">
              {activeCount} active · {pausedCount} paused
            </p>
          </CardContent>
        </Card>
        <Card className="border-zinc-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase text-zinc-500">
              Showing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="truncate text-sm font-semibold text-zinc-900">
              {selectedMailbox ? selectedMailbox.fromEmail : "All mailboxes"}
            </div>
            {selectedMailbox?.lastInboxSyncAt && (
              <p className="mt-1 text-[11px] text-zinc-500">
                Last sync {formatDate(selectedMailbox.lastInboxSyncAt)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-2">
          <label htmlFor="mailbox-filter" className="shrink-0 text-xs font-medium text-zinc-600">
            Mailbox
          </label>
          <select
            id="mailbox-filter"
            value={selectedInboxId}
            onChange={(e) => {
              setSelectedInboxId(e.target.value);
              setSelected(null);
              setReplyOpen(false);
            }}
            className="h-9 min-w-[260px] max-w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="">All mailboxes ({mailboxCount})</option>
            {mailboxes.map((mb) => (
              <option key={mb.id} value={mb.id}>
                {mb.isActive ? "" : "[Paused] "}
                {mb.fromName ? `${mb.fromName} · ` : ""}
                {mb.fromEmail}
                {mb.unreadCount > 0 ? ` (${mb.unreadCount} unread)` : ""}
              </option>
            ))}
          </select>
        </div>

        <Button
          type="button"
          size="sm"
          variant={unreadOnly ? "default" : "outline"}
          className={`text-xs ${unreadOnly ? "bg-blue-600 hover:bg-blue-700" : ""}`}
          onClick={() => setUnreadOnly((v) => !v)}
        >
          Unread only
        </Button>

        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sender, subject, mailbox…"
            className="h-9 pl-9 text-sm"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="overflow-hidden border-zinc-200 lg:col-span-2">
          <div className="border-b border-zinc-100 bg-zinc-50/80 px-4 py-2.5">
            <p className="text-xs font-semibold text-zinc-600">
              {filtered.length} message{filtered.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="max-h-[560px] divide-y divide-zinc-100 overflow-y-auto">
            {loading && filtered.length === 0 ? (
              <p className="p-6 text-center text-sm text-zinc-500">Loading inbox…</p>
            ) : filtered.length === 0 ? (
              <p className="p-6 text-center text-sm text-zinc-500">
                No messages yet for this filter.
              </p>
            ) : (
              filtered.map((msg) => (
                <button
                  key={msg.id}
                  type="button"
                  onClick={() => openMessage(msg)}
                  className={`w-full px-4 py-3 text-left transition-colors hover:bg-blue-50/50 ${
                    selected?.id === msg.id ? "bg-blue-50" : ""
                  } ${!msg.isRead ? "bg-white" : "bg-zinc-50/30"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {!msg.isRead && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                        )}
                        <p
                          className={`truncate text-sm ${
                            !msg.isRead
                              ? "font-bold text-zinc-900"
                              : "font-medium text-zinc-700"
                          }`}
                        >
                          {senderLabel(msg)}
                        </p>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-zinc-500">{msg.subject}</p>
                      {!selectedInboxId && (
                        <Badge tone="default" className="mt-1.5 text-[10px]">
                          {msg.mailboxEmail}
                        </Badge>
                      )}
                    </div>
                    <span className="shrink-0 text-[10px] text-zinc-400">
                      {formatDate(msg.receivedAt)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>

        <Card className="min-h-[560px] border-zinc-200 lg:col-span-3">
          {selected ? (
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-zinc-900">{selected.subject}</h2>
                  <div className="mt-2 space-y-1 text-xs text-zinc-600">
                    <p>
                      <span className="font-medium text-zinc-800">From:</span>{" "}
                      {senderLabel(selected)} &lt;{selected.fromEmail}&gt;
                    </p>
                    <p>
                      <span className="font-medium text-zinc-800">To:</span> {selected.toEmail}
                    </p>
                    <p>
                      <span className="font-medium text-zinc-800">Mailbox:</span>{" "}
                      {selected.mailboxEmail}
                    </p>
                    <p>
                      <span className="font-medium text-zinc-800">Received:</span>{" "}
                      {formatDate(selected.receivedAt)}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selected.relatedOutboundId && (
                      <Badge tone="success" className="text-[10px]">
                        <Reply className="mr-1 inline h-3 w-3" />
                        Reply to your outreach
                      </Badge>
                    )}
                    {selected.contact && (
                      <Badge tone="default" className="text-[10px]">
                        Contact: {selected.contact.name || selected.contact.email}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    className="bg-blue-600 text-xs hover:bg-blue-700"
                    onClick={() => {
                      setReplyOpen(true);
                      setReplyError(null);
                      setReplyOk(null);
                    }}
                  >
                    <Reply className="mr-1 h-3.5 w-3.5" />
                    Reply
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelected(null);
                      setReplyOpen(false);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <CardContent className="flex-1 space-y-4 overflow-y-auto p-5">
                {selected.bodyHtml ? (
                  <div
                    className="prose prose-sm max-w-none text-zinc-800"
                    dangerouslySetInnerHTML={{ __html: selected.bodyHtml }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-800">
                    {selected.bodyText || "(Empty message body)"}
                  </pre>
                )}

                {replyOk && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    {replyOk}
                  </div>
                )}

                {replyOpen && (
                  <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                    <div className="flex items-center justify-between">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
                        <Reply className="h-4 w-4 text-blue-600" />
                        Reply from {selected.mailboxEmail}
                      </p>
                      <button
                        type="button"
                        className="text-zinc-400 hover:text-zinc-600"
                        onClick={() => setReplyOpen(false)}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      To: {selected.fromEmail} · Subject:{" "}
                      {/^re:/i.test(selected.subject)
                        ? selected.subject
                        : `Re: ${selected.subject}`}
                    </p>
                    <textarea
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      rows={6}
                      placeholder="Write your reply…"
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                    {replyError && <p className="text-xs text-red-600">{replyError}</p>}
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => setReplyOpen(false)}
                        disabled={replySending}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="bg-blue-600 text-xs hover:bg-blue-700"
                        onClick={() => void sendReply()}
                        disabled={replySending || !replyBody.trim()}
                      >
                        {replySending ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="mr-1 h-3.5 w-3.5" />
                        )}
                        Send reply
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </div>
          ) : (
            <div className="flex h-full min-h-[420px] flex-col items-center justify-center p-8 text-center">
              <Mail className="mb-3 h-10 w-10 text-zinc-300" />
              <p className="text-sm font-medium text-zinc-600">Select a message</p>
              <p className="mt-1 max-w-xs text-xs text-zinc-400">
                Choose an email to read it, then click Reply to answer from that mailbox.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
