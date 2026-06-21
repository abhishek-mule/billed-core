import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Drawer } from '@/components/billzo/Drawer'
import { Button } from '@/components/billzo/Button'
import { Input } from '@/components/billzo/Input'

const meta: Meta<typeof Drawer> = {
  title: 'Components/Drawer',
  component: Drawer,
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl'],
    },
    showClose: { control: 'boolean' },
  },
}

export default meta
type Story = StoryObj<typeof Drawer>

export const Default: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Drawer</Button>
        <Drawer open={open} onClose={() => setOpen(false)} title="Drawer Title" description="Slide-in panel description.">
          <div className="p-5 space-y-4">
            <p className="text-xs text-foreground">Drawer content goes here. This panel slides in from the right.</p>
            <Button size="sm" onClick={() => setOpen(false)}>Close</Button>
          </div>
        </Drawer>
      </>
    )
  },
}

export const WithForm: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button onClick={() => setOpen(true)} variant="secondary">Edit Details</Button>
        <Drawer open={open} onClose={() => setOpen(false)} size="lg" title="Edit Details">
          <div className="p-5 space-y-4">
            <Input label="Full Name" placeholder="Jane Smith" />
            <Input label="Email" placeholder="jane@example.com" />
            <Input label="Phone" placeholder="+1 555-0000" />
            <div className="flex gap-2 pt-4">
              <Button onClick={() => setOpen(false)}>Save</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </div>
        </Drawer>
      </>
    )
  },
}

export const Small: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button onClick={() => setOpen(true)} size="sm" variant="outline">Quick View</Button>
        <Drawer open={open} onClose={() => setOpen(false)} size="sm" title="Quick View">
          <div className="p-5">
            <p className="text-xs text-foreground">Compact side panel for quick actions.</p>
          </div>
        </Drawer>
      </>
    )
  },
}
