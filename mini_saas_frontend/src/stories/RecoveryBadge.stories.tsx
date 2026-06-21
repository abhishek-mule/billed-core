import type { Meta, StoryObj } from '@storybook/react'
import { RecoveryBadge } from '@/components/billzo/RecoveryBadge'

const meta: Meta<typeof RecoveryBadge> = {
  title: 'Components/RecoveryBadge',
  component: RecoveryBadge,
}

export default meta
type Story = StoryObj<typeof RecoveryBadge>

export const Recovered: Story = {
  args: { recoveredAmount: 15000 },
}

export const WithAttribution: Story = {
  args: { recoveredAmount: 25000, attributionType: 'billzo_reminder', confidenceScore: 0.95 },
}

export const Zero: Story = {
  args: { recoveredAmount: 0 },
}

export const SmallAmount: Story = {
  args: { recoveredAmount: 500 },
}
