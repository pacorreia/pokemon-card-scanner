import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeSlash } from '@phosphor-icons/react'
import { toast } from 'sonner'

const PAT_KEY = 'github-pat'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [token, setToken] = useState(() => localStorage.getItem(PAT_KEY) ?? '')
  const [showToken, setShowToken] = useState(false)

  const handleSave = () => {
    const trimmed = token.trim()
    if (!trimmed) {
      toast.error('Please enter a token before saving.')
      return
    }
    localStorage.setItem(PAT_KEY, trimmed)
    toast.success('API key saved.')
    onOpenChange(false)
  }

  const handleClear = () => {
    localStorage.removeItem(PAT_KEY)
    setToken('')
    toast.success('API key cleared.')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>
          Configure your GitHub personal access token to enable AI-powered card scanning.
        </DialogDescription>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="pat-input">GitHub Personal Access Token</Label>
            <div className="relative">
              <Input
                id="pat-input"
                type={showToken ? 'text' : 'password'}
                placeholder="ghp_…"
                value={token}
                onChange={(e) => setToken(e.target.value)}
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
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={handleClear} disabled={!localStorage.getItem(PAT_KEY)}>
            Clear
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
