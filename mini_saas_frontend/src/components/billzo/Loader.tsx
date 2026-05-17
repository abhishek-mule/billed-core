import React from 'react'

interface LoaderProps {
  className?: string
}

export function Loader({ className = '' }: LoaderProps) {
  return (
    <span className={`loader ${className}`} />
  )
}
