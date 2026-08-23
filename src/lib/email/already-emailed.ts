import { prisma } from "@/lib/prisma";

const SENT_STATUSES = ["SENT", "DELIVERED", "READ"] as const;

/**
 * Contact IDs that already received at least one outbound email
 * (campaign recipient or message). Used to avoid re-emailing.
 */
export async function getAlreadyEmailedContactIds(): Promise<Set<string>> {
  const [fromRecipients, fromMessages] = await Promise.all([
    prisma.campaignRecipient.findMany({
      where: {
        status: { in: [...SENT_STATUSES] },
        campaign: { channel: "EMAIL" },
      },
      select: { contactId: true },
      distinct: ["contactId"],
    }),
    prisma.message.findMany({
      where: {
        channel: "EMAIL",
        direction: "OUTBOUND",
        status: { in: [...SENT_STATUSES] },
      },
      select: { contactId: true },
      distinct: ["contactId"],
    }),
  ]);

  const ids = new Set<string>();
  for (const row of fromRecipients) ids.add(row.contactId);
  for (const row of fromMessages) ids.add(row.contactId);
  return ids;
}
