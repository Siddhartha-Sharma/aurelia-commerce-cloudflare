// IDs are correlation keys, never authentication credentials.
export function createRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}
