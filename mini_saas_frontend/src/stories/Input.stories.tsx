import type { Meta, StoryObj } from '@storybook/react'
import { Input } from '@/components/billzo/Input'
import { Search, Eye, EyeOff } from 'lucide-react'

const meta: Meta<typeof Input> = {
  title: 'Components/Input',
  component: Input,
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'error'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md'],
    },
    disabled: { control: 'boolean' },
    placeholder: { control: 'text' },
    label: { control: 'text' },
    error: { control: 'text' },
  },
}

export default meta
type Story = StoryObj<typeof Input>

export const Default: Story = {
  args: { placeholder: 'Enter text…' },
}

export const WithLabel: Story = {
  args: { label: 'Email', placeholder: 'you@example.com' },
}

export const WithError: Story = {
  args: { label: 'Password', type: 'password', error: 'Must be at least 8 characters', value: 'abc' },
}

export const WithIcon: Story = {
  args: { icon: <Search size={16} />, placeholder: 'Search…' },
}

export const WithRightIcon: Story = {
  args: { type: 'password', placeholder: 'Password', rightIcon: <EyeOff size={16} /> },
}

export const Small: Story = {
  args: { size: 'sm', placeholder: 'Small input' },
}

export const Disabled: Story = {
  args: { disabled: true, placeholder: 'Disabled input', label: 'Read Only' },
}

export const Variants: Story = {
  render: () => (
    <div className="flex flex-col gap-4 max-w-sm">
      <Input placeholder="Default input" />
      <Input placeholder="With left icon" icon={<Search size={16} />} />
      <Input placeholder="With right icon" rightIcon={<Eye size={16} />} />
      <Input placeholder="Error state" error="Something went wrong" />
      <Input size="sm" placeholder="Small size" />
    </div>
  ),
}
