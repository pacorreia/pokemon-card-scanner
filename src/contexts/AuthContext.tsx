import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { createOAuthDeviceAuth } from '@octokit/auth-oauth-device'

const TOKEN_KEY = 'github-pat'
const USER_KEY = 'github-user'

const CLIENT_ID = (import.meta.env.VITE_GITHUB_CLIENT_ID as string | undefined) ?? ''

export interface GitHubUser {
  login: string
  name: string | null
  avatar_url: string
  html_url: string
}

export type DeviceFlowStatus =
  | { status: 'idle' }
  | { status: 'pending'; userCode: string; verificationUri: string; expiresAt: Date }
  | { status: 'polling' }
  | { status: 'error'; message: string }

export interface AuthContextValue {
  user: GitHubUser | null
  token: string | null
  isAuthenticated: boolean
  isOAuthEnabled: boolean
  deviceFlow: DeviceFlowStatus
  signIn: () => Promise<void>
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
  const abortDeviceFlowRef = useRef<(() => void) | null>(null)

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

  const signIn = useCallback(async () => {
    if (!CLIENT_ID) return

    setDeviceFlow({ status: 'idle' })

    let aborted = false
    abortDeviceFlowRef.current = () => {
      aborted = true
    }

    try {
      const auth = createOAuthDeviceAuth({
        clientType: 'oauth-app',
        clientId: CLIENT_ID,
        scopes: ['read:user'],
        onVerification: (verification) => {
          setDeviceFlow({
            status: 'pending',
            userCode: verification.user_code,
            verificationUri: verification.verification_uri,
            expiresAt: new Date(Date.now() + verification.expires_in * 1000),
          })
        },
      })

      const authPromise = auth({ type: 'oauth' })

      // Once the device code has been displayed, switch to 'polling' so the
      // UI can show the spinner while we wait for the user to authorize.
      authPromise.then(() => {
        // handled below
      }).catch(() => {
        // handled below
      })

      // Yield to let the onVerification state update render, then mark polling
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      if (!aborted) {
        setDeviceFlow((prev) =>
          prev.status === 'pending' ? { status: 'polling' } : prev
        )
      }

      const authentication = await authPromise

      if (aborted) return

      const newToken = authentication.token
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
    } catch (err) {
      if (aborted) return
      const message = err instanceof Error ? err.message : 'Authentication failed'
      setDeviceFlow({ status: 'error', message })
    } finally {
      abortDeviceFlowRef.current = null
    }
  }, [])

  const cancelDeviceFlow = useCallback(() => {
    if (abortDeviceFlowRef.current) abortDeviceFlowRef.current()
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
