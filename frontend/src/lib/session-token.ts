const STORAGE_KEY = "aegis_session_token";

/**
 * Session storage for the mock layer.
 *
 * MSW intercepts requests through a Service Worker, and browsers strip the
 * `Cookie` header from requests before a Service Worker ever sees them —
 * this is a deliberate, unconditional browser behaviour (not something
 * `SameSite`/`Secure` flags change), so a real `Cookie` cannot carry the
 * session across this mock boundary. A real backend wouldn't have this
 * problem; here, the token is kept in localStorage and sent as an ordinary
 * request header instead, which Service Workers can see fine.
 */

export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function setSessionToken(token: string) {
  window.localStorage.setItem(STORAGE_KEY, token);
}

export function clearSessionToken() {
  window.localStorage.removeItem(STORAGE_KEY);
}
