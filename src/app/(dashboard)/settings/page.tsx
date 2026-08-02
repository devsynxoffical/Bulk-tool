import { PageHeader } from "@/components/layout/page-header";
import { SettingsClient } from "./settings-form";

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Link your WhatsApp number and connect an email account for sending."
      />
      <div className="mx-auto max-w-3xl">
        <SettingsClient />
      </div>
    </div>
  );
}
