import type { ApiErrorBody, ErrorCode } from "./types";
import { getSessionToken } from "./session-token";
import { API_MOCK } from "./api-mode";

/**
 * Typed fetch wrapper (Section 2.7.4: ApiClient). Turns the standard error
 * envelope (Section 2.6.2) into an ApiError(code, message, details); never
 * lets a raw stack trace or network error reach a screen.
 *
 * With NEXT_PUBLIC_API_MOCK on, MSW answers every endpoint in the browser
 * (src/mocks). A real session cookie (Section 2.6.1) can't carry auth across
 * a Service Worker boundary (browsers strip the `Cookie` header before a
 * Service Worker ever sees an intercepted request), so in mock mode the
 * session token travels as an ordinary header instead. Against the real
 * backend, the httpOnly aegis_session cookie does the job and no header is
 * sent. Screen code never touches either.
 */

export class ApiError extends Error {
  code: ErrorCode;
  details?: Record<string, unknown>;
  status: number;

  constructor(status: number, code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const BASE = "/api";

async function request<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const token = API_MOCK ? getSessionToken() : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { "X-Aegis-Session": token } : {}),
    ...extraHeaders,
  };

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "INTERNAL", "Could not reach the server. Check your connection and try again.");
  }

  if (res.status === 204) {
    return undefined as T;
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // no body
  }

  if (!res.ok) {
    const body = json as ApiErrorBody | null;
    const err = body?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "INTERNAL",
      err?.message ?? "Something went wrong. Please try again.",
      err?.details
    );
  }

  return json as T;
}

export const api = {
  get: <T>(path: string, extraHeaders?: Record<string, string>) => request<T>("GET", path, undefined, extraHeaders),
  post: <T>(path: string, body?: unknown, extraHeaders?: Record<string, string>) =>
    request<T>("POST", path, body, extraHeaders),
};
