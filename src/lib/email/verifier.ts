import dns from "dns";
import net from "net";

export interface VerificationResult {
  email: string;
  isValid: boolean;
  status: "VALID" | "INVALID" | "RISKY";
  reason: string;
  mxHost?: string;
  hasMxRecord: boolean;
}

const DISPOSABLE_DOMAINS = new Set([
  "tempmail.com", "throwawaymail.com", "mailinator.com", "guerrillamail.com",
  "sharklasers.com", "10minutemail.com", "dispostable.com", "yopmail.com",
  "getnada.com", "trashmail.com", "fakeinbox.com", "maildrop.cc",
]);

/**
 * Validates email address format, DNS MX records, and optionally performs
 * an SMTP handshake (RCPT TO) on port 25 to verify mailbox existence.
 */
export async function verifyEmail(
  email: string,
  options: { checkSmtpSocket?: boolean; timeoutMs?: number } = {},
): Promise<VerificationResult> {
  const { checkSmtpSocket = true, timeoutMs = 4000 } = options;

  const normalized = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(normalized)) {
    return {
      email: normalized,
      isValid: false,
      status: "INVALID",
      reason: "Invalid email syntax",
      hasMxRecord: false,
    };
  }

  const [, domain] = normalized.split("@");

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return {
      email: normalized,
      isValid: false,
      status: "INVALID",
      reason: "Disposable / temporary email provider",
      hasMxRecord: false,
    };
  }

  // 1. Resolve MX records via DNS
  let mxRecords: dns.MxRecord[] = [];
  try {
    mxRecords = await dns.promises.resolveMx(domain);
  } catch (err) {
    return {
      email: normalized,
      isValid: false,
      status: "INVALID",
      reason: `No MX records found for domain @${domain}`,
      hasMxRecord: false,
    };
  }

  if (!mxRecords || mxRecords.length === 0) {
    return {
      email: normalized,
      isValid: false,
      status: "INVALID",
      reason: `No MX records returned for @${domain}`,
      hasMxRecord: false,
    };
  }

  // Sort by priority (lowest integer = highest priority)
  mxRecords.sort((a, b) => a.priority - b.priority);
  const primaryMx = mxRecords[0].exchange;

  if (!checkSmtpSocket) {
    return {
      email: normalized,
      isValid: true,
      status: "VALID",
      reason: "Valid MX record found",
      mxHost: primaryMx,
      hasMxRecord: true,
    };
  }

  // 2. Perform direct SMTP socket check (port 25)
  const smtpCheck = await testSmtpSocket(primaryMx, normalized, timeoutMs);

  return {
    email: normalized,
    isValid: smtpCheck.isValid,
    status: smtpCheck.status,
    reason: smtpCheck.reason,
    mxHost: primaryMx,
    hasMxRecord: true,
  };
}

function testSmtpSocket(
  mxHost: string,
  recipientEmail: string,
  timeoutMs: number,
): Promise<{ isValid: boolean; status: "VALID" | "INVALID" | "RISKY"; reason: string }> {
  return new Promise((resolve) => {
    let socket: net.Socket | null = null;
    let step = 0;
    let finished = false;

    const done = (isValid: boolean, status: "VALID" | "INVALID" | "RISKY", reason: string) => {
      if (finished) return;
      finished = true;
      if (socket) {
        try {
          socket.write("QUIT\r\n");
          socket.destroy();
        } catch {
          // ignore
        }
      }
      resolve({ isValid, status, reason });
    };

    const timer = setTimeout(() => {
      // Timeout during SMTP handshake is common if port 25 is blocked by ISP / cloud provider.
      // Treat timeout as "RISKY" / "Valid MX", instead of hard invalid.
      done(true, "RISKY", "SMTP socket timed out (port 25 restricted or greylisted)");
    }, timeoutMs);

    try {
      socket = net.createConnection(25, mxHost);
      socket.setTimeout(timeoutMs);

      socket.on("connect", () => {
        // Connected to MX server
      });

      socket.on("data", (data) => {
        const response = data.toString();
        const code = parseInt(response.slice(0, 3), 10);

        if (step === 0 && code === 220) {
          step = 1;
          socket?.write("HELO devsynx.com\r\n");
        } else if (step === 1 && code === 250) {
          step = 2;
          socket?.write("MAIL FROM:<verify@devsynx.com>\r\n");
        } else if (step === 2 && code === 250) {
          step = 3;
          socket?.write(`RCPT TO:<${recipientEmail}>\r\n`);
        } else if (step === 3) {
          clearTimeout(timer);
          if (code === 250 || code === 251) {
            done(true, "VALID", "Mailbox exists and accepts messages");
          } else if (code === 550 || code === 551 || code === 553) {
            done(false, "INVALID", `Mailbox does not exist (SMTP ${code})`);
          } else {
            done(true, "RISKY", `Ambiguous response from mail server (SMTP ${code})`);
          }
        }
      });

      socket.on("error", (err) => {
        clearTimeout(timer);
        done(true, "RISKY", `Socket error (${err.message}). Defaulting to MX valid.`);
      });

      socket.on("timeout", () => {
        clearTimeout(timer);
        done(true, "RISKY", "SMTP connection timed out. MX record is active.");
      });
    } catch (e) {
      clearTimeout(timer);
      const msg = e instanceof Error ? e.message : "Socket error";
      done(true, "RISKY", `Verification exception: ${msg}`);
    }
  });
}
