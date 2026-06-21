import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Modal } from '@/components/billzo/Modal'

describe('Modal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<Modal open={false} onClose={vi.fn()}>content</Modal>)
    expect(container.innerHTML).toBe('')
  })

  it('renders content when open', () => {
    render(<Modal open={true} onClose={vi.fn()}>Hello</Modal>)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('renders title and description', () => {
    render(<Modal open={true} onClose={vi.fn()} title="Confirm" description="Are you sure?">body</Modal>)
    expect(screen.getByText('Confirm')).toBeInTheDocument()
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
  })

  it('calls onClose when close button clicked', () => {
    const fn = vi.fn()
    render(<Modal open={true} onClose={fn}>content</Modal>)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(fn).toHaveBeenCalledOnce()
  })

  it('calls onClose when overlay clicked', () => {
    const fn = vi.fn()
    render(<Modal open={true} onClose={fn}>content</Modal>)
    const overlay = document.querySelector('[aria-hidden="true"]')
    fireEvent.click(overlay!)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('calls onClose on Escape', () => {
    const fn = vi.fn()
    render(<Modal open={true} onClose={fn}>content</Modal>)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(fn).toHaveBeenCalledOnce()
  })

  it('sets aria-modal and role', () => {
    render(<Modal open={true} onClose={vi.fn()} title="Test">c</Modal>)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('applies size class', () => {
    const { container } = render(<Modal open={true} onClose={vi.fn()} size="sm">c</Modal>)
    expect(container.querySelector('.max-w-sm')).toBeInTheDocument()
  })

  it('locks body scroll when open', () => {
    const { rerender } = render(<Modal open={true} onClose={vi.fn()}>c</Modal>)
    expect(document.body.style.overflow).toBe('hidden')
    rerender(<Modal open={false} onClose={vi.fn()}>c</Modal>)
    expect(document.body.style.overflow).toBe('')
  })
})
