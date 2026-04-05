import type { ElementType } from 'react'
import { Camera, CardsThree, BookOpen, Database, Folders, Gear, ArrowsLeftRight } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'

interface HomeViewProps {
  cardCount: number
  isDatabaseLoaded: boolean
  onScan: () => void
  onCatalog: () => void
  onBrowseDB: () => void
  onManageDB: () => void
  onSettings: () => void
  onCollections: () => void
  onImportExport: () => void
}

interface Shortcut {
  label: string
  description: string
  Icon: ElementType
  iconBg: string
  iconColor: string
  borderHover: string
  onClick: () => void
  badge?: string
  dim?: boolean
}

export function HomeView({
  cardCount,
  isDatabaseLoaded,
  onScan,
  onCatalog,
  onBrowseDB,
  onManageDB,
  onSettings,
  onCollections,
  onImportExport,
}: HomeViewProps) {
  const shortcuts: Shortcut[] = [
    {
      label: 'Scan Cards',
      description: 'Capture or upload photos',
      Icon: Camera,
      iconBg: 'bg-amber-500/10 group-hover:bg-amber-500/20',
      iconColor: 'text-amber-500',
      borderHover: 'hover:border-amber-500/40',
      onClick: onScan,
    },
    {
      label: 'My Catalog',
      description: cardCount === 0 ? 'No cards yet' : `${cardCount} ${cardCount === 1 ? 'card' : 'cards'}`,
      Icon: CardsThree,
      iconBg: 'bg-violet-500/10 group-hover:bg-violet-500/20',
      iconColor: 'text-violet-500',
      borderHover: 'hover:border-violet-500/40',
      onClick: onCatalog,
    },
    {
      label: 'Browse DB',
      description: 'Explore TCG cards',
      Icon: BookOpen,
      iconBg: 'bg-blue-500/10 group-hover:bg-blue-500/20',
      iconColor: 'text-blue-500',
      borderHover: 'hover:border-blue-500/40',
      onClick: onBrowseDB,
    },
    {
      label: 'Database',
      description: isDatabaseLoaded ? 'Up to date' : 'Download needed',
      Icon: Database,
      iconBg: isDatabaseLoaded
        ? 'bg-emerald-500/10 group-hover:bg-emerald-500/20'
        : 'bg-orange-500/10 group-hover:bg-orange-500/20',
      iconColor: isDatabaseLoaded ? 'text-emerald-500' : 'text-orange-500',
      borderHover: isDatabaseLoaded ? 'hover:border-emerald-500/40' : 'hover:border-orange-500/40',
      onClick: onManageDB,
      badge: isDatabaseLoaded ? undefined : 'Setup needed',
    },
    {
      label: 'Collections',
      description: 'Manage card groups',
      Icon: Folders,
      iconBg: 'bg-pink-500/10 group-hover:bg-pink-500/20',
      iconColor: 'text-pink-500',
      borderHover: 'hover:border-pink-500/40',
      onClick: onCollections,
    },
    {
      label: 'Import / Export',
      description: 'Backup or restore data',
      Icon: ArrowsLeftRight,
      iconBg: 'bg-teal-500/10 group-hover:bg-teal-500/20',
      iconColor: 'text-teal-500',
      borderHover: 'hover:border-teal-500/40',
      onClick: onImportExport,
    },
    {
      label: 'Settings',
      description: 'API & preferences',
      Icon: Gear,
      iconBg: 'bg-slate-500/10 group-hover:bg-slate-500/20',
      iconColor: 'text-slate-500',
      borderHover: 'hover:border-slate-500/40',
      onClick: onSettings,
    },
  ]

  return (
    <div className="py-4">
      <div className="mb-8">
        <h1 className="text-4xl font-bold font-display tracking-tight mb-2">PokéDex Scanner</h1>
        <p className="text-muted-foreground">Your Pokémon TCG companion</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {shortcuts.map((shortcut) => (
          <button
            key={shortcut.label}
            onClick={shortcut.onClick}
            className={`flex flex-col items-start gap-4 p-5 rounded-2xl border-2 bg-card transition-all group text-left ${shortcut.borderHover} hover:bg-muted/30 hover:shadow-sm ${shortcut.dim ? 'opacity-60' : ''}`}
          >
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${shortcut.iconBg}`}>
              <shortcut.Icon className={`w-7 h-7 ${shortcut.iconColor}`} weight="duotone" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold font-display text-base leading-tight">{shortcut.label}</p>
                {shortcut.badge && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-orange-500/50 text-orange-500">
                    {shortcut.badge}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1 leading-tight">{shortcut.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
