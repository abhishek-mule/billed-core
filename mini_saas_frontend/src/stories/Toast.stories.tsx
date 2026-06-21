import type { Meta, StoryObj } from '@storybook/react'
import { Toaster, toast } from '@/components/billzo/Toast'
import { Button } from '@/components/billzo/Button'

const meta: Meta<typeof Toaster> = {
  title: 'Components/Toast',
  component: Toaster,
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj<typeof Toaster>

export const Default: Story = {
  render: () => (
    <>
      <Toaster />
      <div className="flex flex-wrap gap-3 p-8">
        <Button onClick={() => toast.success('Saved successfully!')}>Success</Button>
        <Button variant="danger" onClick={() => toast.error('Something went wrong.')}>Error</Button>
        <Button variant="secondary" onClick={() => toast('This is a default toast.')}>Default</Button>
      </div>
    </>
  ),
}

export const WithDescriptions: Story = {
  render: () => (
    <>
      <Toaster />
      <div className="flex flex-wrap gap-3 p-8">
        <Button onClick={() => toast.success('Payment received', { description: '$1,200 from Acme Corp' })}>
          Payment Toast
        </Button>
        <Button variant="danger" onClick={() => toast.error('Upload failed', { description: 'File exceeds 10MB limit.' })}>
          Error Toast
        </Button>
        <Button variant="secondary" onClick={() => toast('Profile updated', { description: 'Your changes have been saved.' })}>
          Update Toast
        </Button>
      </div>
    </>
  ),
}

export const CustomDuration: Story = {
  render: () => (
    <>
      <Toaster />
      <div className="flex flex-wrap gap-3 p-8">
        <Button onClick={() => toast.success('Quick toast', { duration: 1500 })}>1.5s</Button>
        <Button onClick={() => toast('Persistent toast', { duration: Infinity })}>Persistent</Button>
        <Button variant="secondary" onClick={() => toast('Promise loading...', { duration: 3000 })}>3s</Button>
      </div>
    </>
  ),
}
