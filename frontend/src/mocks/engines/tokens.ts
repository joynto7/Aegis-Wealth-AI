import { sha256Hex } from "./chain";

/** Confirmation tokens (Section 2.5.10): single-use, 5-minute, bound to a proposal's items. */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashToken(token: string): Promise<string> {
  return sha256Hex(token);
}

export const CONFIRM_TOKEN_TTL_MS = 5 * 60 * 1000;
