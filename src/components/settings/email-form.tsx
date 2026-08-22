"use client";

import { useState } from "react";
import { MailboxManager } from "@/components/settings/mailbox-manager";
import { DomainManager } from "@/components/settings/domain-manager";
import { SignatureBuilder } from "@/components/settings/signature-builder";

type Tab = "mailboxes" | "domains" | "signature";

export function EmailForm() {
  const [tab, setTab] = useState<Tab>("mailboxes");

  const tabs: { id: Tab; label: string }[] = [
    { id: "mailboxes", label: "Mailboxes" },
    { id: "domains", label: "Domains & DNS" },
    { id: "signature", label: "Signature" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex border-b border-zinc-200 gap-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`pb-3 text-sm font-semibold border-b-2 transition ${
              tab === t.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-zinc-500 hover:text-zinc-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "mailboxes" && <MailboxManager />}
      {tab === "domains" && <DomainManager />}
      {tab === "signature" && <SignatureBuilder />}
    </div>
  );
}
