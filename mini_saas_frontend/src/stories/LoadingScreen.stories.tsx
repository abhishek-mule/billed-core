import type { Meta, StoryObj } from '@storybook/react'
import { LoadingScreen } from '@/components/billzo/LoadingScreen'

const meta: Meta<typeof LoadingScreen> = {
  title: 'Components/LoadingScreen',
  component: LoadingScreen,
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj<typeof LoadingScreen>

export const Default: Story = {}
