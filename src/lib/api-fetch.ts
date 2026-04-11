/**
 * Shared fetch helper for all /api/* calls.
 *
 * Auth is handled via an HTTP-only session cookie set by POST /api/auth/login.
 * For same-origin requests the browser sends the cookie automatically, so no
 * Authorization header is injected here.  Callers that still use authHeaders()
 * get an empty object — the spread is a harmless no-op.
 */

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...options })
  if (!res.ok) {
    if (res.status === 401) {
      // Signal the app to show the login prompt.
      window.dispatchEvent(new CustomEvent('auth:required'))
    }
    throw new Error(await res.text().catch(() => `HTTP ${res.status}`))
  }
  return res.json() as Promise<T>
}

/** @deprecated — kept for backward compat; cookies are sent automatically now. */
export function authHeaders(): HeadersInit {
  return {}
}
