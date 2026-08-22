/**
 * cPanel / iHosting SMTP relay — run on your mail server VPS.
 * Railway calls this over HTTPS; this service sends via local SMTP (ports 465/587).
 *
 * Start: SMTP_RELAY_SECRET=xxx SMTP_RELAY_PORT=8789 npm run smtp-relay
 */
import http from "http";
import { deliverViaSmtp, type SmtpDeliveryPayload } from "../src/lib/email/deliver-smtp";

const PORT = Number(process.env.SMTP_RELAY_PORT || 8789);
const SECRET = process.env.SMTP_RELAY_SECRET?.trim();
/** Optional: rewrite outbound SMTP host (e.g. localhost when relay runs on same cPanel box) */
const LOCAL_SMTP_HOST = process.env.SMTP_RELAY_LOCAL_HOST?.trim();

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function authorize(req: http.IncomingMessage): boolean {
  if (!SECRET) return false;
  const auth = req.headers.authorization || "";
  return auth === `Bearer ${SECRET}`;
}

function normalizePayload(body: unknown): SmtpDeliveryPayload {
  const b = body as SmtpDeliveryPayload;
  if (!b?.to || !b?.subject || !b?.html || !b?.smtp?.host || !b?.smtp?.username || !b?.smtp?.password) {
    throw new Error("Invalid payload: to, subject, html, and smtp credentials are required");
  }

  if (LOCAL_SMTP_HOST) {
    b.smtp.host = LOCAL_SMTP_HOST;
  }

  return b;
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "devsynx-smtp-relay", port: PORT }));
    return;
  }

  if (req.url === "/send" && req.method === "POST") {
    if (!SECRET) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "SMTP_RELAY_SECRET not configured on relay server" }));
      return;
    }
    if (!authorize(req)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    try {
      const raw = await readBody(req);
      const payload = normalizePayload(JSON.parse(raw));
      const result = await deliverViaSmtp(payload);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, messageId: result.messageId }));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Send failed";
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: message }));
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`DEVSYNX SMTP relay listening on 0.0.0.0:${PORT}`);
  if (!SECRET) {
    console.warn("WARNING: Set SMTP_RELAY_SECRET before accepting sends");
  }
  if (LOCAL_SMTP_HOST) {
    console.log(`SMTP host override: ${LOCAL_SMTP_HOST}`);
  }
});
