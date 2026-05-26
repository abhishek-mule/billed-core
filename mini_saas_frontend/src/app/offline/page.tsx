import { WifiOff } from 'lucide-react'

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-amber-100 text-amber-700">
        <WifiOff className="h-8 w-8" />
      </div>
      <h1 className="mt-5 text-xl font-black">You're offline</h1>
      <p className="mt-2 text-sm text-muted-foreground max-w-xs">
        BillZo will keep working — your changes will sync automatically when you're back online.
      </p>
    </div>
  )
}
