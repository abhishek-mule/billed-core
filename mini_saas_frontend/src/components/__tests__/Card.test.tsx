import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/billzo/Card'

describe('Card', () => {
  it('renders children', () => {
    render(<Card>content</Card>)
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('has card className', () => {
    const { container } = render(<Card>card</Card>)
    expect(container.firstChild).toHaveClass('rounded-xl')
    expect(container.firstChild).toHaveClass('border-border')
    expect(container.firstChild).toHaveClass('bg-card')
  })

  it('renders full compound structure', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
        </CardHeader>
        <CardContent>Body</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    )
    expect(screen.getByText('Title')).toBeInTheDocument()
    expect(screen.getByText('Description')).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
    expect(screen.getByText('Footer')).toBeInTheDocument()
  })

  it('CardTitle renders as h3', () => {
    render(<CardTitle>Heading</CardTitle>)
    const el = screen.getByText('Heading')
    expect(el.tagName).toBe('H3')
    expect(el).toHaveClass('text-base')
    expect(el).toHaveClass('font-semibold')
  })

  it('CardFooter has border-top', () => {
    const { container } = render(<CardFooter>Actions</CardFooter>)
    expect(container.firstChild).toHaveClass('border-t')
    expect(container.firstChild).toHaveClass('border-border')
  })

  it('CardDescription has muted text', () => {
    render(<CardDescription>Helper text</CardDescription>)
    expect(screen.getByText('Helper text')).toHaveClass('text-muted-foreground')
  })
})
