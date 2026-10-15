import { HttpResponse } from "msw";
import type { ErrorCode, UserRole } from "@/lib/types";
import { db } from "@/mocks/db";
import { findUserById, type SeededUser } from "@/mocks/data/users";

export function errorResponse(status: number, code: ErrorCode, message: string, details?: Record<string, unknown>) {
  return HttpResponse.json({ error: { code, message, details } }, { status });
}

export type AuthResult = { user: SeededUser; token: string };

export function authenticate(request: Request): AuthResult | Response {
  // A Service Worker never sees the real `Cookie` header (browsers strip it
  // before the request reaches a worker's fetch handler), so the session
  // travels as an ordinary header instead — see src/lib/session-token.ts.
  const token = request.headers.get("X-Aegis-Session");
  if (!token) return errorResponse(401, "UNAUTHENTICATED", "Please log in again.");
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
