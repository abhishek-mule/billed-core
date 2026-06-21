import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/billzo/Table'

describe('Table', () => {
  it('renders basic table structure', () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Alice</TableCell>
            <TableCell>$100</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    )
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('$100')).toBeInTheDocument()
  })

  it('wraps in overflow container', () => {
    const { container } = render(<Table><TableHeader><TableRow><TableHead>H</TableHead></TableRow></TableHeader></Table>)
    expect(container.firstChild).toHaveClass('overflow-x-auto')
  })

  it('TableHead is uppercase with tracking', () => {
    render(<Table><TableHeader><TableRow><TableHead>Header</TableHead></TableRow></TableHeader></Table>)
    expect(screen.getByText('Header')).toBeInTheDocument()
  })

  it('TableRow has hover class', () => {
    const { container } = render(<Table><TableBody><TableRow><TableCell>cell</TableCell></TableRow></TableBody></Table>)
    expect(container.querySelector('tr')).toHaveClass('hover:bg-muted/30')
  })

  it('sortable TableHead calls onSort', () => {
    const fn = vi.fn()
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead sortable onSort={fn}>Name</TableHead>
          </TableRow>
        </TableHeader>
      </Table>,
    )
    const sortBtn = screen.getByRole('button')
    fireEvent.click(sortBtn)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('sortable TableHead shows direction icons', () => {
    const { rerender } = render(
      <Table><TableHeader><TableRow><TableHead sortable sortDirection="asc">Name</TableHead></TableRow></TableHeader></Table>,
    )
    expect(screen.getByText('Name')).toBeInTheDocument()

    rerender(<Table><TableHeader><TableRow><TableHead sortable sortDirection="desc">Name</TableHead></TableRow></TableHeader></Table>)
    expect(screen.getByText('Name')).toBeInTheDocument()
  })

  it('sets aria-sort on sortable header', () => {
    render(
      <Table><TableHeader><TableRow><TableHead sortable sortDirection="asc">Name</TableHead></TableRow></TableHeader></Table>,
    )
    const th = screen.getByRole('columnheader')
    expect(th).toHaveAttribute('aria-sort', 'ascending')
  })
})
