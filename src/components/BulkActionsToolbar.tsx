import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Minus, Trash, X, CheckSquare } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useState } from 'react'

interface BulkActionsToolbarProps {
  selectedCount: number
  totalCount: number
  onCancel: () => void
  onSelectAll: () => void
  onIncreaseQuantity: () => void
  onDecreaseQuantity: () => void
  onDelete: () => void
}

export function BulkActionsToolbar({
  selectedCount,
  totalCount,
  onCancel,
  onSelectAll,
  onIncreaseQuantity,
  onDecreaseQuantity,
  onDelete,
}: BulkActionsToolbarProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true)
  }

  const confirmDelete = () => {
    setDeleteDialogOpen(false)
    onDelete()
  }

  return (
    <>
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -100, opacity: 0 }}
        className="fixed top-0 left-0 right-0 z-50 bg-primary text-primary-foreground shadow-2xl"
      >
        <div className="container mx-auto px-4 py-4 max-w-7xl">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={onCancel}
                className="text-primary-foreground hover:bg-primary-foreground/20 shrink-0"
              >
                <X className="w-5 h-5" weight="bold" />
              </Button>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-base px-3 py-1.5 font-display font-bold">
                  {selectedCount}
                </Badge>
                <span className="font-display font-semibold text-lg">
                  {selectedCount === 1 ? 'card selected' : 'cards selected'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {selectedCount < totalCount && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSelectAll}
                  className="text-primary-foreground hover:bg-primary-foreground/20"
                >
                  <CheckSquare className="w-4 h-4 mr-2" weight="bold" />
                  Select All
                </Button>
              )}
              <div className="h-6 w-px bg-primary-foreground/30" />
              <Button
                variant="ghost"
                size="sm"
                onClick={onIncreaseQuantity}
                className="text-primary-foreground hover:bg-primary-foreground/20"
              >
                <Plus className="w-4 h-4 mr-2" weight="bold" />
                Increase
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onDecreaseQuantity}
                className="text-primary-foreground hover:bg-primary-foreground/20"
              >
                <Minus className="w-4 h-4 mr-2" weight="bold" />
                Decrease
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeleteClick}
                className="text-destructive-foreground bg-destructive/20 hover:bg-destructive hover:text-destructive-foreground"
              >
                <Trash className="w-4 h-4 mr-2" weight="bold" />
                Delete
              </Button>
            </div>
          </div>
        </div>
      </motion.div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} {selectedCount === 1 ? 'card' : 'cards'}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {selectedCount === 1 ? 'this card' : 'these cards'} from your collection. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
