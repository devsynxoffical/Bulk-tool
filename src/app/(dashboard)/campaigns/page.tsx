import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requirePageSession } from "@/lib/page-auth";
import { CampaignsList } from "./campaigns-list";

export default async function CampaignsPage() {
  const { scope } = await requirePageSession();
  const campaigns = await prisma.campaign.findMany({
    where: scope,
    orderBy: { createdAt: "desc" },
    include: { template: true },
  });

  return (
    <div>
      <PageHeader
        title="Outreach Campaigns"
        description="Launch cold email campaigns and track multi-inbox rotation delivery."
        actions={
          <Link href="/campaigns/new">
            <Button>New Cold Campaign</Button>
          </Link>
        }
      />
      <CampaignsList campaigns={campaigns} />
    </div>
  );
}
