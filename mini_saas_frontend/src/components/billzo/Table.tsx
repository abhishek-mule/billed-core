'use client'

import { cn } from '@/lib/utils'
import { forwardRef, type HTMLAttributes, type ThHTMLAttributes, type TdHTMLAttributes, type ReactNode } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

interface TableProps extends HTMLAttributes<HTMLTableElement> {}

export const Table = forwardRef<HTMLTableElement, TableProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className="w-full overflow-x-auto">
        <table
          ref={ref}
          className={cn('w-full text-sm', className)}
          {...props}
        >
          {children}
        </table>
      </div>
    )
  },
)
Table.displayName = 'Table'

interface TableHeaderProps extends HTMLAttributes<HTMLTableSectionElement> {}

export const TableHeader = forwardRef<HTMLTableSectionElement, TableHeaderProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <thead
        ref={ref}
        className={cn('border-b border-border bg-muted/50', className)}
        {...props}
      >
        {children}
      </thead>
    )
  },
)
TableHeader.displayName = 'TableHeader'

interface TableBodyProps extends HTMLAttributes<HTMLTableSectionElement> {}

export const TableBody = forwardRef<HTMLTableSectionElement, TableBodyProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <tbody
        ref={ref}
        className={cn('divide-y divide-border/50', className)}
        {...props}
      >
        {children}
      </tbody>
    )
  },
)
TableBody.displayName = 'TableBody'

interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {}

export const TableRow = forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <tr
        ref={ref}
        className={cn('hover:bg-muted/30 transition-colors', className)}
        {...props}
      >
        {children}
      </tr>
    )
  },
)
TableRow.displayName = 'TableRow'

interface TableHeadProps extends ThHTMLAttributes<HTMLTableCellElement> {
  sortable?: boolean
  sortDirection?: 'asc' | 'desc' | null
  onSort?: () => void
}

export const TableHead = forwardRef<HTMLTableCellElement, TableHeadProps>(
  ({ className, sortable, sortDirection, onSort, children, ...props }, ref) => {
    const content = (
      <div className="inline-flex items-center gap-1.5">
        <span>{children}</span>
        {sortable && !sortDirection && <ArrowUpDown size={12} className="shrink-0 text-muted-foreground/50" />}
        {sortDirection === 'asc' && <ArrowUp size={12} className="shrink-0 text-primary" />}
        {sortDirection === 'desc' && <ArrowDown size={12} className="shrink-0 text-primary" />}
      </div>
    )

    return (
      <th
        ref={ref}
        className={cn(
          'text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider',
          sortable && 'select-none hover:text-foreground transition-colors',
          className,
        )}
        aria-sort={sortDirection ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined}
        {...props}
      >
        {sortable ? (
          <button
            className="inline-flex items-center gap-1.5"
            onClick={onSort}
            type="button"
          >
            {content}
          </button>
        ) : (
          content
        )}
      </th>
    )
  },
)
TableHead.displayName = 'TableHead'

interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {}

export const TableCell = forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <td
        ref={ref}
        className={cn('px-4 py-3 text-xs text-foreground', className)}
        {...props}
      >
        {children}
      </td>
    )
  },
)
TableCell.displayName = 'TableCell'
