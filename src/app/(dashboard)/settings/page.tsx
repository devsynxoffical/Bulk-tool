import { PageHeader } from "@/components/layout/page-header";
import { SettingsClient } from "./settings-form";

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Engine Settings &amp; Infrastructure"
        description="Configure send pace (hourly caps & intervals), multi-inbox rotation, domain SPF/DKIM/DMARC, and signatures."
      />
      <SettingsClient />
    </div>
  );
}
