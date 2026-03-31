import { useState, useRef, useCallback, useEffect, type ChangeEvent, type FormEvent } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Camera, Upload, Sparkle, PencilSimple, ArrowLeft } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import type { PokemonCard } from '@/lib/types'

interface ScanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCardScanned: (card: PokemonCard) => void
}

type Mode = 'idle' | 'camera' | 'analyzing' | 'manual'

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Holo Rare', 'Ultra Rare', 'Secret Rare']
const TYPES = ['Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Dragon', 'Fairy', 'Colorless']

async function searchTCGCard(name: string, setName: string, cardNumber: string): Promise<string | null> {
  try {
    const searchQuery = `name:"${name}"${setName !== 'Unknown Set' ? ` set.name:"${setName}"` : ''}${cardNumber !== '?' ? ` number:"${cardNumber.split('/')[0]}"` : ''}`
    const response = await fetch(
      `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(searchQuery)}&pageSize=1`
    )
    
    if (!response.ok) return null
    
    const data = await response.json()
    if (data.data && data.data.length > 0) {
      return data.data[0].images.large || data.data[0].images.small
    }
    
    const fallbackQuery = `name:"${name}"`
    const fallbackResponse = await fetch(
      `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(fallbackQuery)}&pageSize=1`
    )
    
    if (!fallbackResponse.ok) return null
    
    const fallbackData = await fallbackResponse.json()
    if (fallbackData.data && fallbackData.data.length > 0) {
      return fallbackData.data[0].images.large || fallbackData.data[0].images.small
    }
    
    return null
  } catch (error) {
    console.error('TCG API error:', error)
    return null
  }
}

async function analyzeCardImage(imageDataUrl: string): Promise<Omit<PokemonCard, 'id' | 'quantity' | 'dateAdded'>> {
  const body = {
    messages: [
      {
        role: 'system',
        content: 'You are a Pokémon TCG card recognition expert. Analyze card images and return accurate JSON data.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze this Pokémon card image and return a JSON object with these fields:
{
  "name": "Exact Pokémon name on the card (just the Pokemon name, not form variations)",
  "set": "Set name (e.g., Base Set, Jungle, Fossil, Team Rocket, Sword & Shield, Scarlet & Violet, etc.)",
  "cardNumber": "Card number as shown (e.g., 25/102)",
  "rarity": "One of: Common, Uncommon, Rare, Holo Rare, Ultra Rare, Secret Rare",
  "type": "One of: Fire, Water, Grass, Electric, Psychic, Fighting, Darkness, Metal, Dragon, Fairy, Colorless"
}
If this is not a Pokémon card or the image is too unclear to read, return: {"error": "Unable to identify card"}`,
          },
          {
            type: 'image_url',
            image_url: { url: imageDataUrl },
          },
        ],
      },
    ],
    model: 'openai/gpt-4o',
    response_format: { type: 'json_object' },
    max_tokens: 500,
    temperature: 0.1,
    top_p: 1.0,
  }

  const response = await fetch('/_spark/llm', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`LLM request failed: ${response.status} - ${errorText}`)
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> }
  const parsed = JSON.parse(data.choices[0].message.content)

  if (parsed.error) {
    throw new Error(parsed.error)
  }

  const name = parsed.name || 'Unknown'
  const set = parsed.set || 'Unknown Set'
  const cardNumber = parsed.cardNumber || '?'
  const rarity = RARITIES.includes(parsed.rarity) ? parsed.rarity : 'Common'
  const type = TYPES.includes(parsed.type) ? parsed.type : 'Colorless'

  const tcgImageUrl = await searchTCGCard(name, set, cardNumber)
  const imageUrl = tcgImageUrl || `https://placehold.co/400x560/88ccee/ffffff?text=${encodeURIComponent(name)}`

  return {
    name,
    set,
    cardNumber,
    rarity,
    type,
    imageUrl,
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function ScanDialog({ open, onOpenChange, onCardScanned }: ScanDialogProps) {
  const [mode, setMode] = useState<Mode>('idle')
  const [videoReady, setVideoReady] = useState(false)
  const [manualForm, setManualForm] = useState({
    name: '',
    set: '',
    cardNumber: '',
    rarity: '',
    type: '',
    imageUrl: '',
  })

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!open) {
      stopCamera()
      setMode('idle')
      setVideoReady(false)
    }
  }, [open, stopCamera])

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      stopCamera()
    }
    onOpenChange(nextOpen)
  }

  const handleBack = () => {
    stopCamera()
    setVideoReady(false)
    setMode('idle')
  }

  const processCard = useCallback((cardData: Omit<PokemonCard, 'id' | 'quantity' | 'dateAdded'>) => {
    const newCard: PokemonCard = {
      id: Date.now().toString(),
      ...cardData,
      quantity: 1,
      dateAdded: Date.now(),
    }
    onCardScanned(newCard)
    toast.success(`${newCard.name} added to collection!`, {
      description: `${newCard.set} • ${newCard.rarity}`,
    })
    onOpenChange(false)
  }, [onCardScanned, onOpenChange])

  const handleUpload = async (file: File) => {
    setMode('analyzing')
    try {
      const dataUrl = await fileToDataUrl(file)
      const cardData = await analyzeCardImage(dataUrl)
      processCard(cardData)
    } catch (error) {
      toast.error('Could not identify the card. Try manual entry instead.', {
        action: {
          label: 'Enter manually',
          onClick: () => setMode('manual'),
        },
      })
      setMode('idle')
    }
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleUpload(file)
    }
    e.target.value = ''
  }

  const startCamera = async () => {
    setMode('camera')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 720 }, height: { ideal: 1280 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => setVideoReady(true)
      }
    } catch (err) {
      const isDenied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
      toast.error(
        isDenied
          ? 'Camera access was denied. Please allow camera permission and try again.'
          : 'No camera found. Try uploading an image instead.'
      )
      setMode('idle')
    }
  }

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video.videoWidth || !video.videoHeight) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    stopCamera()
    setVideoReady(false)
    setMode('analyzing')
    try {
      const cardData = await analyzeCardImage(dataUrl)
      processCard(cardData)
    } catch (error) {
      toast.error('Could not identify the card. Try manual entry instead.', {
        action: {
          label: 'Enter manually',
          onClick: () => setMode('manual'),
        },
      })
      setMode('idle')
    }
  }

  const handleManualSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!manualForm.name || !manualForm.set || !manualForm.rarity || !manualForm.type) {
      toast.error('Please fill in all required fields.')
      return
    }
    processCard({
      name: manualForm.name,
      set: manualForm.set,
      cardNumber: manualForm.cardNumber || '?',
      rarity: manualForm.rarity,
      type: manualForm.type,
      imageUrl: manualForm.imageUrl,
    })
    setManualForm({ name: '', set: '', cardNumber: '', rarity: '', type: '', imageUrl: '' })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="sr-only">Add Pokémon Card</DialogTitle>

        {mode === 'idle' && (
          <div className="flex flex-col items-center gap-6 py-8">
            <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
              <Camera className="w-12 h-12 text-primary" weight="duotone" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold font-display">Add a Pokémon Card</h2>
              <p className="text-muted-foreground">
                Scan, upload, or manually enter your card details
              </p>
            </div>
            <div className="flex flex-col gap-3 w-full">
              <Button
                size="lg"
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-display font-semibold"
                onClick={startCamera}
              >
                <Camera className="w-5 h-5 mr-2" />
                Scan with Camera
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full font-display font-semibold"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-5 h-5 mr-2" />
                Upload Image
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="w-full font-display font-semibold"
                onClick={() => setMode('manual')}
              >
                <PencilSimple className="w-5 h-5 mr-2" />
                Enter Manually
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        )}

        {mode === 'camera' && (
          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={handleBack}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h2 className="text-xl font-bold font-display">Point at a Card</h2>
            </div>
            <div className="relative rounded-lg overflow-hidden bg-black aspect-[9/16]">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 border-2 border-accent/50 rounded-lg pointer-events-none" />
              {!videoReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                  <p className="text-white text-sm">Camera warming up…</p>
                </div>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />
            <Button
              size="lg"
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-display font-semibold"
              onClick={capturePhoto}
              disabled={!videoReady}
            >
              <Camera className="w-5 h-5 mr-2" />
              {videoReady ? 'Capture Card' : 'Waiting for camera…'}
            </Button>
          </div>
        )}

        {mode === 'analyzing' && (
          <div className="flex flex-col items-center gap-6 py-12">
            <motion.div
              animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
              transition={{ duration: 0.6, repeat: Infinity }}
            >
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkle className="w-12 h-12 text-primary" weight="fill" />
              </div>
            </motion.div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold font-display">Identifying Card…</h2>
              <p className="text-muted-foreground">AI is analyzing your card</p>
            </div>
          </div>
        )}

        {mode === 'manual' && (
          <form onSubmit={handleManualSubmit} className="flex flex-col gap-4 py-4">
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="icon" onClick={handleBack}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h2 className="text-xl font-bold font-display">Enter Card Details</h2>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="card-name">Card Name *</Label>
                <Input
                  id="card-name"
                  placeholder="e.g. Charizard"
                  value={manualForm.name}
                  onChange={e => setManualForm(f => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="card-set">Set *</Label>
                <Input
                  id="card-set"
                  placeholder="e.g. Base Set"
                  value={manualForm.set}
                  onChange={e => setManualForm(f => ({ ...f, set: e.target.value }))}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="card-number">Card Number</Label>
                  <Input
                    id="card-number"
                    placeholder="e.g. 4/102"
                    value={manualForm.cardNumber}
                    onChange={e => setManualForm(f => ({ ...f, cardNumber: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Type *</Label>
                  <Select
                    value={manualForm.type}
                    onValueChange={v => setManualForm(f => ({ ...f, type: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Rarity *</Label>
                <Select
                  value={manualForm.rarity}
                  onValueChange={v => setManualForm(f => ({ ...f, rarity: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select rarity" />
                  </SelectTrigger>
                  <SelectContent>
                    {RARITIES.map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="card-image">Image URL (optional)</Label>
                <Input
                  id="card-image"
                  placeholder="https://..."
                  value={manualForm.imageUrl}
                  onChange={e => setManualForm(f => ({ ...f, imageUrl: e.target.value }))}
                />
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-display font-semibold mt-2"
            >
              <PencilSimple className="w-5 h-5 mr-2" />
              Add to Collection
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
