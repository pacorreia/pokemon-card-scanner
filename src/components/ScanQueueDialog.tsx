import { useState, useRef, useCallback, useEffect } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Camera, CheckCircle, X, Sparkle, Timer, Trash } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { toast } from '@/lib/toast'
import type { PokemonCard } from '@/lib/types'
import { useTCGDatabase } from '@/lib/tcg-database'
import { assessImageQuality } from '@/lib/image-processing'
import {
  analyzeBestSingleCard,
  draftToPokemonCard,
  type ScannedCardDraft,
  type ScanQueueItem,
} from '@/lib/card-analysis'
import { CardReviewPanel } from '@/components/CardReviewPanel'
import { queueApi } from '@/lib/queue-api'

interface ScanQueueDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  queue: ScanQueueItem[]
  onQueueChange: (updater: (prev: ScanQueueItem[]) => ScanQueueItem[]) => void
  onCardScanned: (card: PokemonCard) => void
  onCardsScanned?: (cards: PokemonCard[]) => void
  onOpenScanCapture: () => void
}

export function ScanQueueDialog({
  open,
  onOpenChange,
  queue,
  onQueueChange,
  onCardScanned,
  onCardsScanned,
  onOpenScanCapture,
}: ScanQueueDialogProps) {
  const { findCard, searchCards } = useTCGDatabase()
  const [isProcessingQueue, setIsProcessingQueue] = useState(false)
  const cancelRef = useRef(false)
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null)

  // ── Review state ──────────────────────────────────────────────────────────
  const [reviewMode, setReviewMode] = useState(false)
  const [reviewCards, setReviewCards] = useState<ScannedCardDraft[]>([])

  // Reset review UI on close; processing continues in background
  useEffect(() => {
    if (!open) {
      setReviewMode(false)
      setReviewCards([])
    }
  }, [open])

  // ── Queue updater helpers ─────────────────────────────────────────────────
  const updateItem = useCallback((id: string, patch: Partial<ScanQueueItem>) => {
    onQueueChange(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
  }, [onQueueChange])

  const removeItem = (id: string) => {
    onQueueChange(prev => prev.filter(i => i.id !== id))
    queueApi.remove(id).catch(() => {})
  }

  // ── Process queue ─────────────────────────────────────────────────────────
  const processQueue = useCallback(async () => {
    const pending = queue.filter(i => i.status === 'pending')
    if (pending.length === 0) return

    setIsProcessingQueue(true)
    cancelRef.current = false

    for (const item of pending) {
      if (cancelRef.current) {
        updateItem(item.id, { status: 'pending' })
        queueApi.patch(item.id, { status: 'pending' }).catch(() => {})
        continue
      }
      updateItem(item.id, { status: 'processing' })
      queueApi.patch(item.id, { status: 'processing' }).catch(() => {})
      try {
        const dataUrl = await queueApi.fetchImageDataUrl(item.id)
        const qualityReport = await assessImageQuality(dataUrl)
        const drafts = [await analyzeBestSingleCard(dataUrl, findCard, searchCards, qualityReport)]
        updateItem(item.id, { status: 'done', drafts })
        queueApi.patch(item.id, { status: 'done', drafts }).catch(() => {})
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown error'
        updateItem(item.id, { status: 'error', error })
        queueApi.patch(item.id, { status: 'error', error }).catch(() => {})
      }
    }

    setIsProcessingQueue(false)
  }, [queue, findCard, searchCards, updateItem])

  // Auto-start processing whenever the dialog is open and pending items exist
  useEffect(() => {
    if (isProcessingQueue || reviewMode) return
    const hasPending = queue.some(i => i.status === 'pending')
    if (!hasPending) return
    const timer = window.setTimeout(() => {
      processQueue()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [queue, isProcessingQueue, reviewMode, processQueue])

  // Auto-clear successfully processed (done) items after 30 seconds
  useEffect(() => {
    const doneIds = queue.filter(i => i.status === 'done').map(i => i.id)
    if (doneIds.length === 0) return
    const timer = window.setTimeout(() => {
      onQueueChange(prev => prev.filter(i => !doneIds.includes(i.id)))
      // Delete images from server now that they are no longer needed
      for (const id of doneIds) queueApi.remove(id).catch(() => {})
    }, 30_000)
    return () => window.clearTimeout(timer)
  }, [queue, onQueueChange])

  // ── Commit to review / auto-add ───────────────────────────────────────────
  const commitToReview = useCallback(() => {
    const queueItemIds = queue.map(i => i.id)
    const allDrafts = queue.flatMap(i => i.drafts ?? [])
    if (allDrafts.length === 0) {
      toast.error('No cards identified yet. Process the queue first.')
      return
    }

    // Always show review UI so the user can verify all matches.
    // Auto-eligible cards are pre-selected; low-confidence ones are also shown.
    for (const id of queueItemIds) queueApi.remove(id).catch(() => {})
    onQueueChange(() => [])
    setReviewCards(allDrafts.map(d => ({ ...d, selected: true })))
    setReviewMode(true)
  }, [queue, onQueueChange])

  const handleReviewDone = useCallback(() => {
    const selected = reviewCards.filter(c => c.selected)
    if (selected.length === 0) { toast.error('Select at least one card to add.'); return }
    const newCards = selected.map(draftToPokemonCard)
    if (onCardsScanned) {
      onCardsScanned(newCards)
    } else {
      newCards.forEach(c => onCardScanned(c))
    }
    setReviewMode(false)
    setReviewCards([])
    onOpenChange(false)
  }, [reviewCards, onCardScanned, onCardsScanned, onOpenChange])

  const pendingCount = queue.filter(i => i.status === 'pending').length
  const doneCount = queue.filter(i => i.status === 'done').length
  const identifiedCount = queue.flatMap(i => i.drafts ?? []).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`flex flex-col max-h-[92vh] ${reviewMode ? 'max-w-[96vw] sm:max-w-6xl overflow-y-auto' : 'sm:max-w-md'}`}>
        <DialogTitle className="font-display text-xl">
          {reviewMode ? 'Review Identified Cards' : 'Scan Queue'}
        </DialogTitle>

        {/* ── Queue management view ──────────────────────────────────────── */}
        {!reviewMode && (
          <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-1">

            {queue.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-10 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <Camera className="w-8 h-8 text-muted-foreground" weight="duotone" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Queue is empty</p>
                  <p className="text-xs text-muted-foreground mt-1">Capture cards to add them here</p>
                </div>
                <Button onClick={() => { onOpenChange(false); onOpenScanCapture() }} className="bg-accent hover:bg-accent/90 text-accent-foreground font-display font-semibold">
                  <Camera className="w-4 h-4 mr-2" />
                  Start Scanning
                </Button>
              </div>
            ) : (
              <>
                {/* Queue list */}
                <div className="rounded-xl border border-border bg-muted/10 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                    <span className="text-sm font-semibold font-display">Captured Shots</span>
                    <span className="text-xs text-muted-foreground">{pendingCount} pending · {doneCount} identified</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-border">
                    {queue.map((item, idx) => (
                      <div key={item.id} className="px-3 py-2">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-9 shrink-0 overflow-hidden rounded border border-border bg-muted">
                            <img src={item.imageUrl || item.dataUrl} alt={`Shot ${idx + 1}`} className="h-full w-full object-cover" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium">Shot {idx + 1}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">{item.status}</p>
                            {item.error && (
                              <button
                                type="button"
                                onClick={() => setExpandedErrorId(prev => prev === item.id ? null : item.id)}
                                className="text-[10px] text-destructive text-left truncate hover:underline"
                              >
                                {expandedErrorId === item.id ? item.error : (item.error.length > 48 ? item.error.slice(0, 48) + '…' : item.error)}
                              </button>
                            )}
                            {item.status === 'done' && item.drafts?.[0] && (
                              <p className="text-[10px] text-green-600 truncate">{item.drafts[0].name}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {item.status === 'processing' && (
                              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                                <Timer className="w-4 h-4 text-primary" />
                              </motion.div>
                            )}
                            {item.status === 'done' && <CheckCircle className="w-4 h-4 text-green-500" weight="fill" />}
                            {(item.status === 'pending' || item.status === 'error') && !isProcessingQueue && (
                              <button onClick={() => removeItem(item.id)} className="rounded p-0.5 text-muted-foreground hover:text-destructive" aria-label="Remove">
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                        {expandedErrorId === item.id && item.error && (
                          <div className="mt-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
                            <p className="text-[11px] text-destructive break-words whitespace-pre-wrap">{item.error}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col gap-2">
                  {pendingCount > 0 && (
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full font-display font-semibold"
                      onClick={processQueue}
                      disabled={isProcessingQueue}
                    >
                      <Sparkle className="w-5 h-5 mr-2" weight="fill" />
                      {isProcessingQueue ? 'Processing…' : `Process ${pendingCount} Shot${pendingCount !== 1 ? 's' : ''}`}
                    </Button>
                  )}
                  {isProcessingQueue && (
                    <Button
                      size="lg"
                      variant="ghost"
                      className="w-full font-display font-semibold text-destructive"
                      onClick={() => { cancelRef.current = true }}
                    >
                      Cancel Processing
                    </Button>
                  )}
                  {doneCount > 0 && !isProcessingQueue && (
                    <Button
                      size="lg"
                      className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-display font-semibold"
                      onClick={commitToReview}
                    >
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Review {identifiedCount} Identified Card{identifiedCount !== 1 ? 's' : ''}
                    </Button>
                  )}
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full font-display font-semibold"
                    onClick={() => { onOpenChange(false); onOpenScanCapture() }}
                    disabled={isProcessingQueue}
                  >
                    <Camera className="w-5 h-5 mr-2" />
                    Add More Cards
                  </Button>
                  {!isProcessingQueue && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full font-display text-muted-foreground"
                      onClick={() => { onQueueChange(() => []); queueApi.clearAll().catch(() => {}) }}
                    >
                      <Trash className="w-4 h-4 mr-2" />
                      Clear Queue
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Inline review view ─────────────────────────────────────────── */}
        {reviewMode && (
          <div className="flex flex-col gap-4 flex-1 overflow-y-auto pr-1">
            <CardReviewPanel
              cards={reviewCards}
              onCardsChange={setReviewCards}
              onConfirm={handleReviewDone}
              listMaxHeight="50vh"
              bottomActions={
                <Button size="lg" variant="outline" className="w-full font-display font-semibold shrink-0" onClick={() => setReviewMode(false)}>
                  Back to Queue
                </Button>
              }
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
