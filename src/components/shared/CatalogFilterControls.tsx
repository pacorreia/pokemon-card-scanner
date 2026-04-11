import { useState, type ReactNode } from 'react'
import { CaretDown, Funnel, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'

export interface CatalogGroupOption {
  value: string
  label: string
}

export interface CatalogSortOption {
  value: string
  label: string
}

export interface CatalogFilterOption {
  id: string
  label: string
  checked: boolean
  count?: number
  onToggle: () => void
}

export interface CatalogFilterSection {
  id: string
  label: string
  options: CatalogFilterOption[]
  emptyMessage?: string
}

export interface CatalogActiveFilterChip {
  id: string
  label: string
  onRemove: () => void
}

interface CatalogFilterControlsProps {
  compact?: boolean
  summaryText?: string
  sortValue?: string
  sortOptions?: CatalogSortOption[]
  onSortChange?: (value: string) => void
  groupByValue: string
  groupOptions: CatalogGroupOption[]
  onGroupByChange: (value: string) => void
  activeFiltersCount: number
  onClearFilters: () => void
  filterSections: CatalogFilterSection[]
  activeFilterChips: CatalogActiveFilterChip[]
  dropdownWidthClassName?: string
  controlsTrailing?: ReactNode
  collapsible?: boolean
  defaultCollapsed?: boolean
}

export function CatalogFilterControls({
  compact = false,
  summaryText,
  sortValue,
  sortOptions,
  onSortChange,
  groupByValue,
  groupOptions,
  onGroupByChange,
  activeFiltersCount,
  onClearFilters,
  filterSections,
  activeFilterChips,
  dropdownWidthClassName,
  controlsTrailing,
  collapsible = true,
  defaultCollapsed = true,
}: CatalogFilterControlsProps) {
  const [isOpen, setIsOpen] = useState(!defaultCollapsed)
  const groupTriggerClass = compact
    ? 'h-8 w-[100px] text-[11px] sm:w-[140px] sm:text-xs'
    : 'h-10 w-[112px] text-xs sm:h-12 sm:w-[170px] sm:text-sm'
  const filterButtonClass = compact
    ? 'h-8 px-2.5 text-[11px] relative sm:px-3 sm:text-xs'
    : 'h-10 px-3 text-xs relative sm:h-12 sm:px-4 sm:text-sm'
  const countBadgeClass = compact
    ? 'ml-2 h-4 min-w-4 px-1 text-[10px]'
    : 'ml-1.5 h-4 min-w-4 px-1 text-[10px] sm:ml-2 sm:h-5 sm:min-w-5 sm:px-1.5 sm:flex sm:items-center sm:justify-center'
  const triggerButtonClass = compact
    ? 'h-8 px-2.5 text-[11px] sm:px-3 sm:text-xs'
    : 'h-10 px-3 text-xs sm:h-12 sm:px-4 sm:text-sm'
  const dropdownClass = dropdownWidthClassName || (compact ? 'w-64' : 'w-56')
  const iconClass = compact ? 'w-3.5 h-3.5 mr-1.5' : 'w-5 h-5 mr-2'
  const controlsRowClass = 'flex items-center flex-wrap gap-2'
  const open = collapsible ? isOpen : true

  return (
    <div className="space-y-2">
      <div className={summaryText ? 'flex items-center justify-between gap-2' : 'flex items-center gap-2'}>
        {summaryText && (
          <div className="text-xs text-muted-foreground min-w-0 truncate">{summaryText}</div>
        )}

        {collapsible && (
          <Collapsible open={open} onOpenChange={setIsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size={compact ? 'sm' : 'lg'} className={triggerButtonClass}>
                <Funnel className={iconClass} />
                Sort / Filter / Group
                {activeFiltersCount > 0 && (
                  <Badge variant="default" className={countBadgeClass}>{activeFiltersCount}</Badge>
                )}
                <CaretDown className={`ml-1.5 h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
          </Collapsible>
        )}
      </div>

      <Collapsible open={open} onOpenChange={setIsOpen}>
        <CollapsibleContent className="space-y-2">
          <div className={controlsRowClass}>
            {sortValue && sortOptions && sortOptions.length > 0 && onSortChange && (
              <Select value={sortValue} onValueChange={onSortChange}>
                <SelectTrigger className={groupTriggerClass}>
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  {sortOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={groupByValue} onValueChange={onGroupByChange}>
              <SelectTrigger className={groupTriggerClass}>
                <SelectValue placeholder="Group" />
              </SelectTrigger>
              <SelectContent>
                {groupOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size={compact ? 'sm' : 'lg'} className={filterButtonClass}>
                  <Funnel className={iconClass} />
                  Filters
                  {activeFiltersCount > 0 && (
                    <Badge variant="default" className={countBadgeClass}>{activeFiltersCount}</Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={dropdownClass}>
                {activeFiltersCount > 0 && (
                  <>
                    <div className="px-2 py-1.5">
                      <Button variant="ghost" size="sm" className="w-full justify-start text-xs h-7" onClick={onClearFilters}>
                        <X className="w-3 h-3 mr-1.5" /> Clear all filters
                      </Button>
                    </div>
                    <DropdownMenuSeparator />
                  </>
                )}

                {filterSections.map((section, sectionIndex) => (
                  <div key={section.id}>
                    {sectionIndex > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel>{section.label}</DropdownMenuLabel>
                    {section.options.length > 0 ? section.options.map(option => (
                      <DropdownMenuItem key={option.id} className="cursor-pointer" onSelect={(event) => event.preventDefault()}>
                        <label className="flex w-full items-center justify-between gap-2 text-sm cursor-pointer">
                          <div className="flex items-center gap-2 min-w-0">
                            <Checkbox checked={option.checked} onCheckedChange={option.onToggle} />
                            <span className="truncate">{option.label}</span>
                          </div>
                          {typeof option.count === 'number' && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">{option.count}</Badge>
                          )}
                        </label>
                      </DropdownMenuItem>
                    )) : (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        {section.emptyMessage || 'No options available'}
                      </div>
                    )}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {controlsTrailing}
          </div>

          {activeFilterChips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {activeFilterChips.map(chip => (
                <Badge key={chip.id} variant="secondary" className="pl-2.5 pr-1.5 py-1.5 gap-1.5">
                  <span className="text-xs font-medium">{chip.label}</span>
                  <button
                    onClick={chip.onRemove}
                    className="hover:bg-secondary-foreground/20 rounded-full p-0.5 transition-colors"
                    aria-label={`Remove ${chip.label} filter`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
