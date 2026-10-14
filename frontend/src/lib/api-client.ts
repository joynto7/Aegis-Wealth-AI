import type { ApiErrorBody, ErrorCode } from "./types";

/**
 * Typed fetch wrapper (Section 2.7.4: ApiClient). Turns the standard error
 * envelope (Section 2.6.2) into an ApiError(code, message, details); never
 * lets a raw stack trace or network error reach a screen.
 *
 * All endpoints are mocked by MSW in the browser (src/mocks). There is no
 * real backend in this build; the mock layer sets a real `aegis_session`
 * cookie on login (httpOnly is a server-only concept and doesn't apply to a
 * browser-side mock, but the cookie is otherwise handled exactly like
 * Section 2.6.1 describes) and `credentials: "include"` below carries it on
 * every request automatically — screen code never touches it directly.
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
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "include",
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
