import Image from 'next/image'
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 bg-white">
      <Image
        src="/error_page.png"
        alt="404 Not Found"
        width={320}
        height={320}
        className="w-64 h-64 object-contain mb-6"
        priority
      />
      <h1 className="text-xl font-black text-foreground">404 — Page not found</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground text-center max-w-xs">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
      >
        Go to Dashboard
      </Link>
    </div>
  )
}
