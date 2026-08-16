"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { format, isToday, isYesterday } from "date-fns";
import {
  Check,
  CheckCheck,
  MessageCircle,
  PenSquare,
  Search,
  Send,
  Smile,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ConversationListItem = {
  id: string;
  channel: "WHATSAPP" | "EMAIL";
  lastMessageAt: string;
  lastMessagePreview: string | null;
  unreadCount: number;
  windowExpiresAt: string | null;
  contact: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
  };
};

type ConversationDetail = ConversationListItem & {
  messages: Array<{
    id: string;
    direction: "INBOUND" | "OUTBOUND";
    body: string | null;
    subject: string | null;
    type: string;
    createdAt: string;
    status: string;
  }>;
};

function initials(name?: string | null, fallback?: string | null) {
  const source = name || fallback || "?";
  return source
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function avatarColor(id: string) {
  const colors = [
    "bg-[#00a884]",
    "bg-[#53bdeb]",
    "bg-[#06cf9c]",
    "bg-[#027eb5]",
    "bg-[#7f66ff]",
    "bg-[#ff7a59]",
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % colors.length;
  return colors[hash];
}

function formatListTime(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "dd/MM/yyyy");
}

function formatMessageTime(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return format(d, "HH:mm");
}

function StatusTicks({ status }: { status: string }) {
  if (status === "READ") {
    return <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />;
  }
  if (status === "DELIVERED" || status === "SENT") {
    return <CheckCheck className="h-3.5 w-3.5 text-[#667781]" />;
  }
  return <Check className="h-3.5 w-3.5 text-[#667781]" />;
}

export function InboxClient({
  initialConversations,
}: {
  initialConversations: ConversationListItem[];
}) {
  const searchParams = useSearchParams();
  const presetId = searchParams.get("c");

  const [conversations, setConversations] = useState(initialConversations);
  const [channelFilter, setChannelFilter] = useState<"ALL" | "WHATSAPP" | "EMAIL">("ALL");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    presetId || initialConversations[0]?.id || null,
  );
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (channelFilter === "WHATSAPP" && c.channel !== "WHATSAPP") return false;
      if (channelFilter === "EMAIL" && c.channel !== "EMAIL") return false;
      if (!q) return true;
      return (
        (c.contact.name || "").toLowerCase().includes(q) ||
        (c.contact.phone || "").includes(q) ||
        (c.contact.email || "").toLowerCase().includes(q) ||
        (c.lastMessagePreview || "").toLowerCase().includes(q)
      );
    });
  }, [conversations, query, channelFilter]);

  useEffect(() => {
    let cancelled = false;

    async function refreshList() {
      try {
        const res = await fetch("/api/inbox");
        if (!res.ok) return;
        const data = (await res.json()) as ConversationListItem[];
        if (!cancelled) setConversations(data);
      } catch {
        // ignore transient errors
      }
    }

    async function refreshDetail() {
      if (!selectedId) return;
      try {
        const res = await fetch(`/api/inbox?conversationId=${selectedId}`);
        if (!res.ok) return;
        const data = (await res.json()) as ConversationDetail;
        if (!cancelled) {
          setDetail(data);
          setConversations((prev) =>
            prev.map((c) => (c.id === selectedId ? { ...c, unreadCount: 0 } : c)),
          );
        }
      } catch {
        // ignore transient errors
      }
    }

    void refreshList();
    void refreshDetail();
    const id = setInterval(() => {
      void refreshList();
      void refreshDetail();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages.length, selectedId]);

  async function sendReply(e?: React.FormEvent) {
    e?.preventDefault();
    if (!selectedId || !body.trim()) return;
    setLoading(true);
    setError("");
    const res = await fetch(`/api/inbox/${selectedId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Failed to send");
      return;
    }
    setBody("");
    const replyMsg = (data.message as ConversationDetail["messages"][number]) ?? data;
    setDetail((prev) =>
      prev
        ? {
            ...prev,
            messages: [...prev.messages, replyMsg],
            lastMessagePreview: replyMsg.body,
            lastMessageAt: replyMsg.createdAt || new Date().toISOString(),
          }
        : prev,
    );
    setConversations((prev) => {
      const updated = prev.map((c) =>
        c.id === selectedId
          ? {
              ...c,
              lastMessagePreview: replyMsg.body,
              lastMessageAt: replyMsg.createdAt || new Date().toISOString(),
            }
          : c,
      );
      return [...updated].sort(
        (a, b) =>
          new Date(b.lastMessageAt).getTime() -
          new Date(a.lastMessageAt).getTime(),
      );
    });
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendReply();
    }
  }

  const displayName =
    detail?.contact.name || detail?.contact.phone || "Chat";

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden bg-[#111b21] text-[#e9edef]">
      {/* Chat list */}
      <aside
        className={cn(
          "flex w-full max-w-full shrink-0 flex-col border-r border-[#222d34] bg-[#111b21] md:max-w-[400px] md:w-[380px]",
          selectedId && detail ? "hidden md:flex" : "flex",
        )}
      >
        <div className="flex items-center justify-between bg-[#202c33] px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#00a884]">
              <MessageCircle className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#e9edef]">Inbox</p>
              <p className="text-[11px] text-[#8696a0]">Talk to clients one-to-one</p>
            </div>
          </div>
          <Link
            href="/compose"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#aebac1] transition hover:bg-[#2a3942] hover:text-white"
            title="New chat"
          >
            <PenSquare className="h-4 w-4" />
          </Link>
        </div>

        <div className="bg-[#111b21] px-3 py-2 space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8696a0]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or start a new chat"
              className="h-9 w-full rounded-lg border-0 bg-[#202c33] pl-9 pr-3 text-sm text-[#e9edef] placeholder:text-[#8696a0] outline-none focus:ring-1 focus:ring-[#00a884]/40"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-sm text-[#8696a0]">No chats yet</p>
              <Link
                href="/compose"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#00a884] hover:underline"
              >
                <PenSquare className="h-3.5 w-3.5" />
                Start a conversation
              </Link>
            </div>
          ) : (
            filtered.map((c) => {
              const name = c.contact.name || c.contact.phone || "Unknown";
              const active = selectedId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    "flex w-full items-center gap-3 border-b border-[#222d34] px-3 py-3 text-left transition cursor-pointer",
                    active ? "bg-[#2a3942]" : "hover:bg-[#202c33]",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white",
                      avatarColor(c.contact.id),
                    )}
                  >
                    {initials(c.contact.name, c.contact.phone)}
                  </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[15px] font-medium text-[#e9edef] flex items-center gap-1.5">
                          <span>{c.channel === "EMAIL" ? "✉️" : "💬"}</span>
                          <span>{name}</span>
                        </p>
                        <span className="shrink-0 text-[11px] text-[#8696a0]">
                          {formatListTime(c.lastMessageAt)}
                        </span>
                      </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <p className="truncate text-[13px] text-[#8696a0]">
                        {c.lastMessagePreview || "No messages yet"}
                      </p>
                      {c.unreadCount > 0 ? (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#00a884] px-1.5 text-[10px] font-semibold text-[#111b21]">
                          {c.unreadCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Chat pane */}
      <section
        className={cn(
          "min-w-0 flex-1 flex-col",
          selectedId && detail ? "flex" : "hidden md:flex",
        )}
      >
        {detail && selectedId ? (
          <>
            <header className="flex items-center justify-between bg-[#202c33] px-4 py-2.5">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="mr-1 text-[#aebac1] md:hidden cursor-pointer"
                  onClick={() => setSelectedId(null)}
                >
                  ←
                </button>
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white",
                    avatarColor(detail.contact.id),
                  )}
                >
                  {initials(detail.contact.name, detail.contact.phone)}
                </div>
                <div>
                  <p className="text-[15px] font-medium text-[#e9edef]">
                    {displayName}
                  </p>
                  <p className="text-[12px] text-[#8696a0]">Online</p>
                </div>
              </div>
              <Link
                href={`/compose?phone=${encodeURIComponent(detail.contact.phone || "")}&name=${encodeURIComponent(detail.contact.name || "")}`}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-[#00a884] transition hover:bg-[#2a3942]"
              >
                New chat
              </Link>
            </header>

            <div
              className="relative flex-1 overflow-y-auto px-4 py-3 md:px-10"
              style={{
                backgroundColor: "#0b141a",
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
              }}
            >
              <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
                {detail.messages.map((m) => {
                  const outbound = m.direction === "OUTBOUND";
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "flex",
                        outbound ? "justify-end" : "justify-start",
                      )}
                    >
                      <div
                        className={cn(
                          "relative max-w-[85%] rounded-lg px-2.5 py-1.5 text-[14.2px] leading-snug shadow-sm sm:max-w-[65%]",
                          outbound
                            ? "rounded-tr-none bg-[#005c4b] text-[#e9edef]"
                            : "rounded-tl-none bg-[#202c33] text-[#e9edef]",
                        )}
                      >
                        {m.subject ? (
                          <p className="mb-0.5 text-[11px] font-semibold text-[#53bdeb]">
                            {m.subject}
                          </p>
                        ) : null}
                        {m.type === "template" ? (
                          <p className="mb-0.5 text-[10px] uppercase tracking-wide text-[#8696a0]">
                            Template
                          </p>
                        ) : null}
                        <p className="whitespace-pre-wrap break-words">
                          {m.body || m.type}
                        </p>
                        <div className="mt-0.5 flex items-center justify-end gap-1">
                          <span className="text-[10px] text-[#8696a0]">
                            {formatMessageTime(m.createdAt)}
                          </span>
                          {outbound ? <StatusTicks status={m.status} /> : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            </div>

            <form
              onSubmit={sendReply}
              className="flex items-end gap-2 bg-[#202c33] px-3 py-2.5"
            >
              <button
                type="button"
                className="mb-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#8696a0] cursor-default"
                tabIndex={-1}
                aria-hidden
              >
                <Smile className="h-5 w-5 opacity-40" />
              </button>
              <textarea
                ref={inputRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Type a message"
                className="max-h-28 min-h-[42px] flex-1 resize-none rounded-lg border-0 bg-[#2a3942] px-3 py-2.5 text-sm text-[#e9edef] placeholder:text-[#8696a0] outline-none"
              />
              <button
                type="submit"
                disabled={loading || !body.trim()}
                className="mb-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white transition hover:bg-[#06cf9c] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>

            {error ? (
              <div className="bg-[#202c33] px-4 py-2 text-center text-xs text-[#ea4335]">
                {error}
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center bg-[#222e35] px-6 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#2563eb]/15">
              <MessageCircle className="h-8 w-8 text-[#2563eb]" />
            </div>
            <h2 className="text-2xl font-light text-[#e9edef]">
              Email Outreach Inbox
            </h2>
            <p className="mt-2 max-w-sm text-sm text-[#8696a0]">
              Select an email thread to view responses, or compose a new direct email message.
            </p>
            <Link
              href="/compose"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#2563eb] px-4 py-2 text-sm font-medium text-white hover:bg-[#1d4ed8]"
            >
              <PenSquare className="h-4 w-4" />
              Compose New Email
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
