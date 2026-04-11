import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import type { CameraPreferences } from '@/lib/types'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cameraPreferences: CameraPreferences
  onCameraPreferencesChange: (value: CameraPreferences) => void
}

export function SettingsDialog({
  open,
  onOpenChange,
  cameraPreferences,
  onCameraPreferencesChange,
}: SettingsDialogProps) {
  const [proxyStatus, setProxyStatus] = useState<'checking' | 'online' | 'offline'>('checking')

  const updateCameraPreferences = (patch: Partial<CameraPreferences>) => {
    onCameraPreferencesChange({ ...cameraPreferences, ...patch })
  }

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
            <p className="text-sm font-medium">Camera Defaults</p>
            <p className="text-xs text-muted-foreground">
              These preferences are stored only in this browser on this device. They are not saved in the app database.
            </p>
            <p className="text-xs text-muted-foreground">
              Advanced controls such as zoom and torch only appear during live scanning when the active camera supports them.
            </p>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Resolution</Label>
              <Select
                value={cameraPreferences.resolution}
                onValueChange={(value) => updateCameraPreferences({ resolution: value as CameraPreferences['resolution'] })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select resolution" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="hd">HD (1280x720)</SelectItem>
                  <SelectItem value="fullhd">Full HD (1920x1080)</SelectItem>
                  <SelectItem value="qhd">QHD (2560x1440)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Default Camera</Label>
              <Select
                value={cameraPreferences.facingMode}
                onValueChange={(value) => updateCameraPreferences({ facingMode: value as CameraPreferences['facingMode'] })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select camera" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="environment">Back Camera</SelectItem>
                  <SelectItem value="user">Front Camera</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Default Zoom</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={cameraPreferences.zoom}
                  onChange={(e) => updateCameraPreferences({ zoom: Number(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-xs w-10 text-right">{cameraPreferences.zoom.toFixed(1)}x</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="default-torch"
                checked={cameraPreferences.torchEnabled}
                onCheckedChange={(checked) => updateCameraPreferences({ torchEnabled: checked === true })}
              />
              <Label htmlFor="default-torch" className="text-sm">Default flash/torch on</Label>
            </div>
          </div>

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
