/**
 * Hash chain (Section 2.5.11): h_n = SHA256(h_{n-1} || canonical(content_n)),
 * h_0 = 64 zeros. canonical() mirrors Python's
 * json.dumps(content, sort_keys=True, separators=(",", ":")).
 */

export function canonicalStringify(value: unknown): string {
  return stringifyValue(value);
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stringifyValue).join(",")}]`;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stringifyValue(obj[k])}`).join(",")}}`;
  }
  return "null";
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const GENESIS_HASH = "0".repeat(64);

export async function nextHash(prevHash: string, content: unknown): Promise<string> {
  return sha256Hex(prevHash + canonicalStringify(content));
}
