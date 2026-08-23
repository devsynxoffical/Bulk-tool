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
  History,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { conversationKey, normalizeSubject } from "@/lib/email/thread";

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

type ThreadItem = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  receivedAt: string;
  relatedOutboundId: string | null;
  isRead?: boolean;
};

type ConversationRow = {
  key: string;
  latest: InboundMessage;
  messages: InboundMessage[];
  unreadCount: number;
  count: number;
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

function senderLabel(msg: Pick<InboundMessage, "fromName" | "fromEmail">) {
  return msg.fromName?.trim() || msg.fromEmail;
}

function replySubject(subject: string) {
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

function displaySubject(subject: string) {
  const base = normalizeSubject(subject);
  if (base === "(no subject)") return "(No subject)";
  // Title-case-ish from normalized lowercase subject for list
  return subject.replace(/^((re|fwd|fw)\s*:\s*)+/i, "").trim() || "(No subject)";
}

function stripQuotedTail(text: string): string {
  const lines = text.split("\n");
  const cut = lines.findIndex((line) =>
    /^(on .+ wrote:|>{1,}|from:\s)/i.test(line.trim()),
  );
  if (cut <= 0) return text.trim();
  return lines.slice(0, cut).join("\n").trim() || text.trim();
}

export function InboxClient() {
  const [mailboxes, setMailboxes] = useState<MailboxOption[]>([]);
  const [messages, setMessages] = useState<InboundMessage[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [deepSyncing, setDeepSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedInboxId, setSelectedInboxId] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selected, setSelected] = useState<InboundMessage | null>(null);
  const [threadItems, setThreadItems] = useState<ThreadItem[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
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

  const loadThread = useCallback(async (msg: InboundMessage) => {
    setThreadLoading(true);
    try {
      const res = await fetch(`/api/inbox/${msg.id}/thread`);
      if (!res.ok) {
        setThreadItems([
          {
            id: msg.id,
            direction: "INBOUND",
            fromEmail: msg.fromEmail,
            fromName: msg.fromName,
            toEmail: msg.toEmail,
            subject: msg.subject,
            bodyText: msg.bodyText,
            bodyHtml: msg.bodyHtml,
            receivedAt: msg.receivedAt,
            relatedOutboundId: msg.relatedOutboundId,
            isRead: msg.isRead,
          },
        ]);
        return;
      }
      const data = await res.json();
      setThreadItems(data.items || []);
    } catch {
      setThreadItems([]);
    } finally {
      setThreadLoading(false);
    }
  }, []);

  async function syncNow(deep = false) {
    if (deep) setDeepSyncing(true);
    else setSyncing(true);
    try {
      await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deep }),
      });
      await loadInbox({ silent: true });
      if (selected) await loadThread(selected);
    } finally {
      setSyncing(false);
      setDeepSyncing(false);
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

  function openConversation(row: ConversationRow) {
    const msg = row.latest;
    setSelected(msg);
    setReplyBody("");
    setReplyError(null);
    setReplyOk(null);
    void markRead(msg);
    // Mark other unread in this thread as read (best-effort)
    for (const m of row.messages) {
      if (!m.isRead && m.id !== msg.id) void markRead(m);
    }
    void loadThread(msg);
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
      await loadThread(selected);
      await loadInbox({ silent: true });
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

  const conversations = useMemo(() => {
    const map = new Map<string, ConversationRow>();
    for (const msg of messages) {
      const key = conversationKey(msg.inboxId, msg.fromEmail, msg.subject);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          latest: msg,
          messages: [msg],
          unreadCount: msg.isRead ? 0 : 1,
          count: 1,
        });
      } else {
        existing.messages.push(msg);
        existing.count += 1;
        if (!msg.isRead) existing.unreadCount += 1;
        if (
          new Date(msg.receivedAt).getTime() >
          new Date(existing.latest.receivedAt).getTime()
        ) {
          existing.latest = msg;
        }
      }
    }
    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.latest.receivedAt).getTime() -
        new Date(a.latest.receivedAt).getTime(),
    );
  }, [messages]);

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter((row) => {
      const msg = row.latest;
      return (
        msg.fromEmail.toLowerCase().includes(q) ||
        Boolean(msg.fromName?.toLowerCase().includes(q)) ||
        msg.subject.toLowerCase().includes(q) ||
        msg.bodyText.toLowerCase().includes(q) ||
        msg.mailboxEmail.toLowerCase().includes(q) ||
        row.messages.some(
          (m) =>
            m.subject.toLowerCase().includes(q) ||
            m.bodyText.toLowerCase().includes(q),
        )
      );
    });
  }, [conversations, search]);

  const selectedMailbox = mailboxes.find((m) => m.id === selectedInboxId);
  const syncErrors = mailboxes.filter((m) => m.inboxSyncError);
  const activeCount = mailboxes.filter((m) => m.isActive).length;
  const selectedKey = selected
    ? conversationKey(selected.inboxId, selected.fromEmail, selected.subject)
    : null;

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
              Conversations across sending mailboxes — older replies stay in the
              thread.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void syncNow(true)}
              disabled={deepSyncing || syncing || loading}
              className="w-fit"
              title="Re-scan IMAP for older messages in threads"
            >
              <History
                className={`h-3.5 w-3.5 ${deepSyncing ? "animate-spin" : ""}`}
              />
              {deepSyncing ? "Loading older…" : "Load older mail"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void syncNow(false)}
              disabled={syncing || deepSyncing || loading}
              className="w-fit"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`}
              />
              {syncing ? "Syncing…" : "Sync now"}
            </Button>
          </div>
        </div>

        {syncErrors.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p className="flex items-center gap-1.5 font-semibold">
              <AlertCircle className="h-3.5 w-3.5" />
              {syncErrors.length} mailbox{syncErrors.length === 1 ? "" : "es"}{" "}
              failed IMAP sync
            </p>
            <p className="mt-1 text-amber-800">
              Check credentials on{" "}
              <Link href="/mailboxes" className="font-medium underline">
                Sending Mailboxes
              </Link>
              . IMAP needs{" "}
              <code className="rounded bg-amber-100 px-1">mail.domain.com</code>
              , not an SMTP relay host.
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
              setThreadItems([]);
              setReplyBody("");
              setReplyOk(null);
              setReplyError(null);
            }}
            className="h-9 min-w-[220px] rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500/25"
          >
            <option value="">All mailboxes ({mailboxes.length})</option>
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
        {/* Conversation list */}
        <div className="flex min-h-0 flex-col border-r border-zinc-200 bg-white">
          <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-4 py-2.5">
            <p className="text-xs font-semibold text-zinc-600">
              {filtered.length} conversation
              {filtered.length === 1 ? "" : "s"}
            </p>
            {loading && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && filtered.length === 0 ? (
              <p className="p-8 text-center text-sm text-zinc-500">
                Loading inbox…
              </p>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-16 text-center">
                <Mail className="mb-3 h-8 w-8 text-zinc-300" />
                <p className="text-sm font-medium text-zinc-600">
                  No conversations
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  Try Load older mail, or Sync now.
                </p>
              </div>
            ) : (
              filtered.map((row) => {
                const msg = row.latest;
                const active = selectedKey === row.key;
                const hasUnread = row.unreadCount > 0;
                return (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => openConversation(row)}
                    className={`w-full border-b border-zinc-100 px-4 py-3 text-left transition-colors ${
                      active
                        ? "border-l-2 border-l-blue-600 bg-blue-50"
                        : "border-l-2 border-l-transparent hover:bg-zinc-50"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          hasUnread ? "bg-blue-600" : "bg-transparent"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p
                            className={`truncate text-[13px] ${
                              hasUnread
                                ? "font-semibold text-zinc-900"
                                : "font-medium text-zinc-700"
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
                            hasUnread
                              ? "font-medium text-zinc-800"
                              : "text-zinc-500"
                          }`}
                        >
                          {displaySubject(msg.subject)}
                          {row.count > 1 && (
                            <span className="ml-1.5 text-[10px] font-semibold text-blue-600">
                              · {row.count}
                            </span>
                          )}
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
                        {displaySubject(selected.subject)}
                      </h2>
                      {threadItems.length > 1 && (
                        <Badge tone="default">
                          {threadItems.length} in thread
                        </Badge>
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
                        <span className="font-medium text-zinc-800">With:</span>{" "}
                        {senderLabel(selected)} &lt;{selected.fromEmail}&gt;
                      </div>
                      <div>
                        <span className="font-medium text-zinc-800">
                          Mailbox:
                        </span>{" "}
                        {selected.mailboxEmail}
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
                      setThreadItems([]);
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

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5">
                {threadLoading && threadItems.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-zinc-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading conversation…
                  </p>
                ) : (
                  threadItems.map((item) => {
                    const outbound = item.direction === "OUTBOUND";
                    const plain = stripQuotedTail(item.bodyText);
                    return (
                      <div
                        key={`${item.direction}-${item.id}`}
                        className={`rounded-xl border p-4 shadow-xs ${
                          outbound
                            ? "ml-6 border-blue-100 bg-blue-50/70"
                            : "mr-6 border-zinc-200 bg-white"
                        }`}
                      >
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
                          <p className="font-medium text-zinc-700">
                            {outbound ? "You" : senderLabel(item)}
                            <span className="font-normal text-zinc-400">
                              {" "}
                              &lt;{item.fromEmail}&gt;
                            </span>
                          </p>
                          <span>{formatDate(item.receivedAt)}</span>
                        </div>
                        {!outbound && item.bodyHtml ? (
                          <div
                            className="prose prose-sm max-w-none break-words text-zinc-800 prose-a:text-blue-600"
                            dangerouslySetInnerHTML={{ __html: item.bodyHtml }}
                          />
                        ) : (
                          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-zinc-800">
                            {plain || "(Empty message body)"}
                          </pre>
                        )}
                      </div>
                    );
                  })
                )}
                {!threadLoading && threadItems.length <= 1 && (
                  <p className="text-center text-[11px] text-zinc-400">
                    Missing older messages? Click{" "}
                    <button
                      type="button"
                      className="font-medium text-blue-600 underline"
                      onClick={() => void syncNow(true)}
                    >
                      Load older mail
                    </button>{" "}
                    to pull more history from IMAP.
                  </p>
                )}
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
                    Sends via this mailbox’s SMTP · threaded reply headers
                    included
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
                Select a conversation to read & reply
              </p>
              <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-zinc-400">
                Related emails are grouped into one thread. Open any conversation
                to see the full history, including your sent replies.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
