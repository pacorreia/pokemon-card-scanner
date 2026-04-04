import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeSlash, GithubLogo, SignOut } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { user, token, isOAuthEnabled, signIn, signOut, setManualToken } = useAuth()
  const [editToken, setEditToken] = useState('')
  const [showToken, setShowToken] = useState(false)

  // Sync edit field whenever dialog opens
  useEffect(() => {
    if (open) {
      setEditToken(token ?? '')
      setShowToken(false)
    }
  }, [open, token])

  const handleSave = async () => {
    const trimmed = editToken.trim()
    if (!trimmed) {
      toast.error('Please enter a token before saving.')
      return
    }
    await setManualToken(trimmed)
    toast.success('API key saved.')
    onOpenChange(false)
  }

  const handleClear = async () => {
    await setManualToken('')
    setEditToken('')
    toast.success('API key cleared.')
  }

  const handleSignIn = async () => {
    onOpenChange(false)
    await signIn()
  }

  const handleSignOut = () => {
    signOut()
    onOpenChange(false)
    toast.success('Signed out.')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>
          Configure GitHub authentication to enable AI-powered card scanning.
        </DialogDescription>

        <div className="space-y-5 py-2">
          {/* GitHub account info */}
          {user && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
              <img
                src={user.avatar_url}
                alt={user.login}
                className="w-9 h-9 rounded-full shrink-0"
                referrerPolicy="no-referrer"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{user.name ?? user.login}</p>
                <p className="text-xs text-muted-foreground truncate">@{user.login}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={handleSignOut} className="shrink-0 gap-1.5 text-xs">
                <SignOut className="w-3.5 h-3.5" />
                Sign out
              </Button>
            </div>
          )}

          {/* OAuth sign-in (shown when no user and OAuth is configured) */}
          {!user && isOAuthEnabled && (
            <Button className="w-full gap-2" variant="outline" onClick={handleSignIn}>
              <GithubLogo className="w-4 h-4" weight="fill" />
              Sign in with GitHub
            </Button>
          )}

          {/* Manual PAT section */}
          <div className="space-y-2">
            <Label htmlFor="settings-pat-input">
              {user ? 'Override Token (optional)' : 'GitHub Personal Access Token'}
            </Label>
            <div className="relative">
              <Input
                id="settings-pat-input"
                type={showToken ? 'text' : 'password'}
                placeholder="ghp_…"
                value={editToken}
                onChange={(e) => setEditToken(e.target.value)}
                className="pr-10 font-mono text-sm"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showToken ? 'Hide token' : 'Show token'}
              >
                {showToken ? (
                  <EyeSlash className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              The token is stored only in your browser's local storage and never sent anywhere except{' '}
              <a
                href="https://models.github.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                GitHub Models
              </a>
              .
            </p>
          </div>

          {!user && (
            <p className="text-sm text-muted-foreground">
              Don't have a token?{' '}
              <a
                href="https://github.com/settings/tokens/new?description=Pokemon+Card+Scanner&scopes="
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground font-medium"
              >
                Create one on GitHub
              </a>{' '}
              (no scopes needed for GitHub Models).
            </p>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={handleClear} disabled={!token}>
            Clear
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
