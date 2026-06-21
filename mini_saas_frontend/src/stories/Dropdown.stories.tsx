import type { Meta, StoryObj } from '@storybook/react'
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from '@/components/billzo/Dropdown'
import { Button } from '@/components/billzo/Button'
import { Settings, User, LogOut, Edit, Trash2, Download } from 'lucide-react'

const meta: Meta<typeof DropdownMenu> = {
  title: 'Components/Dropdown',
  component: DropdownMenu,
}

export default meta
type Story = StoryObj<typeof DropdownMenu>

export const Default: Story = {
  render: () => (
    <DropdownMenu
      trigger={<Button variant="outline">Menu</Button>}
    >
      <DropdownMenuItem icon={<User size={14} />}>Profile</DropdownMenuItem>
      <DropdownMenuItem icon={<Settings size={14} />}>Settings</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={<LogOut size={14} />}>Log out</DropdownMenuItem>
    </DropdownMenu>
  ),
}

export const WithDestructive: Story = {
  render: () => (
    <DropdownMenu
      trigger={<Button variant="danger" size="sm">Actions</Button>}
    >
      <DropdownMenuItem icon={<Edit size={14} />}>Edit</DropdownMenuItem>
      <DropdownMenuItem icon={<Download size={14} />}>Export</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={<Trash2 size={14} />} destructive>Delete</DropdownMenuItem>
    </DropdownMenu>
  ),
}

export const AlignStart: Story = {
  render: () => (
    <DropdownMenu
      trigger={<Button variant="secondary">Aligned Left</Button>}
      align="start"
    >
      <DropdownMenuItem icon={<User size={14} />}>Profile</DropdownMenuItem>
      <DropdownMenuItem icon={<Settings size={14} />}>Settings</DropdownMenuItem>
    </DropdownMenu>
  ),
}

export const InContext: Story = {
  render: () => (
    <div className="flex justify-between items-center p-4 border border-border rounded-lg max-w-sm">
      <div>
        <p className="text-sm font-medium">Project Alpha</p>
        <p className="text-xs text-muted-foreground">Last edited 2h ago</p>
      </div>
      <DropdownMenu
        trigger={<Button variant="ghost" size="sm">•••</Button>}
      >
        <DropdownMenuItem icon={<Edit size={14} />}>Rename</DropdownMenuItem>
        <DropdownMenuItem icon={<Download size={14} />}>Download</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<Trash2 size={14} />} destructive>Delete</DropdownMenuItem>
      </DropdownMenu>
    </div>
  ),
}
