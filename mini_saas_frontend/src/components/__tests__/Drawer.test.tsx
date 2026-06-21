import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Drawer } from '@/components/billzo/Drawer'

describe('Drawer', () => {
  it('renders nothing useful when closed', () => {
    const { container } = render(<Drawer open={false} onClose={vi.fn()}>content</Drawer>)
    const drawer = container.querySelector('[role="dialog"]')
    expect(drawer?.className).toContain('translate-x-full')
  })

  it('renders content when open', () => {
    render(<Drawer open={true} onClose={vi.fn()}>panel content</Drawer>)
    expect(screen.getByText('panel content')).toBeInTheDocument()
  })

  it('renders title and description', () => {
    render(<Drawer open={true} onClose={vi.fn()} title="Settings" description="Manage preferences">body</Drawer>)
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Manage preferences')).toBeInTheDocument()
  })

  it('calls onClose when close button clicked', () => {
    const fn = vi.fn()
    render(<Drawer open={true} onClose={fn}>content</Drawer>)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(fn).toHaveBeenCalledOnce()
  })

  it('calls onClose on Escape', () => {
    const fn = vi.fn()
    render(<Drawer open={true} onClose={fn}>content</Drawer>)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(fn).toHaveBeenCalledOnce()
  })

  it('applies size class', () => {
    const { container } = render(<Drawer open={true} onClose={vi.fn()} size="lg">c</Drawer>)
    expect(container.querySelector('.max-w-lg')).toBeInTheDocument()
  })

  it('locks body scroll when open', () => {
    const { rerender } = render(<Drawer open={true} onClose={vi.fn()}>c</Drawer>)
    expect(document.body.style.overflow).toBe('hidden')
    rerender(<Drawer open={false} onClose={vi.fn()}>c</Drawer>)
    expect(document.body.style.overflow).toBe('')
  })
})
