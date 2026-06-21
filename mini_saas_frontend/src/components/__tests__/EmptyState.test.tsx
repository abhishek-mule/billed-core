import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState } from '@/components/billzo/EmptyState'
import { Inbox } from 'lucide-react'

describe('EmptyState', () => {
  it('renders title and icon', () => {
    render(<EmptyState icon={<Inbox data-testid="inbox-icon" />} title="No data" />)
    expect(screen.getByText('No data')).toBeInTheDocument()
    expect(screen.getByTestId('inbox-icon')).toBeInTheDocument()
  })

  it('renders description when provided', () => {
    render(<EmptyState icon={<Inbox />} title="Empty" description="Nothing to show yet" />)
    expect(screen.getByText('Nothing to show yet')).toBeInTheDocument()
  })

  it('renders action button when provided', () => {
    render(<EmptyState icon={<Inbox />} title="Empty" action={<button>Create</button>} />)
    expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
  })

  it('has dashed border', () => {
    const { container } = render(<EmptyState icon={<Inbox />} title="Empty" />)
    expect(container.firstChild).toHaveClass('border-dashed')
    expect(container.firstChild).toHaveClass('rounded-2xl')
  })

  it('does not render description or action when omitted', () => {
    const { container } = render(<EmptyState icon={<Inbox />} title="Empty" />)
    expect(container.querySelector('.max-w-xs')).toBeNull()
  })
})
