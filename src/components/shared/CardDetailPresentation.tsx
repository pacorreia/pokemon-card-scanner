import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface CardDetailPresentationProps {
  image: ReactNode
  children: ReactNode
  contentClassName?: string
}

export function CardDetailPresentation({ image, children, contentClassName }: CardDetailPresentationProps) {
  return (
    <div className={cn('px-6 py-4 pb-20 space-y-6', contentClassName)}>
      {image}
      <div className="space-y-4">{children}</div>
    </div>
  )
}
