/**
 * Shared fetch helper for all /api/* calls.
 *
 * When VITE_API_SECRET is set (matching the server-side API_SECRET env var),
 * every request automatically carries an "Authorization: Bearer <secret>"
 * header so that mutating endpoints and DB export can be protected.
 */

function buildAuthHeaders(): HeadersInit {
  const secret = import.meta.env.VITE_API_SECRET as string | undefined
  return secret ? { Authorization: `Bearer ${secret}` } : {}
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { ...buildAuthHeaders(), ...options?.headers },
  })
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`))
  return res.json() as Promise<T>
}

/** Returns auth headers for use in raw fetch() calls that need the secret. */
export function authHeaders(): HeadersInit {
  return buildAuthHeaders()
}
