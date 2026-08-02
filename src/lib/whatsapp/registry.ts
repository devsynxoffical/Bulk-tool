import type { WASocket } from "@whiskeysockets/baileys";

let socket: WASocket | null = null;

export function setSocket(sock: WASocket | null) {
  socket = sock;
}

export function getSocket() {
  return socket;
}
