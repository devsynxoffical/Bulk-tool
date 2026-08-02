import path from "node:path";

export const AUTH_DIR = path.join(process.cwd(), ".baileys");

export const SESSION_STATUS = {
  DISCONNECTED: "DISCONNECTED",
  CONNECTING: "CONNECTING",
  SCANNING: "SCANNING",
  CONNECTED: "CONNECTED",
} as const;
