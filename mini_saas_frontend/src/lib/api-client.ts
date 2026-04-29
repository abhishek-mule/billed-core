/**
 * BillZo — Centralized API Client
 * Provides: typed errors, 8s timeout, 3x exponential-backoff retry,
 * AbortController support, and consistent JSON parsing.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly detail?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** True for transient errors that are safe to retry */
  get isRetryable(): boolean {
    return [408, 429, 500, 502, 503, 504].includes(this.status)
  }

  /** User-friendly message */
  get userMessage(): string {
    if (this.status === 401) return 'Session expired. Please log in again.'
    if (this.status === 403) return 'You do not have permission to do this.'
    if (this.status === 404) return 'The requested resource was not found.'
    if (this.status === 409) return 'A conflict occurred. Please refresh and try again.'
    if (this.status === 429) return 'Too many requests. Please wait a moment.'
    if (this.status >= 500) return 'Server error. We are looking into it.'
    return this.message || 'An unexpected error occurred.'
  }
}

export class NetworkError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'NetworkError'
  }
  get userMessage() {
    return 'Network error. Please check your connection.'
  }
}

interface FetchOptions extends Omit<RequestInit, 'signal'> {
  /** Timeout in ms (default 8000) */
  timeout?: number
  /** Max retry attempts for retryable errors (default 2) */
  maxRetries?: number
  /** External AbortController to cancel the request */
  signal?: AbortSignal
}

const DEFAULT_TIMEOUT = 8_000
const DEFAULT_MAX_RETRIES = 2

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Core fetch wrapper with timeout, retry, and typed error handling.
 */
export async function apiFetch<T = unknown>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const {
    timeout = DEFAULT_TIMEOUT,
    maxRetries = DEFAULT_MAX_RETRIES,
    signal: externalSignal,
    ...fetchInit
  } = options

  const headers = new Headers({
    'Content-Type': 'application/json',
    ...(fetchInit.headers as Record<string, string> | undefined),
  })

  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    // Combine timeout + external signal
    const combined = externalSignal
      ? (AbortSignal as any).any
        ? (AbortSignal as any).any([externalSignal, controller.signal])
        : controller.signal
      : controller.signal

    try {
      const res = await fetch(url, {
        ...fetchInit,
        headers,
        signal: combined,
      })

      clearTimeout(timeoutId)

      if (!res.ok) {
        let body: Record<string, unknown> = {}
        try {
          body = await res.json()
        } catch {
          // non-JSON error body
        }
        const err = new ApiError(
          res.status,
          (body.code as string) || 'API_ERROR',
          (body.error as string) || (body.message as string) || res.statusText,
          body.detail as string | undefined
        )

        // Only retry transient errors
        if (err.isRetryable && attempt < maxRetries) {
          const delay = 200 * Math.pow(2, attempt)
          lastError = err
          await sleep(delay)
          continue
        }
        throw err
      }

      // 204 No Content
      if (res.status === 204) return undefined as T

      return (await res.json()) as T
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof ApiError) throw error

      // AbortError from timeout or external cancel
      if (error instanceof DOMException && error.name === 'AbortError') {
        if (externalSignal?.aborted) throw error // caller cancelled
        // Timeout
        const netErr = new NetworkError(`Request timed out after ${timeout}ms`, error)
        if (attempt < maxRetries) {
          lastError = netErr
          await sleep(200 * Math.pow(2, attempt))
          continue
        }
        throw netErr
      }

      // Generic network error
      const netErr = new NetworkError(
        error instanceof Error ? error.message : 'Network request failed',
        error
      )
      if (attempt < maxRetries) {
        lastError = netErr
        await sleep(200 * Math.pow(2, attempt))
        continue
      }
      throw netErr
    }
  }

  throw lastError
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

export const apiGet = <T>(url: string, opts?: FetchOptions) =>
  apiFetch<T>(url, { ...opts, method: 'GET' })

export const apiPost = <T>(url: string, body: unknown, opts?: FetchOptions) =>
  apiFetch<T>(url, {
    ...opts,
    method: 'POST',
    body: JSON.stringify(body),
  })

export const apiPut = <T>(url: string, body: unknown, opts?: FetchOptions) =>
  apiFetch<T>(url, {
    ...opts,
    method: 'PUT',
    body: JSON.stringify(body),
  })

export const apiPatch = <T>(url: string, body: unknown, opts?: FetchOptions) =>
  apiFetch<T>(url, {
    ...opts,
    method: 'PATCH',
    body: JSON.stringify(body),
  })

export const apiDelete = <T>(url: string, opts?: FetchOptions) =>
  apiFetch<T>(url, { ...opts, method: 'DELETE' })

// ─── Format helpers ───────────────────────────────────────────────────────────

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatINRCompact(amount: number): string {
  if (amount >= 1_00_000) return `₹${(amount / 1_00_000).toFixed(1)}L`
  if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(1)}K`
  return formatINR(amount)
}
