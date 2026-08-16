"use client";

import { EmailForm } from "@/components/settings/email-form";

export function SettingsClient() {
  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-200 pb-3">
        <h2 className="text-lg font-bold text-zinc-900">Email Engine &amp; Infrastructure Settings</h2>
        <p className="text-xs text-zinc-500">
          Manage multi-inbox round-robin rotation, verify domain DNS records, and build HTML email signatures.
        </p>
      </div>

      <EmailForm />
    </div>
  );
}
