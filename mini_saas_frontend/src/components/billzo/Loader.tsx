export function Loader({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="h-6 w-6 animate-spin rounded-full border-[2.5px] border-muted-foreground/20 border-t-primary" />
    </div>
  )
}
