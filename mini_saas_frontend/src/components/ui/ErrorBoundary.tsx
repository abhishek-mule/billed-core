'use client'

import { Component, ReactNode, ErrorInfo } from 'react'
import { AlertCircle, RefreshCcw, Home } from 'lucide-react'
import { Button } from './Button'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center animate-fade-in">
          <div className="w-24 h-24 bg-destructive/10 text-destructive rounded-[2.5rem] flex items-center justify-center mb-8 shadow-lg shadow-destructive/10 animate-bounce-in">
            <AlertCircle className="w-12 h-12" />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-foreground mb-4 italic">
            Engine Failure
          </h1>
          <p className="text-sm text-muted-foreground mb-10 max-w-sm leading-relaxed font-bold uppercase tracking-widest opacity-60">
            {this.state.error?.message || 'A critical error disrupted the command center. We suggest refreshing the dashboard.'}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xs">
            <Button 
              variant="primary" 
              fullWidth
              size="lg"
              onClick={() => {
                this.setState({ hasError: false, error: undefined })
                window.location.reload()
              }}
              icon={<RefreshCcw className="w-4 h-4" />}
            >
              Reboot App
            </Button>
            <Button 
              variant="secondary" 
              fullWidth
              size="lg"
              onClick={() => window.location.href = '/dashboard'}
              icon={<Home className="w-4 h-4" />}
            >
              Command Center
            </Button>
          </div>
          <p className="mt-8 text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-30">
            Error ID: {Math.random().toString(36).substring(7).toUpperCase()}
          </p>
        </div>
      )
    }

    return this.props.children
  }
}