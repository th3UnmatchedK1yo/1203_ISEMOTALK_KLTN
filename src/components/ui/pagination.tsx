import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'
import { forwardRef } from 'react'

export const Pagination = ({ className, ...props }: React.ComponentProps<'nav'>) => (
  <nav
    role="navigation"
    aria-label="pagination"
    className={cn('mx-auto flex w-full justify-center', className)}
    {...props}
  />
)
Pagination.displayName = 'Pagination'

export const PaginationContent = forwardRef<HTMLUListElement, React.ComponentProps<'ul'>>(
  ({ className, ...props }, ref) => (
    <ul ref={ref} className={cn('flex flex-row items-center gap-1', className)} {...props} />
  )
)
PaginationContent.displayName = 'PaginationContent'

export const PaginationItem = forwardRef<HTMLLIElement, React.ComponentProps<'li'>>(
  ({ className, ...props }, ref) => <li ref={ref} className={cn('', className)} {...props} />
)
PaginationItem.displayName = 'PaginationItem'

export const PaginationLink = ({ className, isActive, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { isActive?: boolean }) => (
  <a
    aria-current={isActive ? 'page' : undefined}
    className={cn(
      'flex h-9 w-9 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
      isActive && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
      className
    )}
    {...props}
  />
)
PaginationLink.displayName = 'PaginationLink'

export const PaginationPrevious = ({ className, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
  <PaginationLink
    aria-label="Go to previous page"
    className={cn('gap-1 pl-2.5', className)}
    {...props}
  >
    <ChevronLeft className="h-4 w-4" />
    <span>Previous</span>
  </PaginationLink>
)
PaginationPrevious.displayName = 'PaginationPrevious'

export const PaginationNext = ({ className, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
  <PaginationLink
    aria-label="Go to next page"
    className={cn('gap-1 pr-2.5', className)}
    {...props}
  >
    <span>Next</span>
    <ChevronRight className="h-4 w-4" />
  </PaginationLink>
)
PaginationNext.displayName = 'PaginationNext'

export const PaginationEllipsis = ({ className, ...props }: React.ComponentProps<'span'>) => (
  <span
    aria-hidden
    className={cn('flex h-9 w-9 items-center justify-center', className)}
    {...props}
  >
    <MoreHorizontal className="h-4 w-4" />
    <span className="sr-only">More pages</span>
  </span>
)
PaginationEllipsis.displayName = 'PaginationEllipsis'
