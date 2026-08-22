import { PageHeader } from "@/components/layout/page-header";
import { MailboxManager } from "@/components/settings/mailbox-manager";

export default function MailboxesPage() {
  return (
    <div>
      <PageHeader
        title="Sending Mailboxes"
        description="Connect and rotate multiple SMTP inboxes for high-volume cold email (target: 5,000/day)."
      />
      <MailboxManager />
    </div>
  );
}
