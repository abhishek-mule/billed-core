'use client'

import { useEffect, useState, useRef, useCallback } from 'react'

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

interface UseRealtimeEventsOptions {
  endpoint: string
  onMessage: (data: any) => void
  onError?: (error: Event) => void
  reconnectAttempts?: number
  reconnectInterval?: number
  fallbackRefetch?: () => void
}

export function useRealtimeEvents({
  endpoint,
  onMessage,
  onError,
  reconnectAttempts = 5,
  reconnectInterval = 3000,
  fallbackRefetch,
}: UseRealtimeEventsOptions) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectCountRef = useRef(0)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const fallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const es = new EventSource(endpoint)
    eventSourceRef.current = es

    es.onopen = () => {
      console.log('[SSE] Connected')
      setStatus('connected')
      reconnectCountRef.current = 0
      
      if (fallbackTimeoutRef.current) {
        clearTimeout(fallbackTimeoutRef.current)
        fallbackTimeoutRef.current = null
      }
    }

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        onMessage(data)
      } catch (error) {
        console.error('[SSE] Parse error:', error)
      }
    }

    es.onerror = (error) => {
      console.error('[SSE] Connection error:', error)
      es.close()
      
      setStatus('disconnected')
      onError?.(error)

      if (reconnectCountRef.current < reconnectAttempts) {
        setStatus('reconnecting')
        const delay = reconnectInterval * Math.pow(1.5, reconnectCountRef.current)
        console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${reconnectCountRef.current + 1})`)
        
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectCountRef.current++
          connect()
        }, delay)
      } else {
        console.error('[SSE] Max reconnection attempts reached')
        
        if (fallbackRefetch) {
          console.log('[SSE] Triggering fallback refetch')
          fallbackRefetch()
          
          fallbackTimeoutRef.current = setInterval(() => {
            console.log('[SSE] Fallback refetch triggered')
            fallbackRefetch()
          }, 30000)
        }
      }
    }
  }, [endpoint, onMessage, onError, reconnectAttempts, reconnectInterval, fallbackRefetch])

  const reconnect = useCallback(() => {
    reconnectCountRef.current = 0
    connect()
  }, [connect])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    if (fallbackTimeoutRef.current) {
      clearInterval(fallbackTimeoutRef.current)
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setStatus('disconnected')
  }, [])

  useEffect(() => {
    connect()

    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  return {
    status,
    reconnect,
    disconnect,
    isConnected: status === 'connected',
    isReconnecting: status === 'reconnecting',
  }
}