import { Toaster as SonnerToaster } from 'sonner'

type ToasterProps = React.ComponentProps<typeof SonnerToaster>

const TOASTER_DEFAULTS = {
  richColors: true,
  closeButton: true,
  position: 'top-right' as const,
  duration: 4000,
}

export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      {...TOASTER_DEFAULTS}
      toastOptions={{
        className: 'text-sm border-border shadow-lg',
        ...props.toastOptions,
      }}
      {...props}
    />
  )
}

export { toast } from 'sonner'
