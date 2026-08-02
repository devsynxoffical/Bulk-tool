import bcrypt from "bcryptjs";
import { PrismaClient, type Channel } from "@prisma/client";

const prisma = new PrismaClient();

const sampleTemplates: Array<{
  channel: Channel;
  name: string;
  language: string;
  category: string;
  status: string;
  subject?: string;
  header?: string;
  body: string;
  footer?: string;
  isSample: boolean;
}> = [
  {
    channel: "WHATSAPP",
    name: "service_welcome",
    language: "en_US",
    category: "UTILITY",
    status: "APPROVED",
    header: "Welcome",
    body: "Hi {{1}}, thank you for choosing our services. Reply here anytime — we’re happy to help with bookings or questions.",
    footer: "Your service team",
    isSample: true,
  },
  {
    channel: "WHATSAPP",
    name: "appointment_reminder",
    language: "en_US",
    category: "UTILITY",
    status: "APPROVED",
    header: "Appointment reminder",
    body: "Hi {{1}}, reminder: your {{2}} appointment is on {{3}} at {{4}}. Reply YES to confirm or RESCHEDULE to change.",
    footer: "See you soon",
    isSample: true,
  },
  {
    channel: "WHATSAPP",
    name: "consultation_invite",
    language: "en_US",
    category: "MARKETING",
    status: "APPROVED",
    header: "Free consultation",
    body: "Hi {{1}}, book a free {{2}} consultation this week. We’ll review your needs and recommend the right plan. Reply BOOK to schedule.",
    footer: "Reply STOP to opt out",
    isSample: true,
  },
  {
    channel: "WHATSAPP",
    name: "service_offer",
    language: "en_US",
    category: "MARKETING",
    status: "APPROVED",
    header: "Exclusive offer",
    body: "Hi {{1}}, enjoy {{2}} off {{3}} this month. Mention code {{4}} when you book. Valid until {{5}}.",
    footer: "Reply STOP to opt out",
    isSample: true,
  },
  {
    channel: "WHATSAPP",
    name: "service_followup",
    language: "en_US",
    category: "UTILITY",
    status: "APPROVED",
    body: "Hi {{1}}, thanks for your recent {{2}} session. How was your experience? Reply with feedback or book your next visit anytime.",
    isSample: true,
  },
  {
    channel: "EMAIL",
    name: "service_welcome_email",
    language: "en_US",
    category: "UTILITY",
    status: "APPROVED",
    subject: "Welcome, {{name}} — we’re glad you’re here",
    body: `<div style="font-family:IBM Plex Sans,Arial,sans-serif;color:#18181b;line-height:1.6">
  <h2 style="margin:0 0 12px;font-size:20px">Welcome, {{name}}</h2>
  <p style="margin:0 0 12px;color:#52525b">Thanks for connecting with our team. Whether you need a consultation, booking, or support, we’re here to help you get the most from our services.</p>
  <p style="margin:0;color:#71717a;font-size:13px">— Your service team</p>
</div>`,
    isSample: true,
  },
  {
    channel: "EMAIL",
    name: "service_newsletter",
    language: "en_US",
    category: "MARKETING",
    status: "APPROVED",
    subject: "{{name}}, this month’s service tips & offers",
    body: `<div style="font-family:IBM Plex Sans,Arial,sans-serif;color:#18181b;line-height:1.6">
  <p style="margin:0 0 12px">Hi {{name}},</p>
  <p style="margin:0 0 12px;color:#52525b">Here’s what’s new for clients this month:</p>
  <ul style="margin:0 0 16px;padding-left:18px;color:#52525b">
    <li>Seasonal service packages now available</li>
    <li>Priority booking slots for returning clients</li>
    <li>Tips to get better results between visits</li>
  </ul>
  <p style="margin:0;color:#a1a1aa;font-size:12px">You’re receiving this as a client. Unsubscribe anytime.</p>
</div>`,
    isSample: true,
  },
  {
    channel: "EMAIL",
    name: "quote_followup",
    language: "en_US",
    category: "UTILITY",
    status: "APPROVED",
    subject: "Your service quote is ready, {{name}}",
    body: `<div style="font-family:IBM Plex Sans,Arial,sans-serif;color:#18181b;line-height:1.6">
  <p style="margin:0 0 12px">Hi {{name}},</p>
  <p style="margin:0 0 12px;color:#52525b">We’ve prepared a tailored quote based on your consultation. Review the details and reply to this email if you’d like to proceed or adjust the scope.</p>
  <p style="margin:0;color:#71717a;font-size:13px">Happy to answer any questions.</p>
</div>`,
    isSample: true,
  },
  {
    channel: "EMAIL",
    name: "reactivate_clients",
    language: "en_US",
    category: "MARKETING",
    status: "APPROVED",
    subject: "We’d love to see you again, {{name}}",
    body: `<div style="font-family:IBM Plex Sans,Arial,sans-serif;color:#18181b;line-height:1.6">
  <p style="margin:0 0 12px">Hi {{name}},</p>
  <p style="margin:0 0 12px;color:#52525b">It’s been a while since your last visit. Book again this month and enjoy priority scheduling plus a returning-client courtesy on select services.</p>
  <p style="margin:0;color:#a1a1aa;font-size:12px">Prefer fewer emails? Update your preferences anytime.</p>
</div>`,
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

  const verifyToken =
    process.env.META_WEBHOOK_VERIFY_TOKEN || "whatsapp_bulk_verify_token";

  const existing = await prisma.whatsAppAccount.findFirst();
  if (!existing) {
    await prisma.whatsAppAccount.create({
      data: {
        phoneNumberId: process.env.META_PHONE_NUMBER_ID || "pending",
        wabaId: process.env.META_WABA_ID || "pending",
        accessToken: process.env.META_ACCESS_TOKEN || "",
        webhookVerifyToken: verifyToken,
        businessName: "My Service Business",
        isActive: Boolean(process.env.META_ACCESS_TOKEN),
      },
    });
  }

  // Remove old product-oriented sample templates
  await prisma.template.deleteMany({
    where: {
      isSample: true,
      name: {
        in: [
          "welcome_message",
          "order_update",
          "promo_offer",
          "welcome_email",
          "monthly_newsletter",
          "invoice_notice",
          "reengagement",
        ],
      },
    },
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
        header: t.header,
        body: t.body,
        footer: t.footer,
        isSample: t.isSample,
      },
      create: t,
    });
  }

  const sampleContacts = [
    {
      phone: "+15550001001",
      email: "alex@example.com",
      name: "Alex Morgan",
      tags: ["sample", "vip", "returning"],
    },
    {
      phone: "+15550001002",
      email: "sam@example.com",
      name: "Sam Rivera",
      tags: ["sample", "consultation"],
    },
    {
      phone: null,
      email: "jordan@example.com",
      name: "Jordan Lee",
      tags: ["sample", "quote"],
    },
  ];

  for (const c of sampleContacts) {
    if (c.phone) {
      await prisma.contact.upsert({
        where: { phone: c.phone },
        update: { name: c.name, email: c.email, tags: c.tags },
        create: c,
      });
    } else if (c.email) {
      await prisma.contact.upsert({
        where: { email: c.email },
        update: { name: c.name, tags: c.tags },
        create: c,
      });
    }
  }

  console.log(`Seeded admin: ${user.email}`);
  console.log(`Seeded ${sampleTemplates.length} service-marketing templates`);
  console.log(`Seeded ${sampleContacts.length} sample clients`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
