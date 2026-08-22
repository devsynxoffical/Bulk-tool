import type { SmtpDeliveryPayload } from "./deliver-smtp";

export function isSmtpRelayEnabled(): boolean {
  return Boolean(process.env.SMTP_RELAY_URL?.trim());
}

export async function sendViaSmtpRelay(payload: SmtpDeliveryPayload) {
  const relayUrl = process.env.SMTP_RELAY_URL?.trim().replace(/\/$/, "");
  const secret = process.env.SMTP_RELAY_SECRET?.trim();

  if (!relayUrl) {
    throw new Error("SMTP_RELAY_URL is not configured");
  }
  if (!secret) {
    throw new Error("SMTP_RELAY_SECRET is not configured on Railway");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const res = await fetch(`${relayUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      messageId?: string;
      error?: string;
    };

    if (!res.ok) {
      throw new Error(data.error || `SMTP relay error (${res.status})`);
    }

    return { messageId: data.messageId || `relay_${Date.now()}` };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(
        `SMTP relay timeout: could not reach ${relayUrl}. Check cPanel relay is running and URL is correct.`,
      );
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkSmtpRelayHealth(): Promise<{
  ok: boolean;
  url?: string;
  error?: string;
}> {
  const relayUrl = process.env.SMTP_RELAY_URL?.trim().replace(/\/$/, "");
  if (!relayUrl) return { ok: false, error: "SMTP_RELAY_URL not set" };

  try {
    const res = await fetch(`${relayUrl}/health`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false, url: relayUrl, error: `HTTP ${res.status}` };
    return { ok: true, url: relayUrl };
  } catch (e) {
    return {
      ok: false,
      url: relayUrl,
      error: e instanceof Error ? e.message : "Relay unreachable",
    };
  }
}
