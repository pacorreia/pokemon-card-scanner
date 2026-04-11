import { ChangeEvent } from 'react'
import { MagnifyingGlass, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface CatalogSearchBarProps {
  value: string
  onValueChange: (value: string) => void
  placeholder: string
  className?: string
  inputClassName?: string
  showClearButton?: boolean
}

export function CatalogSearchBar({
  value,
  onValueChange,
  placeholder,
  className,
  inputClassName,
  showClearButton = true,
}: CatalogSearchBarProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onValueChange(event.target.value)
  }

  return (
    <div className={cn('relative', className)}>
      <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        className={cn(showClearButton ? 'pl-10 pr-10' : 'pl-10', inputClassName)}
      />
      {showClearButton && value && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
          onClick={() => onValueChange('')}
          aria-label="Clear search"
        >
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  )
}
