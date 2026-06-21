import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/billzo/Table'

const meta: Meta<typeof Table> = {
  title: 'Components/Table',
  component: Table,
}

export default meta
type Story = StoryObj<typeof Table>

const invoices = [
  { id: 'INV-001', client: 'Acme Corp', amount: '$1,200', status: 'Paid' },
  { id: 'INV-002', client: 'Globex Inc', amount: '$850', status: 'Pending' },
  { id: 'INV-003', client: 'Initech', amount: '$2,400', status: 'Overdue' },
  { id: 'INV-004', client: 'Umbrella Co', amount: '$620', status: 'Paid' },
  { id: 'INV-005', client: 'Cyberdyne', amount: '$3,100', status: 'Pending' },
]

export const Default: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
          <TableHead>Client</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map(inv => (
          <TableRow key={inv.id}>
            <TableCell>{inv.id}</TableCell>
            <TableCell>{inv.client}</TableCell>
            <TableCell>{inv.amount}</TableCell>
            <TableCell>{inv.status}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
}

export const Sortable: Story = {
  render: () => {
    const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' | null }>({ key: '', dir: null })

    const toggleSort = (key: string) => {
      setSort(prev => ({
        key,
        dir: prev.key === key ? (prev.dir === 'asc' ? 'desc' : prev.dir === 'desc' ? null : 'asc') : 'asc',
      }))
    }

    const sorted = [...invoices].sort((a, b) => {
      if (!sort.dir || !sort.key) return 0
      const aVal = a[sort.key as keyof typeof a]
      const bVal = b[sort.key as keyof typeof b]
      return sort.dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    })

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead sortable sortDirection={sort.key === 'id' ? sort.dir : null} onSort={() => toggleSort('id')}>Invoice</TableHead>
            <TableHead sortable sortDirection={sort.key === 'client' ? sort.dir : null} onSort={() => toggleSort('client')}>Client</TableHead>
            <TableHead sortable sortDirection={sort.key === 'amount' ? sort.dir : null} onSort={() => toggleSort('amount')}>Amount</TableHead>
            <TableHead sortable sortDirection={sort.key === 'status' ? sort.dir : null} onSort={() => toggleSort('status')}>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map(inv => (
            <TableRow key={inv.id}>
              <TableCell>{inv.id}</TableCell>
              <TableCell>{inv.client}</TableCell>
              <TableCell>{inv.amount}</TableCell>
              <TableCell>
                <span className={inv.status === 'Paid' ? 'text-success' : inv.status === 'Overdue' ? 'text-destructive' : 'text-warning'}>
                  {inv.status}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  },
}

export const Empty: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Role</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell colSpan={2} className="text-center text-muted-foreground py-8">No users found.</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
}
