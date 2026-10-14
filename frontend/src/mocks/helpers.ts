import { HttpResponse } from "msw";
import type { ErrorCode, UserRole } from "@/lib/types";
import { db } from "@/mocks/db";
import { findUserById, type SeededUser } from "@/mocks/data/users";

export function errorResponse(status: number, code: ErrorCode, message: string, details?: Record<string, unknown>) {
  return HttpResponse.json({ error: { code, message, details } }, { status });
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join("="));
  }
  return out;
}

export function sessionCookieHeader(token: string, maxAgeSeconds: number) {
  return `aegis_session=${token}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
}

export const CLEAR_SESSION_COOKIE = "aegis_session=; Path=/; Max-Age=0; SameSite=Lax";

export type AuthResult = { user: SeededUser; token: string };

export function authenticate(request: Request): AuthResult | Response {
  const cookies = parseCookies(request.headers.get("cookie"));
  const token = cookies["aegis_session"];
  const session = db.getSession(token);
  if (!session) return errorResponse(401, "UNAUTHENTICATED", "Please log in again.");
  const user = findUserById(session.userId);
  if (!user) return errorResponse(401, "UNAUTHENTICATED", "Please log in again.");
  return { user, token };
}

export function requireRole(user: SeededUser, role: UserRole): Response | null {
  if (user.role !== role) {
    return errorResponse(403, "FORBIDDEN", "Your account cannot open this screen.");
  }
  return null;
}

export function isAuthResult(x: AuthResult | Response): x is AuthResult {
  return "user" in x;
}
