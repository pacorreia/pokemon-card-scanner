import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Lock } from '@phosphor-icons/react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

interface AuthDialogProps {
  authRequired:   boolean
  authLoginOpen:  boolean
  onOpenChange:   (open: boolean) => void
  authPassword:   string
  onPasswordChange: (v: string) => void
  authLoginError: string
  authLoggingIn:  boolean
  onSubmit:       (e: React.FormEvent) => void
}

export function AuthDialog({
  authRequired,
  authLoginOpen,
  onOpenChange,
  authPassword,
  onPasswordChange,
  authLoginError,
  authLoggingIn,
  onSubmit,
}: AuthDialogProps) {
  return (
    <Dialog
      open={authLoginOpen}
      onOpenChange={(open) => { if (!authRequired) onOpenChange(open) }}
    >
      <DialogContent className="sm:max-w-sm" onInteractOutside={e => e.preventDefault()}>
        <DialogTitle className="flex items-center gap-2 font-display text-xl">
          <Lock className="w-5 h-5 text-primary" weight="fill" />
          Authentication Required
        </DialogTitle>
        <DialogDescription>
          This server is protected. Enter the password to continue.
        </DialogDescription>
        <form onSubmit={onSubmit} className="flex flex-col gap-4 pt-2">
          <div className="space-y-1">
            <Label htmlFor="auth-password">Password</Label>
            <Input
              id="auth-password"
              type="password"
              placeholder="Enter password…"
              value={authPassword}
              onChange={e => onPasswordChange(e.target.value)}
              autoFocus
              autoComplete="current-password"
            />
            {authLoginError && <p className="text-xs text-destructive">{authLoginError}</p>}
          </div>
          <Button
            type="submit"
            className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-display font-semibold"
            disabled={authLoggingIn || !authPassword}
          >
            {authLoggingIn ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
