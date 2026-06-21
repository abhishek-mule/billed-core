import type { Meta, StoryObj } from '@storybook/react'
import { Loader } from '@/components/billzo/Loader'

const meta: Meta<typeof Loader> = {
  title: 'Components/Loader',
  component: Loader,
}

export default meta
type Story = StoryObj<typeof Loader>

export const Default: Story = {}

export const InContainer: Story = {
  render: () => (
    <div className="h-40 rounded-xl border border-border bg-card flex items-center justify-center">
      <Loader />
    </div>
  ),
}

export const CustomClass: Story = {
  args: { className: 'h-20' },
  render: (args) => (
    <div className="h-40 rounded-xl border border-border bg-card flex items-center justify-center">
      <Loader {...args} />
    </div>
  ),
}
