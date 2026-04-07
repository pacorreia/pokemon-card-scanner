import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [proxyStatus, setProxyStatus] = useState<'checking' | 'online' | 'offline'>('checking')

  useEffect(() => {
    if (!open) {
      return
    }

    fetch('/api/health')
      .then(res => {
        setProxyStatus(res.ok ? 'online' : 'offline')
      })
      .catch(() => {
        setProxyStatus('offline')
      })
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>
          Scanning now uses a server-side proxy token. No client-side API key is stored.
        </DialogDescription>

        <div className="space-y-5 py-2">
          <div className="space-y-3 rounded-md border border-border p-3">
            <p className="text-sm font-medium">API Proxy Status</p>
            <div>
              {proxyStatus === 'checking' && <Badge variant="secondary">Checking…</Badge>}
              {proxyStatus === 'online' && <Badge className="bg-green-600 hover:bg-green-600">Online</Badge>}
              {proxyStatus === 'offline' && <Badge variant="destructive">Offline</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              Backend must run with <span className="font-mono">GITHUB_MODELS_TOKEN</span> configured.
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            Run backend with: <span className="font-mono">GITHUB_MODELS_TOKEN=&lt;token&gt; npm run dev:server</span>
          </p>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
