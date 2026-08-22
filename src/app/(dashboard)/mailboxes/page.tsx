import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { MailboxManager } from "@/components/settings/mailbox-manager";

export default function MailboxesPage() {
  return (
    <div>
      <PageHeader
        title="Sending Mailboxes"
        description="Connect and rotate multiple SMTP inboxes for high-volume cold email (target: 5,000/day)."
      />
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading mailboxes…</p>}>
        <MailboxManager />
      </Suspense>
    </div>
  );
}
