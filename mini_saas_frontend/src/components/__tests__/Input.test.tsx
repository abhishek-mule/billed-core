import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Input } from '@/components/billzo/Input'
import { Search } from 'lucide-react'

describe('Input', () => {
  it('renders with label', () => {
    render(<Input label="Email" />)
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('renders placeholder', () => {
    render(<Input placeholder="you@example.com" />)
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
  })

  it('shows error message', () => {
    render(<Input label="Email" error="Invalid email" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email')
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
  })

  it('renders icon on the left', () => {
    const { container } = render(<Input icon={<Search data-testid="icon" />} />)
    expect(container.querySelector('.pointer-events-none')).toBeInTheDocument()
  })

  it('forwards ref', () => {
    const ref = { current: null }
    render(<Input ref={ref} />)
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })

  it('calls onChange handler', () => {
    const fn = vi.fn()
    render(<Input onChange={fn} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'test' } })
    expect(fn).toHaveBeenCalled()
  })

  it('applies disabled state', () => {
    render(<Input disabled />)
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('applies sm size class', () => {
    render(<Input size="sm" label="Name" />)
    expect(screen.getByRole('textbox').className).toContain('h-9')
  })

  it('applies md size class by default', () => {
    render(<Input label="Name" />)
    expect(screen.getByRole('textbox').className).toContain('h-11')
  })
})
