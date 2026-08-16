import { PageHeader } from "@/components/layout/page-header";
import { SettingsClient } from "./settings-form";

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Engine Settings &amp; Infrastructure"
        description="Configure multi-inbox rotation, audit domain SPF/DKIM/DMARC DNS records, and build HTML signatures."
      />
      <SettingsClient />
    </div>
  );
}
