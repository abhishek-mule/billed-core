import { SearchX } from 'lucide-react'
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-yellow-50">
        <SearchX className="h-8 w-8 text-yellow-500" />
      </div>
      <div className="text-center">
        <div className="text-lg font-bold text-foreground">Page not found</div>
        <div className="mt-1 text-sm text-muted-foreground">The page you are looking for does not exist</div>
      </div>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
      >
        Go to Dashboard
      </Link>
    </div>
  )
}
