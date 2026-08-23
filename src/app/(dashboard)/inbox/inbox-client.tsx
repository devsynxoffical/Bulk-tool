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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type MailboxOption = {
  id: string;
  fromEmail: string;
  fromName: string | null;
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

function displayName(msg: InboundMessage) {
  return msg.fromName?.trim() || msg.fromEmail;
}

export function InboxClient() {
  const [mailboxes, setMailboxes] = useState<MailboxOption[]>([]);
  const [messages, setMessages] = useState<InboundMessage[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedInboxId, setSelectedInboxId] = useState("");
  const [filterUnread, setFilterUnread] = useState(false);
  const [selected, setSelected] = useState<InboundMessage | null>(null);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedInboxId) params.set("inboxId", selectedInboxId);
      if (filterUnread) params.set("unreadOnly", "true");
      const res = await fetch(`/api/inbox?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setMailboxes(data.mailboxes || []);
      setMessages(data.messages || []);
      setTotalUnread(data.stats?.totalUnread ?? 0);
    } catch {
      // ignore transient errors
    } finally {
      setLoading(false);
    }
  }, [selectedInboxId, filterUnread]);

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
    } catch {
      // ignore
    }
  }

  function openMessage(msg: InboundMessage) {
    setSelected(msg);
    void markRead(msg);
  }

  useEffect(() => {
    void loadInbox();
    const interval = setInterval(() => void loadInbox(), 15000);
    return () => clearInterval(interval);
  }, [loadInbox]);

  const filtered = messages.filter((msg) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      msg.fromEmail.toLowerCase().includes(q) ||
      (msg.fromName && msg.fromName.toLowerCase().includes(q)) ||
      msg.subject.toLowerCase().includes(q) ||
      msg.bodyText.toLowerCase().includes(q) ||
      msg.mailboxEmail.toLowerCase().includes(q)
    );
  });

  const selectedMailbox = mailboxes.find((m) => m.id === selectedInboxId);
  const syncErrors = mailboxes.filter((m) => m.inboxSyncError);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
            <Inbox className="h-5 w-5 text-blue-600" />
            Mailbox Inbox
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Replies and incoming mail from your sending mailboxes — filtered per mailbox.
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
          <Link href="/compose">
            <Button size="sm" className="text-xs bg-blue-600 hover:bg-blue-700">
              Compose reply
            </Button>
          </Link>
        </div>
      </div>

      {syncErrors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-900">
          <p className="font-semibold flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            Some mailboxes could not sync via IMAP
          </p>
          <ul className="mt-2 space-y-1 list-disc list-inside">
            {syncErrors.map((mb) => (
              <li key={mb.id}>
                <span className="font-medium">{mb.fromEmail}</span>: {mb.inboxSyncError}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-amber-800">
            Check username/password on{" "}
            <Link href="/mailboxes" className="underline font-medium">
              Sending Mailboxes
            </Link>
            . IMAP uses the same host as SMTP.
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
              Active mailboxes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-900">{mailboxes.length}</div>
          </CardContent>
        </Card>
        <Card className="border-zinc-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase text-zinc-500">
              Showing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-semibold text-zinc-900 truncate">
              {selectedMailbox ? selectedMailbox.fromEmail : "All mailboxes"}
            </div>
            {selectedMailbox?.lastInboxSyncAt && (
              <p className="text-[11px] text-zinc-500 mt-1">
                Last sync {formatDate(selectedMailbox.lastInboxSyncAt)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 min-w-0">
          <label htmlFor="mailbox-filter" className="text-xs font-medium text-zinc-600 shrink-0">
            Mailbox
          </label>
          <select
            id="mailbox-filter"
            value={selectedInboxId}
            onChange={(e) => {
              setSelectedInboxId(e.target.value);
              setSelected(null);
            }}
            className="h-9 min-w-[220px] max-w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="">All mailboxes</option>
            {mailboxes.map((mb) => (
              <option key={mb.id} value={mb.id}>
                {mb.fromName ? `${mb.fromName} · ` : ""}
                {mb.fromEmail}
                {mb.unreadCount > 0 ? ` (${mb.unreadCount} unread)` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={filterUnread ? "default" : "outline"}
            className={`text-xs ${filterUnread ? "bg-blue-600 hover:bg-blue-700" : ""}`}
            onClick={() => setFilterUnread((v) => !v)}
          >
            Unread only
          </Button>
        </div>

        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sender, subject, mailbox…"
            className="pl-9 h-9 text-sm"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2 border-zinc-200 overflow-hidden">
          <div className="border-b border-zinc-100 px-4 py-2.5 bg-zinc-50/80">
            <p className="text-xs font-semibold text-zinc-600">
              {filtered.length} message{filtered.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="max-h-[520px] overflow-y-auto divide-y divide-zinc-100">
            {loading && filtered.length === 0 ? (
              <p className="p-6 text-sm text-zinc-500 text-center">Loading inbox…</p>
            ) : filtered.length === 0 ? (
              <p className="p-6 text-sm text-zinc-500 text-center">
                No messages yet for this filter.
              </p>
            ) : (
              filtered.map((msg) => (
                <button
                  key={msg.id}
                  type="button"
                  onClick={() => openMessage(msg)}
                  className={`w-full text-left px-4 py-3 hover:bg-blue-50/50 transition-colors ${
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
                          className={`text-sm truncate ${
                            !msg.isRead ? "font-bold text-zinc-900" : "font-medium text-zinc-700"
                          }`}
                        >
                          {displayName(msg)}
                        </p>
                      </div>
                      <p className="text-xs text-zinc-500 truncate mt-0.5">{msg.subject}</p>
                      {!selectedInboxId && (
                        <Badge tone="default" className="mt-1.5 text-[10px]">
                          {msg.mailboxEmail}
                        </Badge>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-400 shrink-0">
                      {formatDate(msg.receivedAt)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>

        <Card className="lg:col-span-3 border-zinc-200 min-h-[520px]">
          {selected ? (
            <div className="flex flex-col h-full">
              <div className="border-b border-zinc-100 px-5 py-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-zinc-900">{selected.subject}</h2>
                  <div className="mt-2 space-y-1 text-xs text-zinc-600">
                    <p>
                      <span className="font-medium text-zinc-800">From:</span>{" "}
                      {displayName(selected)} &lt;{selected.fromEmail}&gt;
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
                  <div className="flex flex-wrap gap-2 mt-3">
                    {selected.relatedOutboundId && (
                      <Badge tone="success" className="text-[10px]">
                        <Reply className="h-3 w-3 mr-1 inline" />
                        Reply to your outreach
                      </Badge>
                    )}
                    {selected.contact && (
                      <Link href={`/contacts`}>
                        <Badge tone="default" className="text-[10px] hover:bg-zinc-100">
                          Contact: {selected.contact.name || selected.contact.email}
                        </Badge>
                      </Link>
                    )}
                    {!selected.isRead && (
                      <Badge tone="warning" className="text-[10px]">
                        Unread
                      </Badge>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(null)}
                  className="shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <CardContent className="flex-1 overflow-y-auto p-5">
                {selected.bodyHtml ? (
                  <div
                    className="prose prose-sm max-w-none text-zinc-800"
                    dangerouslySetInnerHTML={{ __html: selected.bodyHtml }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap text-sm text-zinc-800 font-sans">
                    {selected.bodyText || "(Empty message body)"}
                  </pre>
                )}
              </CardContent>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[420px] text-center p-8">
              <Mail className="h-10 w-10 text-zinc-300 mb-3" />
              <p className="text-sm font-medium text-zinc-600">Select a message</p>
              <p className="text-xs text-zinc-400 mt-1 max-w-xs">
                Choose an email from the list to read it here. New mail arrives via IMAP IDLE
                (near-instant).
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
