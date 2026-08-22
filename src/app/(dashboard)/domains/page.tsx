import { PageHeader } from "@/components/layout/page-header";
import { DomainManager } from "@/components/settings/domain-manager";

export default function DomainsPage() {
  return (
    <div>
      <PageHeader
        title="Sending Domains"
        description="Manage multiple domains with SPF, DKIM, and DMARC for deliverability at scale."
      />
      <DomainManager />
    </div>
  );
}
