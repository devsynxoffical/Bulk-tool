import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import {
  GENERIC_BUSINESS_OUTREACH_HTML,
  GENERIC_BUSINESS_OUTREACH_SUBJECT,
} from "../src/lib/email/templates/generic-business-outreach";

const prisma = new PrismaClient();

const sampleTemplates: Array<{
  channel: "EMAIL";
  name: string;
  language: string;
  category: string;
  status: string;
  subject?: string;
  body: string;
  isSample: boolean;
}> = [
  {
    channel: "EMAIL",
    name: "service_welcome_email",
    language: "en_US",
    category: "UTILITY",
    status: "APPROVED",
    subject: "Welcome, {{name}} — we’re glad you’re here",
    body: `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#18181b;line-height:1.6">
  <h2 style="margin:0 0 12px;font-size:20px">Welcome, {{name}}</h2>
  <p style="margin:0 0 12px;color:#52525b">Thanks for connecting with our team. Whether you need a consultation, booking, or support, we’re here to help you get the most from our services.</p>
  <p style="margin:0;color:#71717a;font-size:13px">— Your outreach team</p>
</div>`,
    isSample: true,
  },
  {
    channel: "EMAIL",
    name: "cold_outreach_proposal",
    language: "en_US",
    category: "MARKETING",
    status: "APPROVED",
    subject: "Quick partnership query for {{company}}",
    body: `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#18181b;line-height:1.6">
  <p style="margin:0 0 12px">Hi {{name}},</p>
  <p style="margin:0 0 12px;color:#52525b">I noticed {{company}} is rapidly expanding outreach operations. We help growth teams automate cold email lead generation with zero-cost verifiers and multi-inbox rotation.</p>
  <p style="margin:0 0 16px;color:#52525b">Would you be open for a brief 5-minute introductory call this week?</p>
  <p style="margin:0;color:#71717a;font-size:13px">Best regards,</p>
</div>`,
    isSample: true,
  },
  {
    channel: "EMAIL",
    name: "quote_followup",
    language: "en_US",
    category: "UTILITY",
    status: "APPROVED",
    subject: "Your service proposal is ready, {{name}}",
    body: `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#18181b;line-height:1.6">
  <p style="margin:0 0 12px">Hi {{name}},</p>
  <p style="margin:0 0 12px;color:#52525b">We’ve prepared a custom proposal based on your inquiry. Review the details and reply to this email if you’d like to proceed or adjust the scope.</p>
  <p style="margin:0;color:#71717a;font-size:13px">Happy to answer any questions.</p>
</div>`,
    isSample: true,
  },
  {
    channel: "EMAIL",
    name: "generic_business_outreach",
    language: "en_US",
    category: "MARKETING",
    status: "APPROVED",
    subject: GENERIC_BUSINESS_OUTREACH_SUBJECT,
    body: GENERIC_BUSINESS_OUTREACH_HTML,
    isSample: true,
  },
];

async function main() {
  const email = (process.env.ADMIN_EMAIL || "admin@example.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "ChangeMe123!";
  const name = process.env.ADMIN_NAME || "Admin";

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, role: "ADMIN" },
    create: { email, name, passwordHash, role: "ADMIN" },
  });

  for (const t of sampleTemplates) {
    await prisma.template.upsert({
      where: {
        name_language_channel: {
          name: t.name,
          language: t.language,
          channel: t.channel,
        },
      },
      update: {
        category: t.category,
        status: t.status,
        subject: t.subject,
        body: t.body,
        isSample: t.isSample,
      },
      create: t,
    });
  }

  const sampleContacts = [
    {
      email: "alex@example.com",
      name: "Alex Morgan",
      tags: ["sample", "lead", "verified"],
    },
    {
      email: "sam@example.com",
      name: "Sam Rivera",
      tags: ["sample", "consultation"],
    },
    {
      email: "jordan@example.com",
      name: "Jordan Lee",
      tags: ["sample", "outreach"],
    },
  ];

  for (const c of sampleContacts) {
    await prisma.contact.upsert({
      where: { email: c.email },
      update: { name: c.name, tags: c.tags },
      create: c,
    });
  }

  console.log(`Seeded admin: ${user.email}`);
  console.log(`Seeded ${sampleTemplates.length} email templates`);
  console.log(`Seeded ${sampleContacts.length} sample contacts`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
