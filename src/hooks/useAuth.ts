import { useState, useEffect, useCallback } from 'react'

export function useAuth() {
  const [authRequired,   setAuthRequired]   = useState(false)
  const [authLoginOpen,  setAuthLoginOpen]  = useState(false)
  const [authPassword,   setAuthPassword]   = useState('')
  const [authLoginError, setAuthLoginError] = useState('')
  const [authLoggingIn,  setAuthLoggingIn]  = useState(false)

  useEffect(() => {
    fetch('/api/auth/status')
      .then(r => r.json())
      .then((data: { required: boolean; authenticated: boolean }) => {
        if (data.required && !data.authenticated) {
          setAuthRequired(true)
          setAuthLoginOpen(true)
        }
      })
      .catch(() => { /* server not available yet; ignore */ })
  }, [])

  useEffect(() => {
    const handler = () => { setAuthRequired(true); setAuthLoginOpen(true) }
    window.addEventListener('auth:required', handler)
    return () => window.removeEventListener('auth:required', handler)
  }, [])

  const handleAuthLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthLoginError('')
    setAuthLoggingIn(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: authPassword }),
      })
      if (!res.ok) { setAuthLoginError('Incorrect password. Please try again.'); return }
      setAuthLoginOpen(false)
      setAuthRequired(false)
      setAuthPassword('')
    } catch {
      setAuthLoginError('Could not reach the server. Please try again.')
    } finally {
      setAuthLoggingIn(false)
    }
  }, [authPassword])

  return {
    authRequired, setAuthRequired,
    authLoginOpen, setAuthLoginOpen,
    authPassword, setAuthPassword,
    authLoginError,
    authLoggingIn,
    handleAuthLogin,
  }
}
