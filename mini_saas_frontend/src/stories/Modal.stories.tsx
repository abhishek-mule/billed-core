import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Modal } from '@/components/billzo/Modal'
import { Button } from '@/components/billzo/Button'
import { Input } from '@/components/billzo/Input'

const meta: Meta<typeof Modal> = {
  title: 'Components/Modal',
  component: Modal,
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl', 'fullscreen'],
    },
    showClose: { control: 'boolean' },
  },
}

export default meta
type Story = StoryObj<typeof Modal>

export const Default: Story = {
  render: args => {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Modal</Button>
        <Modal {...args} open={open} onClose={() => setOpen(false)} title="Modal Title" description="This is a modal description.">
          <p className="text-xs text-foreground">Modal body content goes here. You can put any React content inside.</p>
        </Modal>
      </>
    )
  },
}

export const Small: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button onClick={() => setOpen(true)} size="sm">Open Small Modal</Button>
        <Modal open={open} onClose={() => setOpen(false)} size="sm" title="Confirm" description="Are you sure?">
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant="danger" onClick={() => setOpen(false)}>Delete</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </Modal>
      </>
    )
  },
}

export const Large: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button onClick={() => setOpen(true)} variant="secondary">Open Large Modal</Button>
        <Modal open={open} onClose={() => setOpen(false)} size="lg" title="Edit Profile">
          <div className="space-y-4 mt-2">
            <Input label="Name" placeholder="John Doe" />
            <Input label="Email" placeholder="john@example.com" />
            <Input label="Bio" placeholder="Short bio…" />
          </div>
          <div className="flex gap-2 mt-6 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => setOpen(false)}>Save</Button>
          </div>
        </Modal>
      </>
    )
  },
}

export const Fullscreen: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button onClick={() => setOpen(true)} variant="outline">Fullscreen</Button>
        <Modal open={open} onClose={() => setOpen(false)} size="fullscreen" title="Fullscreen Modal">
          <p className="text-xs text-foreground">This modal takes up most of the viewport.</p>
        </Modal>
      </>
    )
  },
}
