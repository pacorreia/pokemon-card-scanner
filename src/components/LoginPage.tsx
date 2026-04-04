import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GithubLogo, Key, ArrowRight, Warning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'

export function LoginPage() {
  const { signIn, setManualToken, isOAuthEnabled, deviceFlow, cancelDeviceFlow } = useAuth()
  const [showPat, setShowPat] = useState(false)
  const [patValue, setPatValue] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handlePatSubmit = async () => {
    const trimmed = patValue.trim()
    if (!trimmed) {
      toast.error('Please enter a token.')
      return
    }
    setIsSubmitting(true)
    try {
      await setManualToken(trimmed)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid token.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBack = () => {
    setShowPat(false)
    setPatValue('')
    cancelDeviceFlow()
  }

  const isLoading = deviceFlow.status === 'loading'

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🃏</div>
          <h1 className="text-3xl font-bold font-display tracking-tight mb-1">
            Pokémon Card Scanner
          </h1>
          <p className="text-muted-foreground text-sm">
            Sign in with GitHub to get started
          </p>
        </div>

        <div className="rounded-2xl border bg-card shadow-sm p-6 space-y-4">
          <AnimatePresence mode="wait">
            {/* Loading — exchanging OAuth code for token */}
            {isLoading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-3 py-4"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent"
                />
                <p className="text-sm text-muted-foreground">Signing you in…</p>
              </motion.div>
            )}

            {/* Error */}
            {deviceFlow.status === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 flex items-start gap-2"
              >
                <Warning className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive">{deviceFlow.message}</p>
              </motion.div>
            )}

            {/* Default: sign-in options */}
            {!isLoading && (
              <motion.div
                key="options"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3"
              >
                {isOAuthEnabled && (
                  <Button
                    className="w-full gap-2"
                    size="lg"
                    onClick={signIn}
                  >
                    <GithubLogo className="w-5 h-5" weight="fill" />
                    Sign in with GitHub
                  </Button>
                )}

                {!showPat ? (
                  <Button
                    variant={isOAuthEnabled ? 'outline' : 'default'}
                    size="lg"
                    className="w-full gap-2"
                    onClick={() => setShowPat(true)}
                  >
                    <Key className="w-5 h-5" />
                    Use a Personal Access Token
                  </Button>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-2"
                  >
                    <Label htmlFor="login-pat-input">GitHub Personal Access Token</Label>
                    <Input
                      id="login-pat-input"
                      type="password"
                      placeholder="ghp_…"
                      value={patValue}
                      onChange={(e) => setPatValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handlePatSubmit()}
                      className="font-mono text-sm"
                      autoComplete="off"
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground">
                      Your token is stored only in this browser and only used with{' '}
                      <a
                        href="https://models.github.ai"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-foreground"
                      >
                        GitHub Models
                      </a>
                      .{' '}
                      <a
                        href="https://github.com/settings/tokens/new?description=Pokemon+Card+Scanner&scopes="
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-foreground"
                      >
                        Create one
                      </a>{' '}
                      (no scopes required).
                    </p>
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={handleBack}
                      >
                        Back
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 gap-1"
                        onClick={handlePatSubmit}
                        disabled={isSubmitting || !patValue.trim()}
                      >
                        {isSubmitting ? 'Verifying…' : (
                          <>
                            Continue <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Your collection data never leaves your browser.
        </p>
      </motion.div>
    </div>
  )
}
