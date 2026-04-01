import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Trash, Pencil, Folder, Star, Heart, Fire, Lightning, Sparkle, Target } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import type { CardCollection } from '@/lib/types'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface CollectionsManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  collections: CardCollection[]
  onCreateCollection: (collection: Omit<CardCollection, 'id' | 'dateCreated' | 'dateModified'>) => void
  onUpdateCollection: (id: string, updates: Partial<CardCollection>) => void
  onDeleteCollection: (id: string) => void
  onViewCollection: (collection: CardCollection) => void
}

const ICON_OPTIONS = [
  { icon: Folder, name: 'folder' },
  { icon: Star, name: 'star' },
  { icon: Heart, name: 'heart' },
  { icon: Fire, name: 'fire' },
  { icon: Lightning, name: 'lightning' },
  { icon: Sparkle, name: 'sparkle' },
  { icon: Target, name: 'target' },
]

const COLOR_OPTIONS = [
  { color: 'oklch(0.65 0.24 27)', name: 'red' },
  { color: 'oklch(0.75 0.18 60)', name: 'orange' },
  { color: 'oklch(0.85 0.15 95)', name: 'yellow' },
  { color: 'oklch(0.70 0.18 145)', name: 'green' },
  { color: 'oklch(0.65 0.20 220)', name: 'blue' },
  { color: 'oklch(0.65 0.22 285)', name: 'purple' },
  { color: 'oklch(0.70 0.18 330)', name: 'pink' },
  { color: 'oklch(0.55 0.02 250)', name: 'gray' },
]

export function CollectionsManager({
  open,
  onOpenChange,
  collections,
  onCreateCollection,
  onUpdateCollection,
  onDeleteCollection,
  onViewCollection,
}: CollectionsManagerProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: COLOR_OPTIONS[4].color,
    icon: ICON_OPTIONS[0].name,
  })

  const handleCreate = () => {
    if (!formData.name.trim()) {
      toast.error('Please enter a collection name')
      return
    }

    onCreateCollection({
      name: formData.name.trim(),
      description: formData.description.trim(),
      color: formData.color,
      icon: formData.icon,
      cardIds: [],
    })

    setFormData({
      name: '',
      description: '',
      color: COLOR_OPTIONS[4].color,
      icon: ICON_OPTIONS[0].name,
    })
    setIsCreating(false)
    toast.success('Collection created')
  }

  const handleEdit = (collection: CardCollection) => {
    setEditingId(collection.id)
    setFormData({
      name: collection.name,
      description: collection.description || '',
      color: collection.color,
      icon: collection.icon,
    })
    setIsCreating(true)
  }

  const handleUpdate = () => {
    if (!editingId || !formData.name.trim()) {
      toast.error('Please enter a collection name')
      return
    }

    onUpdateCollection(editingId, {
      name: formData.name.trim(),
      description: formData.description.trim(),
      color: formData.color,
      icon: formData.icon,
    })

    setFormData({
      name: '',
      description: '',
      color: COLOR_OPTIONS[4].color,
      icon: ICON_OPTIONS[0].name,
    })
    setEditingId(null)
    setIsCreating(false)
    toast.success('Collection updated')
  }

  const handleCancel = () => {
    setIsCreating(false)
    setEditingId(null)
    setFormData({
      name: '',
      description: '',
      color: COLOR_OPTIONS[4].color,
      icon: ICON_OPTIONS[0].name,
    })
  }

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Delete "${name}"? Cards will not be deleted, only removed from this collection.`)) {
      onDeleteCollection(id)
      toast.success('Collection deleted')
    }
  }

  const getIconComponent = (iconName: string) => {
    const iconOption = ICON_OPTIONS.find(opt => opt.name === iconName)
    return iconOption?.icon || Folder
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-2xl font-display">Collections</DialogTitle>
          <DialogDescription>
            Organize your cards by theme, purpose, or any way you like
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6 flex-1 overflow-hidden flex flex-col gap-4">
          {!isCreating ? (
            <>
              <Button onClick={() => setIsCreating(true)} className="w-full" size="lg">
                <Plus className="w-5 h-5 mr-2" />
                Create Collection
              </Button>

              <ScrollArea className="flex-1 -mx-6 px-6">
                <div className="space-y-3 pr-4">
                  <AnimatePresence mode="popLayout">
                    {collections.length === 0 ? (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="text-center py-12"
                      >
                        <Folder className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground">No collections yet</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Create your first collection to get started
                        </p>
                      </motion.div>
                    ) : (
                      collections.map((collection) => {
                        const IconComponent = getIconComponent(collection.icon)
                        return (
                          <motion.div
                            key={collection.id}
                            layout
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="group relative rounded-xl border bg-card p-4 hover:shadow-md transition-all cursor-pointer"
                            onClick={() => onViewCollection(collection)}
                            style={{
                              borderColor: collection.color,
                              borderWidth: 2,
                            }}
                          >
                            <div className="flex items-start gap-4">
                              <div
                                className="shrink-0 w-12 h-12 rounded-lg flex items-center justify-center"
                                style={{ backgroundColor: collection.color + '20' }}
                              >
                                <IconComponent
                                  className="w-6 h-6"
                                  style={{ color: collection.color }}
                                  weight="duotone"
                                />
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <h3 className="font-display font-semibold text-lg leading-tight">
                                    {collection.name}
                                  </h3>
                                  <Badge variant="secondary" className="shrink-0">
                                    {collection.cardIds.length}
                                  </Badge>
                                </div>
                                {collection.description && (
                                  <p className="text-sm text-muted-foreground line-clamp-2">
                                    {collection.description}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 bg-background/80 backdrop-blur-sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleEdit(collection)
                                }}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 bg-background/80 backdrop-blur-sm text-destructive hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDelete(collection.id, collection.name)
                                }}
                              >
                                <Trash className="w-4 h-4" />
                              </Button>
                            </div>
                          </motion.div>
                        )
                      })
                    )}
                  </AnimatePresence>
                </div>
              </ScrollArea>
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div>
                <label className="text-sm font-medium mb-2 block">Collection Name</label>
                <Input
                  placeholder="e.g., Favorites, Fire Types, For Trade"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  autoFocus
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Description (Optional)</label>
                <Textarea
                  placeholder="Add a description for this collection..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-3 block">Icon</label>
                <div className="grid grid-cols-7 gap-2">
                  {ICON_OPTIONS.map((option) => {
                    const IconComponent = option.icon
                    return (
                      <button
                        key={option.name}
                        onClick={() => setFormData({ ...formData, icon: option.name })}
                        className={cn(
                          'aspect-square rounded-lg border-2 flex items-center justify-center transition-all hover:scale-105',
                          formData.icon === option.name
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                        )}
                      >
                        <IconComponent
                          className="w-6 h-6"
                          weight={formData.icon === option.name ? 'duotone' : 'regular'}
                        />
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-3 block">Color</label>
                <div className="grid grid-cols-8 gap-2">
                  {COLOR_OPTIONS.map((option) => (
                    <button
                      key={option.name}
                      onClick={() => setFormData({ ...formData, color: option.color })}
                      className={cn(
                        'aspect-square rounded-lg border-2 transition-all hover:scale-105',
                        formData.color === option.color
                          ? 'border-foreground scale-105'
                          : 'border-transparent'
                      )}
                      style={{ backgroundColor: option.color }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={handleCancel} variant="outline" className="flex-1">
                  Cancel
                </Button>
                <Button
                  onClick={editingId ? handleUpdate : handleCreate}
                  className="flex-1"
                >
                  {editingId ? 'Update' : 'Create'}
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
