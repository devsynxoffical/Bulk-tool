/** Strip Re:/Fwd: prefixes so related messages share one conversation key. */
export function normalizeSubject(subject: string | null | undefined): string {
  const raw = (subject || "").trim() || "(No subject)";
  return (
    raw
      .replace(/^((re|fwd|fw|aw|sv|antw)\s*:\s*)+/i, "")
      .trim()
      .toLowerCase() || "(no subject)"
  );
}

export function conversationKey(
  inboxId: string,
  peerEmail: string,
  subject: string | null | undefined,
): string {
  return `${inboxId}::${peerEmail.toLowerCase()}::${normalizeSubject(subject)}`;
}

export function normalizeMessageId(value: unknown): string | null {
  if (!value) return null;
  const raw = Array.isArray(value) ? String(value[0] ?? "") : String(value);
  return raw.replace(/^<|>$/g, "").trim().toLowerCase() || null;
}
