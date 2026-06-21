import type { Meta, StoryObj } from '@storybook/react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/billzo/Card'
import { Button } from '@/components/billzo/Button'

const meta: Meta<typeof Card> = {
  title: 'Components/Card',
  component: Card,
}

export default meta
type Story = StoryObj<typeof Card>

export const Default: Story = {
  render: () => (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Optional description for the card.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-foreground">Card content goes here. This is the main body of the card.</p>
      </CardContent>
      <CardFooter>
        <Button size="sm">Save</Button>
        <Button size="sm" variant="ghost">Cancel</Button>
      </CardFooter>
    </Card>
  ),
}

export const Simple: Story = {
  render: () => (
    <Card className="max-w-sm p-5">
      <p className="text-xs text-foreground">A simple card without header/footer sections.</p>
    </Card>
  ),
}

export const WithLongContent: Story = {
  render: () => (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Project Settings</CardTitle>
        <CardDescription>Manage your project preferences and configurations.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Notifications</span>
          <span className="text-xs text-muted-foreground">Enabled</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Auto-save</span>
          <span className="text-xs text-muted-foreground">Every 30s</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Theme</span>
          <span className="text-xs text-muted-foreground">System</span>
        </div>
      </CardContent>
      <CardFooter>
        <Button size="sm">Update</Button>
      </CardFooter>
    </Card>
  ),
}

export const CardGrid: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-4">
      {['Revenue', 'Expenses', 'Profit'].map(label => (
        <Card key={label}>
          <CardHeader>
            <CardTitle>{label}</CardTitle>
            <CardDescription>Last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {label === 'Revenue' ? '$12,430' : label === 'Expenses' ? '$8,210' : '$4,220'}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  ),
}
