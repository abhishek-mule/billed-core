'use client'

import { DeprecatedRoute } from '@/components/billzo/DeprecatedRoute'

export default function WorkQueuePage() {
  return <DeprecatedRoute redirect="/recovery/queue" message="/recovery/work is deprecated — use /recovery/queue" />
}
