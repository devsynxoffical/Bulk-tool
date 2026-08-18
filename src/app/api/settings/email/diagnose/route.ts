import { NextRequest, NextResponse } from "next/server";
import dns from "dns/promises";
import net from "net";
import tls from "tls";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";

type PortCheckResult = {
  host: string;
  port: number;
  open: boolean;
  latencyMs: number;
  error?: string;
};

type SmtpAuthResult = {
  host: string;
  port: number;
  secure: boolean;
  success: boolean;
  message?: string;
};

async function testTcpPort(host: string, port: number, timeoutMs = 5000): Promise<PortCheckResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isResolved = false;

    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };

    socket.setTimeout(timeoutMs);

    socket.once("connect", () => {
      if (!isResolved) {
        isResolved = true;
        const latency = Date.now() - start;
        cleanup();
        resolve({ host, port, open: true, latencyMs: latency });
      }
    });

    socket.once("timeout", () => {
      if (!isResolved) {
        isResolved = true;
        cleanup();
        resolve({
          host,
          port,
          open: false,
          latencyMs: timeoutMs,
          error: `Connection timed out after ${timeoutMs}ms (Firewall blocking port ${port})`,
        });
      }
    });

    socket.once("error", (err) => {
      if (!isResolved) {
        isResolved = true;
        cleanup();
        resolve({
          host,
          port,
          open: false,
          latencyMs: Date.now() - start,
          error: err.message || "Connection refused",
        });
      }
    });

    try {
      socket.connect(port, host);
    } catch (err: any) {
      if (!isResolved) {
        isResolved = true;
        cleanup();
        resolve({
          host,
          port,
          open: false,
          latencyMs: Date.now() - start,
          error: err.message,
        });
      }
    }
  });
}

async function testSmtpAuth(
  host: string,
  port: number,
  secure: boolean,
  user: string,
  pass: string,
): Promise<SmtpAuthResult> {
  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 7000,
      greetingTimeout: 5000,
      socketTimeout: 8000,
    });

    await transporter.verify();
    return { host, port, secure, success: true, message: "SMTP Handshake & Auth Successful ✅" };
  } catch (err: any) {
    return {
      host,
      port,
      secure,
      success: false,
      message: err.message || "Authentication / Handshake failed",
    };
  }
}

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  try {
    const body = await req.json().catch(() => ({}));
    const account = await prisma.emailAccount.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
    });

    const hostToCheck = body.host?.trim() || account?.host || "mail.devsynx.com";
    const user = body.username?.trim() || account?.username || "info@devsynx.com";
    const pass = body.password?.trim() || account?.password || "";

    // 1. DNS Resolution
    let resolvedIps: string[] = [];
    let dnsError: string | null = null;
    try {
      const addresses = await dns.resolve4(hostToCheck);
      resolvedIps = addresses;
    } catch (e: any) {
      dnsError = e.message;
    }

    // 2. Test common SMTP hosts & ports from this server container
    const targets = [
      { host: hostToCheck, port: 465 },
      { host: hostToCheck, port: 587 },
      { host: "s4549.lon1.stableserver.net", port: 465 },
      { host: "s4549.lon1.stableserver.net", port: 587 },
      { host: "smtp.gmail.com", port: 587 },
    ];

    const portResults = await Promise.all(
      targets.map((t) => testTcpPort(t.host, t.port, 6000)),
    );

    // 3. Test SMTP Auth against reachable ports if credentials are provided
    const authResults: SmtpAuthResult[] = [];
    if (user && pass) {
      const openPorts = portResults.filter((p) => p.open);
      for (const p of openPorts) {
        const isSecure = p.port === 465;
        const res = await testSmtpAuth(p.host, p.port, isSecure, user, pass);
        authResults.push(res);
      }
    }

    return NextResponse.json({
      success: true,
      testedHost: hostToCheck,
      dns: {
        host: hostToCheck,
        resolvedIps,
        error: dnsError,
      },
      portResults,
      authResults,
      recommendation:
        authResults.find((a) => a.success)
          ? `Use Host: '${authResults.find((a) => a.success)?.host}' on Port: ${authResults.find((a) => a.success)?.port}`
          : "Check the firewall or use the cPanel server hostname (s4549.lon1.stableserver.net).",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Diagnostic check failed" },
      { status: 500 },
    );
  }
}
