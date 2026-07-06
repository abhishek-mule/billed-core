import type { UpcomingReminder } from '@billzo/shared'

export const loadUpcomingReminders: () => Promise<UpcomingReminder[]> = async () => {
  const res = await fetch('/api/recovery/upcoming', { credentials: 'include' })
  if (!res.ok) return []
  const data = await res.json()
  return data.reminders || []
}