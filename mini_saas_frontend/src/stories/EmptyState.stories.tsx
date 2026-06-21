import type { Meta, StoryObj } from '@storybook/react'
import { EmptyState } from '@/components/billzo/EmptyState'
import { Button } from '@/components/billzo/Button'
import { Inbox, Search, PackageOpen, FileSearch } from 'lucide-react'

const meta: Meta<typeof EmptyState> = {
  title: 'Components/EmptyState',
  component: EmptyState,
}

export default meta
type Story = StoryObj<typeof EmptyState>

export const Default: Story = {
  args: {
    icon: <Inbox size={24} />,
    title: 'No items yet',
    description: 'Get started by creating your first item.',
    action: <Button size="sm">Create Item</Button>,
  },
}

export const NoResults: Story = {
  args: {
    icon: <Search size={24} />,
    title: 'No results found',
    description: 'Try adjusting your search or filters to find what you are looking for.',
  },
}

export const NoAction: Story = {
  args: {
    icon: <PackageOpen size={24} />,
    title: 'Nothing here',
    description: 'This section is empty and there is no action to take.',
  },
}

export const CustomAction: Story = {
  args: {
    icon: <FileSearch size={24} />,
    title: 'No invoices',
    description: 'Invoices will appear here once they are generated.',
    action: (
      <div className="flex gap-2">
        <Button size="sm">Generate Invoice</Button>
        <Button size="sm" variant="ghost">Learn More</Button>
      </div>
    ),
  },
}
