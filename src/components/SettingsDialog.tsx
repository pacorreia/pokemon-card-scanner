import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { apiFetch } from '@/lib/api-fetch'
import type { CameraPreferences } from '@/lib/types'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cameraPreferences: CameraPreferences
  onCameraPreferencesChange: (value: CameraPreferences) => void
}

type AISettings = {
  provider: string
  model: string | null
  apiKeySet: boolean
  ollamaBaseUrl: string | null  // read-only — reflects OLLAMA_BASE_URL env var
  azureUrl: string | null       // read-only — reflects AZURE_OPENAI_URL env var
}

const PROVIDERS = [
  { value: 'github',    label: 'GitHub Models' },
  { value: 'openai',   label: 'OpenAI' },
  { value: 'groq',     label: 'Groq' },
  { value: 'ollama',   label: 'Ollama (local)' },
  { value: 'azure',    label: 'Azure OpenAI' },
  { value: 'anthropic', label: 'Anthropic Claude' },
]

export function SettingsDialog({
  open,
  onOpenChange,
  cameraPreferences,
  onCameraPreferencesChange,
}: SettingsDialogProps) {
  const [proxyStatus, setProxyStatus] = useState<'checking' | 'online' | 'offline'>('checking')

  const [aiSettings, setAiSettings] = useState<AISettings | null>(null)
  const [aiProvider, setAiProvider] = useState('github')
  const [aiModel, setAiModel] = useState('')
  const [aiApiKey, setAiApiKey] = useState('')
  const [aiSaving, setAiSaving] = useState(false)
  const [aiSaveError, setAiSaveError] = useState<string | null>(null)
  const [aiSaveSuccess, setAiSaveSuccess] = useState(false)

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

    fetch('/api/settings/ai')
      .then(res => res.ok ? res.json() as Promise<AISettings> : Promise.reject(res))
      .then(data => {
        setAiSettings(data)
        setAiProvider(data.provider)
        setAiModel(data.model ?? '')
        setAiApiKey('')  // never pre-fill the key; show placeholder when already set
        setAiSaveError(null)
        setAiSaveSuccess(false)
      })
      .catch(() => { /* non-fatal */ })
  }, [open])

  const handleAiSave = async () => {
    setAiSaving(true)
    setAiSaveError(null)
    setAiSaveSuccess(false)
    try {
      const updated = await apiFetch<AISettings>('/api/settings/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiProvider || null,
          model:    aiModel.trim() || null,
          apiKey:   aiApiKey.trim() || null,
        }),
      })
      setAiSettings(updated)
      setAiApiKey('')  // clear after save; it's now stored on the server
      setAiSaveSuccess(true)
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Failed to save AI settings'
      try {
        const parsed = JSON.parse(raw) as { error?: string }
        setAiSaveError(parsed.error ?? 'Failed to save AI settings')
      } catch {
        setAiSaveError(raw)
      }
    } finally {
      setAiSaving(false)
    }
  }

  const showOllamaUrl = aiProvider === 'ollama'
  const showAzureUrl  = aiProvider === 'azure'
  const showApiKey    = aiProvider !== 'ollama'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col max-h-[90vh] sm:max-w-md">
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>
          Scanning now uses a server-side proxy token. No client-side API key is stored.
        </DialogDescription>

        <div className="flex-1 overflow-y-auto space-y-5 py-2 pr-1">
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
            <p className="text-sm font-medium">AI Model Settings</p>
            <p className="text-xs text-muted-foreground">
              These settings are stored on the server and override any environment variables. They reset when the server restarts.
            </p>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Provider</Label>
              <Select value={aiProvider} onValueChange={setAiProvider}>
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Model</Label>
              <Input
                type="text"
                placeholder="Leave blank to use server default"
                value={aiModel}
                onChange={e => setAiModel(e.target.value)}
              />
            </div>

            {showApiKey && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  API Key{aiSettings?.apiKeySet ? ' (currently set — enter a new value to replace)' : ''}
                </Label>
                <Input
                  type="password"
                  placeholder={aiSettings?.apiKeySet ? '••••••••' : 'Enter API key'}
                  value={aiApiKey}
                  onChange={e => setAiApiKey(e.target.value)}
                  autoComplete="off"
                />
              </div>
            )}

            {showOllamaUrl && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Ollama Base URL</Label>
                <p className="text-xs font-mono px-2 py-1 rounded bg-muted text-muted-foreground">
                  {aiSettings?.ollamaBaseUrl ?? 'http://localhost:11434'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Set via <code className="font-mono">OLLAMA_BASE_URL</code> environment variable.
                </p>
              </div>
            )}

            {showAzureUrl && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Azure OpenAI URL</Label>
                {aiSettings?.azureUrl ? (
                  <p className="text-xs font-mono px-2 py-1 rounded bg-muted text-muted-foreground break-all">
                    {aiSettings.azureUrl}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Not configured</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Set via <code className="font-mono">AZURE_OPENAI_URL</code> environment variable.
                </p>
              </div>
            )}

            {aiSaveError && <p className="text-xs text-destructive">{aiSaveError}</p>}
            {aiSaveSuccess && <p className="text-xs text-green-600">AI settings saved.</p>}

            <Button size="sm" onClick={handleAiSave} disabled={aiSaving}>
              {aiSaving ? 'Saving…' : 'Save AI Settings'}
            </Button>
          </div>

          <div className="space-y-3 rounded-md border border-border p-3">
            <p className="text-sm font-medium">API Proxy Status</p>
            <div>
              {proxyStatus === 'checking' && <Badge variant="secondary">Checking…</Badge>}
              {proxyStatus === 'online' && <Badge className="bg-green-600 hover:bg-green-600">Online</Badge>}
              {proxyStatus === 'offline' && <Badge variant="destructive">Offline</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              The backend server must be running with a valid API key configured for the selected provider.
            </p>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
