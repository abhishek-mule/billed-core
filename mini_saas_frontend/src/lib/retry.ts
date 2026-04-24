import { logger } from './logger'

export interface RetryConfig {
  maxAttempts: number
  baseDelay: number
  maxDelay: number
  backoffMultiplier: number
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 200,
  maxDelay: 5000,
  backoffMultiplier: 2.5,
}

export const RETRYABLE_ERRORS = [
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ECONNREFUSED',
  'NETWORK_ERROR',
  'UPSTREAM_TIMEOUT',
]

export const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504]

export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    return RETRYABLE_ERRORS.includes(error.code || '')
  }
  return false
}

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.includes(status)
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: unknown
  
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      
      const isNetworkError = error instanceof Error && (
        isRetryableError(error) || 
        'cause' in error && isRetryableError(error.cause as Error)
      )
      
      if (!isNetworkError && !isRetryableStatus((error as any)?.status)) {
        throw error
      }
      
      if (attempt < config.maxAttempts) {
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelay
        )
        
        logger.warn({
          type: 'retry',
          attempt,
          maxAttempts: config.maxAttempts,
          delay,
          error: error instanceof Error ? error.message : String(error),
        })
        
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  
  throw lastError
}

export async function withRetryAndCircuit<T>(
  tenantId: string,
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  const circuits = await import('./circuits')
  
  return withRetry<T>(() => circuits.withCircuitBreaker(tenantId, fn), config)
}