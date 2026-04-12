import { useState, useRef, useCallback, useEffect, type ChangeEvent, type FormEvent } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Camera, Upload, Sparkle, PencilSimple, ArrowLeft, Stack, CheckCircle, ListBullets, GearSix } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { CardReviewPanel } from '@/components/CardReviewPanel'
import { queueApi } from '@/lib/queue-api'
import { motion } from 'framer-motion'
import { toast } from '@/lib/toast'
import type { CameraPreferences, PokemonCard } from '@/lib/types'
import { useTCGDatabase } from '@/lib/tcg-database'
import { assessImageQuality } from '@/lib/image-processing'
import {
  analyzeCardImage,
  analyzeMultipleCardsImage,
  analyzeBestSingleCard,
  draftToPokemonCard,
  isAutoAddEligible,
  fileToDataUrl,
  resizeDataUrlForInference,
  RARITIES,
  TYPES,
  BULK_SCAN_JPEG_QUALITY,
  AUTO_ADD_CONFIDENCE_THRESHOLD,
  SINGLE_SCAN_MAX_IMAGE_SIDE,
  BULK_SCAN_MAX_IMAGE_SIDE,
  SINGLE_SCAN_UPLOAD_QUALITY,
  BULK_SCAN_UPLOAD_QUALITY,
  type ScannedCardDraft,
  type ScanQueueItem,
} from '@/lib/card-analysis'

interface ScanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCardScanned: (card: PokemonCard) => void
  onCardsScanned?: (cards: PokemonCard[]) => void
  cameraPreferences: CameraPreferences
  onCameraPreferencesChange: (value: CameraPreferences) => void
  queue: ScanQueueItem[]
  onAddToQueue: (item: ScanQueueItem) => void
  onOpenQueue: () => void
  reviewDrafts?: ScannedCardDraft[] | null
  /** When true, opening the dialog jumps straight to the sequential capture view. */
  openToQueue?: boolean
}

type Mode = 'idle' | 'single-picker' | 'bulk-picker' | 'camera' | 'analyzing' | 'manual' | 'bulk' | 'bulk-review' | 'sequential'



const RESOLUTION_OPTIONS = {
  auto: null,
  hd: { width: 1280, height: 720 },
  fullhd: { width: 1920, height: 1080 },
  qhd: { width: 2560, height: 1440 },
} as const



async function configureTrackForRecognition(
  track: MediaStreamTrack,
  targetMode: 'camera' | 'bulk',
  cameraPreferences: CameraPreferences,
) {
  if (typeof track.getCapabilities !== 'function' || typeof track.applyConstraints !== 'function') return

  const caps = track.getCapabilities() as Record<string, unknown>
  const advanced: Record<string, unknown>[] = []

  if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
    advanced.push({ focusMode: 'continuous' })
  }
  const zoomCaps = caps.zoom as { min?: number; max?: number } | undefined
  if (zoomCaps?.max) {
    const minZoom = zoomCaps.min ?? 1
    const maxZoom = zoomCaps.max
    const zoomValue = Math.max(minZoom, Math.min(cameraPreferences.zoom, maxZoom))
    advanced.push({ zoom: zoomValue })
  }

  if (caps.torch && typeof cameraPreferences.torchEnabled === 'boolean') {
    advanced.push({ torch: cameraPreferences.torchEnabled })
  }

  if (targetMode === 'bulk' && Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes('continuous')) {
    advanced.push({ whiteBalanceMode: 'continuous' })
  }

  if (advanced.length > 0) {
    try {
      await track.applyConstraints({ advanced } as MediaTrackConstraints)
    } catch {
      // Capability support varies by browser/device.
    }
  }
}

export function ScanDialog({
  open,
  onOpenChange,
  onCardScanned,
  onCardsScanned,
  cameraPreferences,
  onCameraPreferencesChange,
  queue,
  onAddToQueue,
  onOpenQueue,
  reviewDrafts,
  openToQueue,
}: ScanDialogProps) {
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

  const { findCard, searchCards } = useTCGDatabase()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const nativeSingleInputRef = useRef<HTMLInputElement>(null)
  const nativeBulkInputRef = useRef<HTMLInputElement>(null)
  const bulkFileInputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [bulkQueue, setBulkQueue] = useState<ScannedCardDraft[]>([])
  const [isMultiAnalyzing, setIsMultiAnalyzing] = useState(false)
  const [isBurstCapturing, setIsBurstCapturing] = useState(false)
  const [burstProgress, setBurstProgress] = useState(0)
  // Sequential capture
  const [sequentialHasCamera, setSequentialHasCamera] = useState(false)
  const [cameraSettingsOpen, setCameraSettingsOpen] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; supported: boolean }>({ min: 1, max: 3, supported: false })
  const [_preferNativeCamera, setPreferNativeCamera] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(max-width: 768px), (pointer: coarse)')
    const updatePreference = () => setPreferNativeCamera(mediaQuery.matches)
    updatePreference()

    mediaQuery.addEventListener('change', updatePreference)
    return () => mediaQuery.removeEventListener('change', updatePreference)
  }, [])


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
      setBulkQueue([])
      setIsMultiAnalyzing(false)
      setIsBurstCapturing(false)
      setBurstProgress(0)
      setCameraSettingsOpen(false)
      setTorchSupported(false)
      setZoomRange({ min: 1, max: 3, supported: false })
      setSequentialHasCamera(false)
    } else if (openToQueue) {
      setMode('sequential')
    }
  }, [open, openToQueue, stopCamera])


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
    setBulkQueue([])
    setIsMultiAnalyzing(false)
    setIsBurstCapturing(false)
    setBurstProgress(0)
    setCameraSettingsOpen(false)
    setSequentialHasCamera(false)
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

  const openReview = useCallback((cards: ScannedCardDraft[]) => {
    if (cards.length === 1 && isAutoAddEligible(cards[0].confidence)) {
      processCard({
        name: cards[0].name,
        set: cards[0].set,
        cardNumber: cards[0].cardNumber,
        pokedexNumber: cards[0].pokedexNumber,
        rarity: cards[0].rarity,
        type: cards[0].type,
        supertype: cards[0].supertype,
        imageUrl: cards[0].imageUrl,
        largeImageUrl: cards[0].largeImageUrl,
        prices: cards[0].prices,
        tcgCardId: cards[0].tcgCardId,
      })
      return
    }

    if (cards.length > 1) {
      const autoAddCards = cards.filter(card => isAutoAddEligible(card.confidence))
      const needsReviewCards = cards.filter(card => !isAutoAddEligible(card.confidence))

      if (autoAddCards.length > 0) {
        try {
          const newCards = autoAddCards.map(draftToPokemonCard)
          if (onCardsScanned) {
            onCardsScanned(newCards)
          } else {
            newCards.forEach(card => onCardScanned(card))
          }

          if (needsReviewCards.length === 0) {
            toast.success(`${newCards.length} cards added automatically`, {
              description: `All cards scanned above ${Math.round(AUTO_ADD_CONFIDENCE_THRESHOLD * 100)}% confidence.`,
            })
            onOpenChange(false)
            return
          }

          toast.success(`${newCards.length} cards added automatically`, {
            description: `${needsReviewCards.length} card(s) need manual review.`,
          })

          cards = needsReviewCards
        } catch {
          // If auto-add fails, continue with full manual review list.
        }
      }
    }

    setBulkQueue(cards)
    setMode('bulk-review')
  }, [onCardScanned, onCardsScanned, onOpenChange, processCard])

  const _handleUpload = async (file: File) => {
    setMode('analyzing')
    try {
      const rawDataUrl = await fileToDataUrl(file)
      const dataUrl = await resizeDataUrlForInference(rawDataUrl, SINGLE_SCAN_MAX_IMAGE_SIDE, SINGLE_SCAN_UPLOAD_QUALITY)
      const qualityReport = await assessImageQuality(dataUrl)
      if (qualityReport.suggestion) {
        toast.warning(qualityReport.suggestion, { duration: 5000 })
      }
      const cardData = await analyzeCardImage(dataUrl, findCard, searchCards, qualityReport)
      openReview([cardData])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error('Could not identify the card. Try manual entry instead.', {
        description: message,
        action: {
          label: 'Enter manually',
          onClick: () => setMode('manual'),
        },
      })
      setMode('idle')
    }
  }

  const handleBulkUpload = async (file: File) => {
    setIsMultiAnalyzing(true)
    setMode('analyzing')
    try {
      const rawDataUrl = await fileToDataUrl(file)
      const dataUrl = await resizeDataUrlForInference(rawDataUrl, BULK_SCAN_MAX_IMAGE_SIDE, BULK_SCAN_UPLOAD_QUALITY)
      const qualityReport = await assessImageQuality(dataUrl)
      if (qualityReport.suggestion) {
        toast.warning(qualityReport.suggestion, { duration: 5000 })
      }
      const cards = await analyzeMultipleCardsImage(dataUrl, findCard, searchCards, qualityReport)
      if (cards.length === 0) {
        toast.error('No Pokemon cards detected. Try again with better lighting or angle.')
        setMode('idle')
        return
      }
      openReview(cards)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error('Could not analyze the image. Please try again.', {
        description: message.toLowerCase().includes('timeout')
          ? `${message}. Tip: try 3-5 cards per shot, then continue with another photo.`
          : message,
      })
      setMode('idle')
    } finally {
      setIsMultiAnalyzing(false)
    }
  }

  const addSingleToQueue = useCallback(async (file: File) => {
    try {
      const rawDataUrl = await fileToDataUrl(file)
      const dataUrl = await resizeDataUrlForInference(rawDataUrl, SINGLE_SCAN_MAX_IMAGE_SIDE, SINGLE_SCAN_UPLOAD_QUALITY)
      const qualityReport = await assessImageQuality(dataUrl)
      if (qualityReport.suggestion) toast.warning(qualityReport.suggestion, { duration: 4000 })
      const id = crypto.randomUUID()
      await queueApi.add(id, dataUrl)
      const item: ScanQueueItem = { id, dataUrl: '', imageUrl: `/api/scan-queue/${id}/image`, status: 'pending' }
      onAddToQueue(item)
      setSequentialHasCamera(false)
      setMode('sequential')
      toast.success('Card added to queue')
    } catch {
      toast.error('Could not read image. Please try again.')
    }
  }, [onAddToQueue])

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) addSingleToQueue(file)
    e.target.value = ''
  }

  const handleNativeSingleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) addSingleToQueue(file)
    e.target.value = ''
  }

  const handleNativeBulkChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleBulkUpload(file)
    }
    e.target.value = ''
  }

  const handleBulkFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleBulkUpload(file)
    }
    e.target.value = ''
  }

  const openSingleScanner = () => setMode('single-picker')
  const openBulkScanner   = () => setMode('bulk-picker')

  const applyTrackPreferences = useCallback(async (
    track: MediaStreamTrack,
    targetMode: 'camera' | 'bulk',
    prefs: CameraPreferences,
  ) => {
    await configureTrackForRecognition(track, targetMode, prefs)
    const caps = track.getCapabilities() as Record<string, unknown>

    const hasTorch = Boolean(caps.torch)
    setTorchSupported(hasTorch)

    const zoomCaps = caps.zoom as { min?: number; max?: number } | undefined
    if (zoomCaps?.max) {
      setZoomRange({
        min: zoomCaps.min ?? 1,
        max: zoomCaps.max,
        supported: true,
      })
    } else {
      setZoomRange({ min: 1, max: 3, supported: false })
    }
  }, [])

  const updateCameraPreferences = async (
    patch: Partial<CameraPreferences>,
  ) => {
    const nextPreferences = { ...cameraPreferences, ...patch }
    onCameraPreferencesChange(nextPreferences)

    if (mode !== 'camera' && mode !== 'bulk' && mode !== 'sequential') {
      return
    }

    const changedRequiresRestart =
      patch.resolution !== undefined || patch.facingMode !== undefined

    if (changedRequiresRestart) {
      const cameraMode: 'camera' | 'bulk' = mode === 'sequential' ? 'bulk' : mode as 'camera' | 'bulk'
      await startCamera(cameraMode, nextPreferences, mode === 'sequential')
      if (mode === 'sequential') setMode('sequential')
      return
    }

    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const trackMode: 'camera' | 'bulk' = mode === 'sequential' ? 'bulk' : mode as 'camera' | 'bulk'
    await applyTrackPreferences(track, trackMode, nextPreferences)
  }

  const startCamera = useCallback(async (
    targetMode: 'camera' | 'bulk' = 'camera',
    preferencesOverride?: CameraPreferences,
    keepMode = false,
  ) => {
    const activePreferences = preferencesOverride ?? cameraPreferences

    stopCamera()
    setVideoReady(false)
    if (!keepMode) setMode(targetMode)
    try {
      const selectedResolution = RESOLUTION_OPTIONS[activePreferences.resolution]
      const preferredConstraints: MediaTrackConstraints[] = []

      if (selectedResolution) {
        preferredConstraints.push({
          facingMode: { ideal: activePreferences.facingMode },
          width: { ideal: selectedResolution.width },
          height: { ideal: selectedResolution.height },
        })
      }

      if (targetMode === 'bulk') {
        preferredConstraints.push(
          { facingMode: { ideal: activePreferences.facingMode }, width: { ideal: 2560 }, height: { ideal: 1440 }, aspectRatio: { ideal: 16 / 9 } },
          { facingMode: { ideal: activePreferences.facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 }, aspectRatio: { ideal: 16 / 9 } },
        )
      } else {
        preferredConstraints.push(
          { facingMode: { ideal: activePreferences.facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          { facingMode: { ideal: activePreferences.facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        )
      }

      preferredConstraints.push({ facingMode: activePreferences.facingMode })

      let stream: MediaStream | null = null
      for (const constraint of preferredConstraints) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: constraint })
          break
        } catch {
          // Try next fallback profile.
        }
      }
      if (!stream) throw new Error('Unable to acquire camera stream')

      streamRef.current = stream
      const videoTrack = stream.getVideoTracks()[0]
      if (videoTrack) await applyTrackPreferences(videoTrack, targetMode, activePreferences)

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
  }, [applyTrackPreferences, cameraPreferences, stopCamera])

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video.videoWidth || !video.videoHeight) return

    setIsBurstCapturing(true)
    setBurstProgress(0)

    try {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Camera frame capture failed')

      ctx.drawImage(video, 0, 0)
      const rawDataUrl = canvas.toDataURL('image/jpeg', 0.92)
      const dataUrl = await resizeDataUrlForInference(rawDataUrl, SINGLE_SCAN_MAX_IMAGE_SIDE, SINGLE_SCAN_UPLOAD_QUALITY)
      setBurstProgress(100)

      const qualityReport = await assessImageQuality(dataUrl)
      if (qualityReport.suggestion) {
        toast.warning(qualityReport.suggestion, { duration: 5000 })
      }

      stopCamera()
      setVideoReady(false)

      const id = crypto.randomUUID()
      await queueApi.add(id, dataUrl)
      const item: ScanQueueItem = { id, dataUrl: '', imageUrl: `/api/scan-queue/${id}/image`, status: 'pending' }
      onAddToQueue(item)
      setSequentialHasCamera(false)
      setMode('sequential')
      toast.success('Card added to queue')
    } catch (error) {
      stopCamera()
      setVideoReady(false)
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error('Could not capture the card. Please try again.', { description: message })
      setMode('idle')
    } finally {
      setIsBurstCapturing(false)
      setBurstProgress(0)
    }
  }

  const captureMultipleCards = async () => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video.videoWidth || !video.videoHeight) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const rawDataUrl = canvas.toDataURL('image/jpeg', BULK_SCAN_JPEG_QUALITY)
    const dataUrl = await resizeDataUrlForInference(rawDataUrl, BULK_SCAN_MAX_IMAGE_SIDE, BULK_SCAN_UPLOAD_QUALITY)
    stopCamera()
    setVideoReady(false)

    // Assess quality and warn — analysis gets enhancement hints via qualityReport.
    const qualityReport = await assessImageQuality(dataUrl)
    if (qualityReport.suggestion) {
      toast.warning(qualityReport.suggestion, { duration: 5000 })
    }

    setIsMultiAnalyzing(true)
    try {
      const cards = await analyzeMultipleCardsImage(dataUrl, findCard, searchCards, qualityReport)
      if (cards.length === 0) {
        toast.error('No Pokémon cards detected. Try again with better lighting or angle.')
        setMode('bulk')
        await startCamera('bulk')
        return
      }

      openReview(cards)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error('Could not analyze the image. Please try again.', {
        description: message,
      })
      setMode('bulk')
      await startCamera('bulk')
    } finally {
      setIsMultiAnalyzing(false)
    }
  }

  // ── Sequential capture ───────────────────────────────────────────────────

  const captureSequentialShot = async () => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video.videoWidth || !video.videoHeight) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const rawDataUrl = canvas.toDataURL('image/jpeg', BULK_SCAN_JPEG_QUALITY)
    const dataUrl = await resizeDataUrlForInference(rawDataUrl, SINGLE_SCAN_MAX_IMAGE_SIDE, SINGLE_SCAN_UPLOAD_QUALITY)

    const qualityReport = await assessImageQuality(dataUrl)
    if (qualityReport.suggestion) toast.warning(qualityReport.suggestion, { duration: 4000 })

    const id = crypto.randomUUID()
    try {
      await queueApi.add(id, dataUrl)
    } catch {
      toast.error('Could not save shot to server. Please try again.')
      return
    }
    const item: ScanQueueItem = { id, dataUrl: '', imageUrl: `/api/scan-queue/${id}/image`, status: 'pending' }
    onAddToQueue(item)
    toast.success('Shot added to queue', { description: `${queue.length + 1} card(s) queued` })
  }


  // ── Bulk done ────────────────────────────────────────────────────────────

  const handleBulkDone = useCallback(() => {
    const selectedCards = bulkQueue.filter(card => card.selected)
    if (selectedCards.length === 0) {
      toast.error('Select at least one card to add.')
      return
    }

    const newCards: PokemonCard[] = selectedCards.map(draftToPokemonCard)

    if (onCardsScanned) {
      onCardsScanned(newCards)
    } else {
      newCards.forEach(card => onCardScanned(card))
    }

    stopCamera()
    setBulkQueue([])
    onOpenChange(false)
  }, [bulkQueue, onCardsScanned, onCardScanned, onOpenChange, stopCamera])

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
      imageUrl: manualForm.imageUrl || `https://placehold.co/400x560/88ccee/ffffff?text=${encodeURIComponent(manualForm.name)}`,
    })
    setManualForm({ name: '', set: '', cardNumber: '', rarity: '', type: '', imageUrl: '' })
  }

  // When the dialog opens with pre-loaded review drafts (e.g. from ScanQueueDialog), enter bulk-review mode.
  const openReviewRef = useRef(openReview)
  useEffect(() => { openReviewRef.current = openReview }, [openReview])
  useEffect(() => {
    if (open && reviewDrafts && reviewDrafts.length > 0) {
      openReviewRef.current(reviewDrafts)
    }
  }, [open, reviewDrafts])

  const cameraSettingsPanel = (
    <details
      className="rounded-lg border border-border bg-muted/20"
      open={cameraSettingsOpen}
      onToggle={(event) => setCameraSettingsOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer list-none px-3 py-3 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <div className="flex items-center justify-between gap-3">
          <span>Camera Settings</span>
          <span className="text-xs text-muted-foreground">{cameraSettingsOpen ? 'Hide' : 'Show'}</span>
        </div>
      </summary>

      <div className="space-y-3 border-t border-border p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
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

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Camera</Label>
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
        </div>

        {zoomRange.supported && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Zoom</Label>
            <div className="flex items-center gap-3">
              <Input
                type="range"
                min={zoomRange.min}
                max={zoomRange.max}
                step={0.1}
                value={cameraPreferences.zoom}
                onChange={(e) => updateCameraPreferences({ zoom: Number(e.target.value) })}
                className="flex-1"
              />
              <span className="text-xs w-10 text-right">{cameraPreferences.zoom.toFixed(1)}x</span>
            </div>
          </div>
        )}

        {torchSupported && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="scan-torch"
              checked={cameraPreferences.torchEnabled}
              onCheckedChange={(checked) => updateCameraPreferences({ torchEnabled: checked === true })}
            />
            <Label htmlFor="scan-torch" className="text-sm">Flash/Torch</Label>
          </div>
        )}

        {!zoomRange.supported && !torchSupported && (
          <p className="text-xs text-muted-foreground">
            This camera only exposes basic controls on this device.
          </p>
        )}
      </div>
    </details>
  )

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={mode === 'bulk-review' ? 'max-h-[92vh] max-w-[96vw] overflow-y-auto sm:max-w-6xl' : mode === 'camera' ? 'h-[96svh] max-w-[96vw] overflow-hidden p-0 gap-0 flex flex-col [&>button:last-child]:hidden sm:max-w-2xl' : (mode === 'bulk' || mode === 'sequential') ? 'max-h-[92vh] max-w-[96vw] overflow-y-auto sm:max-w-3xl' : 'flex flex-col max-h-[90vh] overflow-y-auto sm:max-w-md'}>
        <DialogTitle className="sr-only">Add Pokemon Card</DialogTitle>

        {mode === 'idle' && (
          <div className="flex flex-col items-center gap-6 py-8">
            <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
              <Camera className="w-12 h-12 text-primary" weight="duotone" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold font-display">Add a Pokémon Card</h2>
              <p className="text-muted-foreground text-sm">Choose how you'd like to add cards to your collection</p>
            </div>
            <div className="flex flex-col gap-3 w-full">
              <Button
                size="lg"
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-display font-semibold"
                onClick={openSingleScanner}
              >
                <Camera className="w-5 h-5 mr-2" />
                Scan Single Card
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full font-display font-semibold"
                onClick={openBulkScanner}
              >
                <Stack className="w-5 h-5 mr-2" />
                Bulk Scan
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
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>
        )}

        {/* ── Single card method picker ──────────────────────────────────── */}
        {mode === 'single-picker' && (
          <div className="flex flex-col gap-6 py-6">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setMode('idle')}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h2 className="text-xl font-bold font-display">Scan Single Card</h2>
                <p className="text-xs text-muted-foreground">Choose your capture method</p>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <button
                className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent/10"
                onClick={() => { nativeSingleInputRef.current?.click() }}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Camera className="w-6 h-6 text-primary" weight="duotone" />
                </div>
                <div>
                  <p className="font-display font-semibold text-sm">Native Camera</p>
                  <p className="text-xs text-muted-foreground">Use your device's built-in camera app for best results</p>
                </div>
              </button>
              <button
                className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent/10"
                onClick={() => { setSequentialHasCamera(true); setMode('sequential'); startCamera('camera', undefined, true) }}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Camera className="w-6 h-6 text-primary" weight="fill" />
                </div>
                <div>
                  <p className="font-display font-semibold text-sm">In-App Camera</p>
                  <p className="text-xs text-muted-foreground">Live viewfinder with zoom &amp; torch controls</p>
                </div>
              </button>
              <button
                className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent/10"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Upload className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="font-display font-semibold text-sm">Upload Image</p>
                  <p className="text-xs text-muted-foreground">Pick an existing photo from your device</p>
                </div>
              </button>
              <button
                className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent/10"
                onClick={() => setMode('manual')}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <PencilSimple className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="font-display font-semibold text-sm">Enter Manually</p>
                  <p className="text-xs text-muted-foreground">Type in the card details yourself</p>
                </div>
              </button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            <input ref={nativeSingleInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleNativeSingleChange} />
          </div>
        )}

        {/* ── Bulk scan method picker ────────────────────────────────────── */}
        {mode === 'bulk-picker' && (
          <div className="flex flex-col gap-6 py-6">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setMode('idle')}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <h2 className="text-xl font-bold font-display">Bulk Scan</h2>
                <p className="text-xs text-muted-foreground">Choose your capture method</p>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <button
                className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent/10"
                onClick={() => { nativeBulkInputRef.current?.click() }}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Camera className="w-6 h-6 text-primary" weight="duotone" />
                </div>
                <div>
                  <p className="font-display font-semibold text-sm">Native Camera</p>
                  <p className="text-xs text-muted-foreground">Photograph multiple cards at once with your device camera</p>
                </div>
              </button>
              <button
                className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent/10"
                onClick={() => startCamera('bulk')}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Stack className="w-6 h-6 text-primary" weight="fill" />
                </div>
                <div>
                  <p className="font-display font-semibold text-sm">In-App Camera (one shot)</p>
                  <p className="text-xs text-muted-foreground">Lay all cards out and capture them in a single frame</p>
                </div>
              </button>
              <button
                className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent/10"
                onClick={() => setMode('sequential')}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <ListBullets className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="font-display font-semibold text-sm">Sequential Shots</p>
                  <p className="text-xs text-muted-foreground">Photograph each card individually — they queue up for batch processing</p>
                </div>
              </button>
              <button
                className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent/10"
                onClick={() => bulkFileInputRef.current?.click()}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Upload className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="font-display font-semibold text-sm">Upload Image</p>
                  <p className="text-xs text-muted-foreground">Pick a photo with multiple cards already taken</p>
                </div>
              </button>
            </div>
            <input ref={nativeBulkInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleNativeBulkChange} />
            <input ref={bulkFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleBulkFileChange} />
          </div>
        )}

        {mode === 'camera' && (
          <div className="relative flex-1 min-h-0 w-full bg-black">
            {/* Full-height video */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="block h-full w-full object-cover object-center"
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Top bar — back + settings */}
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 pt-3 pb-6 bg-gradient-to-b from-black/60 to-transparent">
              <button
                onClick={handleBack}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
                aria-label="Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setCameraSettingsOpen(v => !v)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
                aria-label="Camera Settings"
              >
                <GearSix className="w-5 h-5" />
              </button>
            </div>

            {/* Collapsed settings panel overlay */}
            {cameraSettingsOpen && (
              <div className="absolute top-14 left-3 right-3 z-10">
                {cameraSettingsPanel}
              </div>
            )}

            {/* Hint */}
            {!isBurstCapturing && (
              <div className="absolute bottom-28 left-0 right-0 text-center pointer-events-none">
                <p className="text-white text-sm font-medium bg-black/50 backdrop-blur-sm px-4 py-1.5 rounded-full inline-block">
                  Fill the frame with the card and avoid glare
                </p>
              </div>
            )}

            {/* Burst capturing overlay */}
            {isBurstCapturing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 backdrop-blur-sm">
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                >
                  <Camera className="w-12 h-12 text-accent" weight="fill" />
                </motion.div>
                <p className="text-white text-sm font-semibold">Capturing best frame...</p>
                <p className="text-white/70 text-xs">{burstProgress}%</p>
              </div>
            )}

            {/* Camera warming up overlay */}
            {!videoReady && !isBurstCapturing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                <p className="text-white text-sm">Camera warming up...</p>
              </div>
            )}

            {/* Bottom shutter bar */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center pb-6 pt-4 bg-gradient-to-t from-black/70 to-transparent">
              <button
                onClick={capturePhoto}
                disabled={!videoReady || isBurstCapturing}
                className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border-4 border-white bg-white/20 backdrop-blur-sm disabled:opacity-40 active:scale-95 transition-transform"
                aria-label="Capture"
                style={{ height: '4.5rem', width: '4.5rem' }}
              >
                <div className="h-14 w-14 rounded-full bg-white" style={{ height: '3.5rem', width: '3.5rem' }} />
              </button>
            </div>
          </div>
        )}

        {mode === 'bulk' && (
          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={handleBack}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h2 className="text-xl font-bold font-display">Scan All Cards</h2>
            </div>

            {cameraSettingsPanel}

            <div className="relative h-[52vh] min-h-[18rem] w-full overflow-hidden rounded-lg bg-black sm:h-[60vh]">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 block h-full w-full object-cover object-center"
              />
              <div className="absolute bottom-3 left-0 right-0 text-center">
                <p className="text-white text-xs font-medium bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full inline-block">
                  Use the full frame and include all visible cards
                </p>
              </div>
              {isMultiAnalyzing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 backdrop-blur-sm">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity }}
                  >
                    <Sparkle className="w-10 h-10 text-primary" weight="fill" />
                  </motion.div>
                  <p className="text-white text-sm font-semibold">Scanning for cards...</p>
                  <p className="text-white/70 text-xs">AI is identifying all visible cards</p>
                </div>
              )}
              {!videoReady && !isMultiAnalyzing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                  <p className="text-white text-sm">Camera warming up...</p>
                </div>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />

            <Button
              size="lg"
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-display font-semibold"
              onClick={captureMultipleCards}
              disabled={!videoReady || isMultiAnalyzing}
            >
              <Stack className="w-5 h-5 mr-2" />
              {isMultiAnalyzing ? 'Scanning...' : videoReady ? 'Scan All Cards' : 'Waiting for camera...'}
            </Button>
          </div>
        )}

        {/* ── Sequential / single-queue capture mode ───────────────────── */}
        {mode === 'sequential' && (
          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={handleBack}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div className="flex-1">
                <h2 className="text-xl font-bold font-display">Capture Cards</h2>
                <p className="text-xs text-muted-foreground">
                  {sequentialHasCamera ? 'Photograph each card, then view your queue' : 'Add cards using camera or upload'}
                </p>
              </div>
              {queue.length > 0 && (
                <Badge variant="secondary">{queue.length} queued</Badge>
              )}
            </div>

            {sequentialHasCamera && (
              <>
                {cameraSettingsPanel}
                <div className="relative h-[40vh] min-h-[16rem] w-full overflow-hidden rounded-lg bg-black sm:h-[50vh]">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 block h-full w-full object-cover object-center"
                  />
                  <div className="absolute bottom-3 left-0 right-0 text-center">
                    <p className="text-white text-xs font-medium bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full inline-block">
                      Fill the frame with one card, then tap Add to Queue
                    </p>
                  </div>
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
                  onClick={captureSequentialShot}
                  disabled={!videoReady}
                >
                  <Camera className="w-5 h-5 mr-2" />
                  Add to Queue
                </Button>
              </>
            )}

            {!sequentialHasCamera && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="font-display font-semibold"
                  onClick={() => nativeSingleInputRef.current?.click()}
                >
                  <Camera className="w-4 h-4 mr-2" weight="duotone" />
                  Native Camera
                </Button>
                <Button
                  variant="outline"
                  className="font-display font-semibold"
                  onClick={() => { setSequentialHasCamera(true); startCamera('camera', undefined, true) }}
                >
                  <Camera className="w-4 h-4 mr-2" weight="fill" />
                  In-App Camera
                </Button>
                <Button
                  variant="outline"
                  className="col-span-2 font-display font-semibold"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Another Image
                </Button>
              </div>
            )}
            <input ref={nativeSingleInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleNativeSingleChange} />
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

            {queue.length > 0 && (
              <Button
                size="lg"
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-display font-semibold"
                onClick={onOpenQueue}
              >
                <ListBullets className="w-5 h-5 mr-2" />
                View Queue ({queue.length} item{queue.length !== 1 ? 's' : ''})
              </Button>
            )}
          </div>
        )}

        {mode === 'bulk-review' && (
          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={handleBack}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h2 className="text-xl font-bold font-display">Review Scan Results</h2>
              <Badge variant="secondary" className="ml-auto">
                {bulkQueue.length} card{bulkQueue.length !== 1 ? 's' : ''}
              </Badge>
            </div>
            <CardReviewPanel
              cards={bulkQueue}
              onCardsChange={setBulkQueue}
              onConfirm={handleBulkDone}
              scannedCardsNote="These previews are cropped from your original scan to help visual matching."
              listMaxHeight="58vh"
              bottomActions={
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full font-display font-semibold"
                  onClick={() => { setBulkQueue([]); startCamera('bulk') }}
                >
                  <Camera className="w-5 h-5 mr-2" />
                  Scan Again
                </Button>
              }
            />
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
              <h2 className="text-2xl font-bold font-display">Identifying Card...</h2>
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
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-display font-semibold"
            >
              <CheckCircle className="w-5 h-5 mr-2" />
              Add Card to Collection
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
