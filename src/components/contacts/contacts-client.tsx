"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  CheckSquare,
  Filter,
  Mail,
  MessageCircle,
  Plus,
  Search,
  Send,
  Square,
  Users,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { ContactActions } from "@/components/contacts/contact-actions";

type SerializedContact = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  tags: string[];
  optedOut: boolean;
  emailOptedOut: boolean;
  customFields?: Record<string, unknown> | null;
  createdAt: string;
};

export function ContactsClient({ initialContacts }: { initialContacts: SerializedContact[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState("ALL");
  const [channelFilter, setChannelFilter] = useState<"ALL" | "WHATSAPP" | "EMAIL">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OPTED_IN" | "OPTED_OUT">("ALL");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Extract all unique tags across contacts
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of initialContacts) {
      for (const t of c.tags) {
        if (t) set.add(t);
      }
    }
    return Array.from(set).sort();
  }, [initialContacts]);

  // Filtered contacts based on search, tag, channel, status
  const filteredContacts = useMemo(() => {
    return initialContacts.filter((c) => {
      // 1. Search Query
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const nameMatch = (c.name || "").toLowerCase().includes(q);
        const phoneMatch = (c.phone || "").toLowerCase().includes(q);
        const emailMatch = (c.email || "").toLowerCase().includes(q);
        const tagMatch = c.tags.some((t) => t.toLowerCase().includes(q));
        if (!nameMatch && !phoneMatch && !emailMatch && !tagMatch) return false;
      }

      // 2. Tag Filter
      if (selectedTag !== "ALL") {
        if (!c.tags.includes(selectedTag)) return false;
      }

      // 3. Channel Filter
      if (channelFilter === "WHATSAPP") {
        if (!c.phone || c.optedOut) return false;
      } else if (channelFilter === "EMAIL") {
        if (!c.email || c.emailOptedOut) return false;
      }

      // 4. Status Filter
      if (statusFilter === "OPTED_IN") {
        if (c.optedOut && c.emailOptedOut) return false;
      } else if (statusFilter === "OPTED_OUT") {
        if (!c.optedOut && !c.emailOptedOut) return false;
      }

      return true;
    });
  }, [initialContacts, search, selectedTag, channelFilter, statusFilter]);

  // Metrics Counters
  const totalCount = initialContacts.length;
  const whatsappCount = useMemo(
    () => initialContacts.filter((c) => c.phone && !c.optedOut).length,
    [initialContacts]
  );
  const emailCount = useMemo(
    () => initialContacts.filter((c) => c.email && !c.emailOptedOut).length,
    [initialContacts]
  );
  const selectedCount = selectedIds.size;

  // Checkbox helpers
  const allFilteredSelected =
    filteredContacts.length > 0 &&
    filteredContacts.every((c) => selectedIds.has(c.id));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      const next = new Set(selectedIds);
      for (const c of filteredContacts) {
        next.delete(c.id);
      }
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      for (const c of filteredContacts) {
        next.add(c.id);
      }
      setSelectedIds(next);
    }
  }

  function toggleSelectOne(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  }

  // Bulk actions
  const selectedContacts = useMemo(() => {
    return initialContacts.filter((c) => selectedIds.has(c.id));
  }, [initialContacts, selectedIds]);

  function bulkSendWhatsApp() {
    const phones = selectedContacts
      .map((c) => c.phone)
      .filter((p): p is string => Boolean(p));
    if (phones.length === 0) return;
    router.push(`/compose?phone=${encodeURIComponent(phones[0])}`);
  }

  function bulkSendEmail() {
    const emails = selectedContacts
      .map((c) => c.email)
      .filter((e): e is string => Boolean(e));
    if (emails.length === 0) return;
    router.push(`/compose?email=${encodeURIComponent(emails[0])}`);
  }

  function createCampaignForSelected() {
    const tag = selectedTag !== "ALL" ? selectedTag : "selected-leads";
    router.push(`/campaigns/new?tag=${encodeURIComponent(tag)}`);
  }

  return (
    <div className="space-y-6">
      {/* ── Summary Stats Cards ──────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 bg-white shadow-xs border-zinc-200">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500">Total Clients / Leads</p>
              <p className="text-xl font-bold text-zinc-900">{totalCount}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-white shadow-xs border-zinc-200">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500">WhatsApp Reachable</p>
              <p className="text-xl font-bold text-zinc-900">{whatsappCount}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-white shadow-xs border-zinc-200">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500">Email Reachable</p>
              <p className="text-xl font-bold text-zinc-900">{emailCount}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-white shadow-xs border-zinc-200">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <CheckSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500">Selected Leads</p>
              <p className="text-xl font-bold text-zinc-900">{selectedCount}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Filters Bar ─────────────────────────────────────────────── */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-1 flex-wrap items-center gap-2 min-w-[280px]">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
              <Input
                placeholder="Search leads by name, phone, email, or tag…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>

            <Select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="w-40 text-xs"
            >
              <option value="ALL">All Scraped Tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>

            <Select
              value={channelFilter}
              onChange={(e) =>
                setChannelFilter(e.target.value as "ALL" | "WHATSAPP" | "EMAIL")
              }
              className="w-36 text-xs"
            >
              <option value="ALL">All Channels</option>
              <option value="WHATSAPP">WhatsApp Only</option>
              <option value="EMAIL">Email Only</option>
            </Select>

            <Select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "ALL" | "OPTED_IN" | "OPTED_OUT")
              }
              className="w-36 text-xs"
            >
              <option value="ALL">All Statuses</option>
              <option value="OPTED_IN">Opted In</option>
              <option value="OPTED_OUT">Opted Out</option>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <ContactActions />
          </div>
        </div>
      </Card>

      {/* ── Floating / Fixed Selected Action Toolbar ────────────────── */}
      {selectedCount > 0 ? (
        <div className="sticky top-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/95 p-3.5 shadow-md backdrop-blur-xs">
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-950">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              {selectedCount}
            </span>
            <span>Leads Selected</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={bulkSendWhatsApp} className="bg-[#00a884] hover:bg-[#008f70]">
              <MessageCircle className="h-4 w-4" />
              Send Bulk WhatsApp
            </Button>
            <Button size="sm" onClick={bulkSendEmail} className="bg-blue-600 hover:bg-blue-700">
              <Mail className="h-4 w-4" />
              Send Bulk Email
            </Button>
            <Button size="sm" variant="outline" onClick={createCampaignForSelected}>
              <Send className="h-3.5 w-3.5" />
              Create Campaign
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
              className="text-zinc-600"
            >
              <X className="h-4 w-4" />
              Deselect All
            </Button>
          </div>
        </div>
      ) : null}

      {/* ── Leads Table ─────────────────────────────────────────────── */}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50/80 text-[11px] uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium w-10">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="flex items-center text-zinc-500 hover:text-zinc-900"
                  >
                    {allFilteredSelected ? (
                      <CheckSquare className="h-4 w-4 text-blue-600" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Phone (WhatsApp)</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Source / Tags</th>
                <th className="px-4 py-3 font-medium">Channels</th>
                <th className="px-4 py-3 font-medium">Added</th>
                <th className="px-4 py-3 font-medium text-right">Quick Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-zinc-500">
                    No leads found matching your search filters.
                  </td>
                </tr>
              ) : (
                filteredContacts.map((c) => {
                  const isSelected = selectedIds.has(c.id);
                  return (
                    <tr
                      key={c.id}
                      className={`border-b border-zinc-50 last:border-0 transition ${
                        isSelected ? "bg-blue-50/40" : "hover:bg-zinc-50/50"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleSelectOne(c.id)}
                          className="flex items-center text-zinc-400 hover:text-zinc-700"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-blue-600" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium text-zinc-900">
                        {c.name || "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                        {c.phone || "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                        {c.email || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {c.tags.length
                            ? c.tags.map((t) => (
                                <Badge key={t} tone="default">
                                  {t}
                                </Badge>
                              ))
                            : "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {c.phone && !c.optedOut ? (
                            <Badge tone="success">WA</Badge>
                          ) : null}
                          {c.email && !c.emailOptedOut ? (
                            <Badge tone="info">Email</Badge>
                          ) : null}
                          {c.optedOut ? <Badge tone="danger">WA Opted Out</Badge> : null}
                          {c.emailOptedOut ? <Badge tone="danger">Email Opted Out</Badge> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-400">
                        {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          {c.phone && !c.optedOut ? (
                            <Link href={`/compose?phone=${encodeURIComponent(c.phone)}&name=${encodeURIComponent(c.name || "")}`}>
                              <Button size="sm" variant="outline" className="h-7 text-xs">
                                WA
                              </Button>
                            </Link>
                          ) : null}
                          {c.email && !c.emailOptedOut ? (
                            <Link href={`/compose?email=${encodeURIComponent(c.email)}&name=${encodeURIComponent(c.name || "")}`}>
                              <Button size="sm" variant="outline" className="h-7 text-xs">
                                Email
                              </Button>
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
