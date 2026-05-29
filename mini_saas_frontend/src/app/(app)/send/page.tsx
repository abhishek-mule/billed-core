'use client'

import { Send, Construction } from 'lucide-react'

export default function SendPage() {
  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-3xl mx-auto">
      <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
        <Send className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <h2 className="mt-3 text-sm font-bold text-muted-foreground">Send</h2>
        <p className="mt-1 text-xs text-muted-foreground/60">
          Broadcast messages, payment reminders, and more — coming soon.
        </p>
      </div>
    </div>
  )
}
