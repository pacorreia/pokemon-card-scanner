import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Database, ArrowsClockwise, CheckCircle, Warning } from '@phosphor-icons/react'
import { useTCGDatabase } from '@/lib/tcg-database'
import { toast } from 'sonner'

interface DatabaseManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DatabaseManager({ open, onOpenChange }: DatabaseManagerProps) {
  const { metadata, isLoaded, updateDatabase } = useTCGDatabase()
  const [isUpdating, setIsUpdating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')

  const handleUpdate = async () => {
    setIsUpdating(true)
    setProgress(0)
    setProgressMessage('Starting download...')

    const result = await updateDatabase((current, total, message) => {
      setProgress(current)
      setProgressMessage(message)
    })

    setIsUpdating(false)

    if (result.success) {
      toast.success('Card database updated successfully!', {
        description: 'All card data has been downloaded and cached locally.'
      })
      onOpenChange(false)
    } else {
      toast.error('Failed to update database', {
        description: 'Please check your internet connection and try again.'
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl flex items-center gap-2">
            <Database className="w-6 h-6" weight="duotone" />
            Card Database
          </DialogTitle>
          <DialogDescription>
            Manage your local Pokémon TCG card database
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {isLoaded ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
                <CheckCircle className="w-6 h-6 text-green-600" weight="fill" />
                <div className="flex-1">
                  <p className="font-semibold text-green-900">Database Loaded</p>
                  <p className="text-sm text-green-700">
                    {metadata?.cardCount.toLocaleString()} cards from {metadata?.setCount} sets
                  </p>
                </div>
              </div>

              {metadata && (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Updated</span>
                    <span className="font-medium">
                      {new Date(metadata.lastUpdated).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Cards</span>
                    <span className="font-medium">{metadata.cardCount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Sets</span>
                    <span className="font-medium">{metadata.setCount}</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <Warning className="w-6 h-6 text-yellow-600" weight="fill" />
                <div className="flex-1">
                  <p className="font-semibold text-yellow-900">No Database</p>
                  <p className="text-sm text-yellow-700">
                    Download the card database to enable card recognition
                  </p>
                </div>
              </div>
            </div>
          )}

          {isUpdating && (
            <div className="space-y-3">
              <Progress value={progress} className="h-2" />
              <p className="text-sm text-muted-foreground text-center">{progressMessage}</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-display font-semibold"
              onClick={handleUpdate}
              disabled={isUpdating}
            >
              <ArrowsClockwise className="w-5 h-5 mr-2" weight={isUpdating ? 'bold' : 'regular'} />
              {isUpdating ? 'Downloading...' : isLoaded ? 'Refresh Database' : 'Download Database'}
            </Button>
            
            {isLoaded && (
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isUpdating}
              >
                Close
              </Button>
            )}
          </div>

          {!isLoaded && (
            <p className="text-xs text-muted-foreground text-center">
              This will download approximately 10-20MB of data from GitHub. Make sure you have a stable internet connection.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
