import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { normalizePhone } from "@/lib/utils";

const schema = z.discriminatedUnion("channel", [
  z.object({
    channel: z.literal("WHATSAPP"),
    phone: z.string().min(5),
    name: z.string().optional(),
  }),
  z.object({
    channel: z.literal("EMAIL"),
    email: z.string().email(),
    name: z.string().optional(),
  }),
]);

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid phone number (with country code) or email" },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.channel === "WHATSAPP") {
      const phone = normalizePhone(parsed.data.phone);
      if (phone.length < 9) {
        return NextResponse.json(
          { error: "Enter a full number with country code, e.g. +923001234567" },
          { status: 400 },
        );
      }

      const contact = await prisma.contact.upsert({
        where: { phone },
        update: {
          ...(parsed.data.name ? { name: parsed.data.name } : {}),
        },
        create: {
          phone,
          name: parsed.data.name || null,
        },
      });

      if (contact.optedOut) {
        return NextResponse.json(
          { error: "This number has opted out of WhatsApp messages" },
          { status: 400 },
        );
      }

      const conversation = await prisma.conversation.upsert({
        where: {
          contactId_channel: {
            contactId: contact.id,
            channel: "WHATSAPP",
          },
        },
        create: {
          contactId: contact.id,
          channel: "WHATSAPP",
          lastMessageAt: new Date(),
          lastMessagePreview: "Chat started",
          status: "OPEN",
        },
        update: {
          lastMessageAt: new Date(),
          status: "OPEN",
        },
      });

      return NextResponse.json({
        contactId: contact.id,
        conversationId: conversation.id,
        phone: contact.phone,
        name: contact.name,
        channel: "WHATSAPP",
      });
    }

    const email = parsed.data.email.toLowerCase().trim();
    const contact = await prisma.contact.upsert({
      where: { email },
      update: {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
      },
      create: {
        email,
        name: parsed.data.name || null,
      },
    });

    if (contact.emailOptedOut) {
      return NextResponse.json(
        { error: "This email has opted out" },
        { status: 400 },
      );
    }

    const conversation = await prisma.conversation.upsert({
      where: {
        contactId_channel: {
          contactId: contact.id,
          channel: "EMAIL",
        },
      },
      create: {
        contactId: contact.id,
        channel: "EMAIL",
        lastMessageAt: new Date(),
        lastMessagePreview: "Chat started",
        status: "OPEN",
      },
      update: {
        lastMessageAt: new Date(),
        status: "OPEN",
      },
    });

    return NextResponse.json({
      contactId: contact.id,
      conversationId: conversation.id,
      email: contact.email,
      name: contact.name,
      channel: "EMAIL",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not start chat";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
