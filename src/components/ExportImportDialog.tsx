import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Download, Upload, FileArrowDown, FileArrowUp, CheckCircle, Warning } from '@phosphor-icons/react'
import type { PokemonCard } from '@/lib/types'
import { toast } from 'sonner'

interface ExportImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cards: PokemonCard[]
  onImport: (cards: PokemonCard[]) => void
}

export function ExportImportDialog({ open, onOpenChange, cards, onImport }: ExportImportDialogProps) {
  const [importing, setImporting] = useState(false)
  const [databaseTransferBusy, setDatabaseTransferBusy] = useState(false)

  const handleExport = () => {
    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      totalCards: cards.length,
      totalQuantity: cards.reduce((sum, card) => sum + card.quantity, 0),
      cards: cards,
    }

    const dataStr = JSON.stringify(exportData, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = `pokedex-backup-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success('Collection exported!', {
      description: `${cards.length} cards exported successfully`,
    })
  }

  const handleImportClick = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      setImporting(true)
      
      try {
        const text = await file.text()
        const data = JSON.parse(text)

        if (!data.cards || !Array.isArray(data.cards)) {
          throw new Error('Invalid backup file format')
        }

        const validCards = data.cards.filter((card: any) => 
          card.id && 
          card.name && 
          card.set && 
          card.cardNumber !== undefined &&
          card.rarity &&
          card.type &&
          card.imageUrl &&
          card.quantity !== undefined &&
          card.dateAdded !== undefined
        )

        if (validCards.length === 0) {
          throw new Error('No valid cards found in backup file')
        }

        if (validCards.length !== data.cards.length) {
          toast.warning('Some cards were skipped', {
            description: `${data.cards.length - validCards.length} invalid cards were not imported`,
          })
        }

        onImport(validCards)

        toast.success('Collection imported!', {
          description: `${validCards.length} cards imported successfully`,
        })

        onOpenChange(false)
      } catch (error) {
        console.error('Import error:', error)
        toast.error('Import failed', {
          description: error instanceof Error ? error.message : 'Invalid file format',
        })
      } finally {
        setImporting(false)
      }
    }
    input.click()
  }

  const handleExportSqlite = async () => {
    setDatabaseTransferBusy(true)
    try {
      const res = await fetch('/api/db/export')
      if (!res.ok) {
        throw new Error(await res.text())
      }

      const blob = await res.blob()
      const dataUrl = URL.createObjectURL(blob)
      const headerName = res.headers.get('content-disposition')
      const fileNameMatch = headerName?.match(/filename="?([^";]+)"?/)
      const fileName = fileNameMatch?.[1] || `pokedex-${new Date().toISOString().slice(0, 10)}.db`

      const link = document.createElement('a')
      link.href = dataUrl
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(dataUrl)

      toast.success('SQLite database exported')
    } catch (error) {
      toast.error('SQLite export failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setDatabaseTransferBusy(false)
    }
  }

  const handleImportSqliteClick = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.db,.sqlite,.sqlite3,application/x-sqlite3'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      setDatabaseTransferBusy(true)
      try {
        const res = await fetch('/api/db/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: file,
        })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(payload?.error || 'Import failed')
        }

        toast.success('SQLite database imported', {
          description: 'The app will reload to use the restored database.',
        })

        setTimeout(() => {
          window.location.reload()
        }, 900)
      } catch (error) {
        toast.error('SQLite import failed', {
          description: error instanceof Error ? error.message : 'Unknown error',
        })
      } finally {
        setDatabaseTransferBusy(false)
      }
    }
    input.click()
  }

  const totalQuantity = cards.reduce((sum, card) => sum + card.quantity, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Backup & Restore</DialogTitle>
          <DialogDescription>
            Export your collection to a backup file or import from a previous backup
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
              <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" weight="fill" />
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium">Current Collection</p>
                <p className="text-xs text-muted-foreground">
                  {cards.length} unique cards • {totalQuantity} total
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-base font-semibold flex items-center gap-2">
                <FileArrowDown className="w-5 h-5" />
                Export Collection
              </Label>
              <p className="text-sm text-muted-foreground">
                Download your entire collection as a JSON backup file
              </p>
              <Button
                onClick={handleExport}
                disabled={cards.length === 0}
                className="w-full"
                size="lg"
              >
                <Download className="w-5 h-5 mr-2" />
                Export to File
              </Button>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-base font-semibold flex items-center gap-2">
                <FileArrowUp className="w-5 h-5" />
                Import Collection
              </Label>
              <p className="text-sm text-muted-foreground">
                Restore your collection from a backup file
              </p>
              
              {cards.length > 0 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <Warning className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" weight="fill" />
                  <p className="text-xs text-yellow-900/80">
                    Importing will merge with your current collection. Duplicate cards will have their quantities combined.
                  </p>
                </div>
              )}

              <Button
                onClick={handleImportClick}
                disabled={importing}
                variant="outline"
                className="w-full"
                size="lg"
              >
                <Upload className="w-5 h-5 mr-2" />
                {importing ? 'Importing...' : 'Import from File'}
              </Button>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-base font-semibold flex items-center gap-2">
                <Download className="w-5 h-5" />
                SQLite Database Backup
              </Label>
              <p className="text-sm text-muted-foreground">
                Export or import the full server database file, including TCG catalog and your collection data.
              </p>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <Warning className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" weight="fill" />
                <p className="text-xs text-yellow-900/80">
                  Importing a SQLite file replaces the current server database and reloads the app.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button
                  onClick={handleExportSqlite}
                  disabled={databaseTransferBusy}
                  variant="outline"
                  size="lg"
                >
                  <Download className="w-5 h-5 mr-2" />
                  Export DB
                </Button>

                <Button
                  onClick={handleImportSqliteClick}
                  disabled={databaseTransferBusy}
                  variant="outline"
                  size="lg"
                >
                  <Upload className="w-5 h-5 mr-2" />
                  {databaseTransferBusy ? 'Working...' : 'Import DB'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
