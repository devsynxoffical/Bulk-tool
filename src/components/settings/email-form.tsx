"use client";

import { useState } from "react";
import { MailboxManager } from "@/components/settings/mailbox-manager";
import { DomainManager } from "@/components/settings/domain-manager";
import { SignatureBuilder } from "@/components/settings/signature-builder";
import { EnginePacingSettings } from "@/components/settings/engine-pacing-settings";

type Tab = "pacing" | "mailboxes" | "domains" | "signature";

export function EmailForm() {
  const [tab, setTab] = useState<Tab>("pacing");

  const tabs: { id: Tab; label: string }[] = [
    { id: "pacing", label: "Pace & Warmup" },
    { id: "mailboxes", label: "Mailboxes" },
    { id: "domains", label: "Domains & DNS" },
    { id: "signature", label: "Signature" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex border-b border-zinc-200 gap-6 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 pb-3 text-sm font-semibold border-b-2 transition ${
              tab === t.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-zinc-500 hover:text-zinc-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "pacing" && <EnginePacingSettings />}
      {tab === "mailboxes" && <MailboxManager />}
      {tab === "domains" && <DomainManager />}
      {tab === "signature" && <SignatureBuilder />}
    </div>
  );
}
