/** Stable, URL-safe ids. Uses crypto.randomUUID where available. */
export function newId(prefix: string) {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${uuid.replace(/-/g, "").slice(0, 16)}`;
}

/** Deterministic 32-bit FNV-1a hash → base36; used for canonical/idempotency keys. */
export function hashKey(input: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
