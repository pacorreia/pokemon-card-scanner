import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

const TOKEN_KEY = 'github-pat'
const USER_KEY = 'github-user'
const OAUTH_STATE_KEY = 'github_oauth_state'

const CLIENT_ID = (import.meta.env.VITE_GITHUB_CLIENT_ID as string | undefined) ?? ''

export interface GitHubUser {
  login: string
  name: string | null
  avatar_url: string
  html_url: string
}

export type DeviceFlowStatus =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }

export interface AuthContextValue {
  user: GitHubUser | null
  token: string | null
  isAuthenticated: boolean
  isOAuthEnabled: boolean
  deviceFlow: DeviceFlowStatus
  signIn: () => void
  signOut: () => void
  setManualToken: (token: string) => Promise<void>
  cancelDeviceFlow: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchGitHubUser(token: string): Promise<GitHubUser | null> {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      login: string
      name: string | null
      avatar_url: string
      html_url: string
    }
    return {
      login: data.login,
      name: data.name,
      avatar_url: data.avatar_url,
      html_url: data.html_url,
    }
  } catch {
    return null
  }
}

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) || null
  } catch {
    return null
  }
}

function readStoredUser(): GitHubUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as GitHubUser) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(readStoredToken)
  const [user, setUser] = useState<GitHubUser | null>(readStoredUser)
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowStatus>({ status: 'idle' })

  // Validate stored token on first mount — always revalidate to catch expired/revoked tokens
  useEffect(() => {
    const stored = readStoredToken()
    if (!stored) return
    fetchGitHubUser(stored).then((u) => {
      if (u) {
        setUser(u)
        try {
          localStorage.setItem(USER_KEY, JSON.stringify(u))
        } catch {
          // ignore
        }
      } else {
        // Token invalid – clear everything
        setToken(null)
        setUser(null)
        try {
          localStorage.removeItem(TOKEN_KEY)
          localStorage.removeItem(USER_KEY)
        } catch {
          // ignore
        }
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle OAuth redirect callback
  useEffect(() => {
    if (window.location.pathname !== '/auth/callback') return

    const url = new URL(window.location.href)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')

    if (!code) return

    // Clear the callback URL immediately so refreshing doesn't re-use the code
    window.history.replaceState({}, '', '/')

    const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY)
    sessionStorage.removeItem(OAUTH_STATE_KEY)

    if (!state || state !== expectedState) {
      setDeviceFlow({ status: 'error', message: 'Invalid OAuth state. Please sign in again.' })
      return
    }

    setDeviceFlow({ status: 'loading' })

    const redirectUri = `${window.location.origin}/auth/callback`

    fetch('/api/github/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirectUri }),
    })
      .then(async (res) => {
        const data = (await res.json()) as {
          access_token?: string
          error?: string
          error_description?: string
        }
        if (!res.ok || data.error || !data.access_token) {
          throw new Error(data.error_description ?? data.error ?? 'Token exchange failed')
        }
        return data.access_token
      })
      .then(async (newToken) => {
        const u = await fetchGitHubUser(newToken)
        try {
          localStorage.setItem(TOKEN_KEY, newToken)
          if (u) localStorage.setItem(USER_KEY, JSON.stringify(u))
        } catch {
          // ignore
        }
        setToken(newToken)
        setUser(u)
        setDeviceFlow({ status: 'idle' })
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Authentication failed'
        setDeviceFlow({ status: 'error', message })
      })
  }, [])

  const signIn = useCallback(() => {
    if (!CLIENT_ID) return
    const state = crypto.randomUUID()
    sessionStorage.setItem(OAUTH_STATE_KEY, state)
    const redirectUri = `${window.location.origin}/auth/callback`
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
      scope: 'read:user',
      state,
    })
    window.location.href = `https://github.com/login/oauth/authorize?${params}`
  }, [])

  const cancelDeviceFlow = useCallback(() => {
    sessionStorage.removeItem(OAUTH_STATE_KEY)
    setDeviceFlow({ status: 'idle' })
  }, [])

  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    } catch {
      // ignore
    }
    setToken(null)
    setUser(null)
    setDeviceFlow({ status: 'idle' })
  }, [])

  const setManualToken = useCallback(async (t: string) => {
    const trimmed = t.trim()

    if (!trimmed) {
      try {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
      } catch {
        // ignore
      }
      setToken(null)
      setUser(null)
      return
    }

    try {
      const u = await fetchGitHubUser(trimmed)
      if (!u) {
        try {
          localStorage.removeItem(TOKEN_KEY)
          localStorage.removeItem(USER_KEY)
        } catch {
          // ignore
        }
        setToken(null)
        setUser(null)
        throw new Error('Invalid GitHub token — check the token and try again.')
      }

      setToken(trimmed)
      setUser(u)

      try {
        localStorage.setItem(TOKEN_KEY, trimmed)
        localStorage.setItem(USER_KEY, JSON.stringify(u))
      } catch {
        // ignore
      }
    } catch (error) {
      try {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
      } catch {
        // ignore
      }
      setToken(null)
      setUser(null)
      throw error
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        isOAuthEnabled: !!CLIENT_ID,
        deviceFlow,
        signIn,
        signOut,
        setManualToken,
        cancelDeviceFlow,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
