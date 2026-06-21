export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
      <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-muted-foreground/10 border-t-primary" />
      <p className="mt-4 text-xs font-medium text-muted-foreground animate-pulse">Loading BillZo...</p>
    </div>
  )
}
