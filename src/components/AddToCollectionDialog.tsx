import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus } from '@phosphor-icons/react'
import type { CardCollection } from '@/lib/types'
import { toast } from 'sonner'

interface AddToCollectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cardId: string
  cardName: string
  collections: CardCollection[]
  currentCollectionIds: string[]
  onToggleCollection: (collectionId: string, add: boolean) => void
  onCreateNewCollection: () => void
}

export function AddToCollectionDialog({
  open,
  onOpenChange,
  cardId: _cardId,
  cardName,
  collections,
  currentCollectionIds,
  onToggleCollection,
  onCreateNewCollection,
}: AddToCollectionDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(currentCollectionIds)
  )

  const handleToggle = (collectionId: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(collectionId)) {
        newSet.delete(collectionId)
      } else {
        newSet.add(collectionId)
      }
      return newSet
    })
  }

  const handleSave = () => {
    const currentSet = new Set(currentCollectionIds)
    
    selectedIds.forEach((id) => {
      if (!currentSet.has(id)) {
        onToggleCollection(id, true)
      }
    })

    currentSet.forEach((id) => {
      if (!selectedIds.has(id)) {
        onToggleCollection(id, false)
      }
    })

    toast.success('Collections updated')
    onOpenChange(false)
  }

  const handleCreateNew = () => {
    onOpenChange(false)
    onCreateNewCollection()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Add to Collection</DialogTitle>
          <p className="text-sm text-muted-foreground line-clamp-1">{cardName}</p>
        </DialogHeader>

        <div className="space-y-4">
          {collections.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">No collections yet</p>
              <Button onClick={handleCreateNew} variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                Create First Collection
              </Button>
            </div>
          ) : (
            <>
              <ScrollArea className="max-h-[300px] -mx-1 px-1">
                <div className="space-y-2">
                  {collections.map((collection) => (
                    <label
                      key={collection.id}
                      className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors"
                    >
                      <Checkbox
                        checked={selectedIds.has(collection.id)}
                        onCheckedChange={() => handleToggle(collection.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium leading-tight">{collection.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {collection.cardIds.length} cards
                        </div>
                      </div>
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: collection.color }}
                      />
                    </label>
                  ))}
                </div>
              </ScrollArea>

              <div className="flex gap-2 pt-2">
                <Button onClick={handleCreateNew} variant="outline" className="flex-1">
                  <Plus className="w-4 h-4 mr-2" />
                  New Collection
                </Button>
                <Button onClick={handleSave} className="flex-1">
                  Save
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
