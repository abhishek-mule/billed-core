import { getRedis } from './queue'

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerConfig {
  failureThreshold: number
  successThreshold: number
  timeout: number
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,
}

export interface CircuitBreakerStats {
  state: CircuitState
  failures: number
  successes: number
  nextAttempt: number
  lastFailure?: string
}

const circuits: Map<string, { state: CircuitState; failures: number; successes: number; nextAttempt: number; lastFailure?: string }> = new Map()

export function getCircuitBreaker(name: string, config: CircuitBreakerConfig = DEFAULT_CONFIG) {
  let circuit = circuits.get(name)
  
  if (!circuit) {
    circuit = {
      state: 'CLOSED',
      failures: 0,
      successes: 0,
      nextAttempt: 0,
    }
    circuits.set(name, circuit)
  }

  return {
    async execute<T>(operation: () => Promise<T>): Promise<T> {
      const now = Date.now()
      
      if (circuit!.state === 'OPEN') {
        if (now < circuit!.nextAttempt) {
          throw new Error(`Circuit breaker OPEN for ${name}. Retry after ${Math.ceil((circuit!.nextAttempt - now) / 1000)}s`)
        }
        circuit!.state = 'HALF_OPEN'
      }

      try {
        const result = await operation()
        
        if (circuit!.state === 'HALF_OPEN') {
          circuit!.successes++
          if (circuit!.successes >= config.successThreshold) {
            circuit!.state = 'CLOSED'
            circuit!.failures = 0
            circuit!.successes = 0
            console.log(`[Circuit] ${name} CLOSED`)
          }
        } else {
          circuit!.failures = 0
        }
        
        return result
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        
        circuit!.failures++
        circuit!.lastFailure = message
        
        if (circuit!.failures >= config.failureThreshold) {
          circuit!.state = 'OPEN'
          circuit!.nextAttempt = now + config.timeout
          console.warn(`[Circuit] ${name} OPEN after ${circuit!.failures} failures`)
        }
        
        throw error
      }
    },

    getState(): CircuitBreakerStats {
      return {
        state: circuit!.state,
        failures: circuit!.failures,
        successes: circuit!.successes,
        nextAttempt: circuit!.nextAttempt,
        lastFailure: circuit!.lastFailure,
      }
    },

    reset() {
      circuit!.state = 'CLOSED'
      circuit!.failures = 0
      circuit!.successes = 0
      circuit!.nextAttempt = 0
      circuit!.lastFailure = undefined
    },
  }
}

export const ERP_CIRCUIT = 'erp-api'

export async function callWithCircuitBreaker<T>(
  operation: () => Promise<T>,
  circuitName: string = ERP_CIRCUIT
): Promise<T> {
  const breaker = getCircuitBreaker(circuitName)
  return breaker.execute(operation)
}

export function getCircuitBreakerStats(): Record<string, CircuitBreakerStats> {
  const stats: Record<string, CircuitBreakerStats> = {}
  
  for (const [name, circuit] of circuits) {
    stats[name] = {
      state: circuit.state,
      failures: circuit.failures,
      successes: circuit.successes,
      nextAttempt: circuit.nextAttempt,
      lastFailure: circuit.lastFailure,
    }
  }
  
  return stats
}

export function resetAllCircuits() {
  for (const circuit of circuits.values()) {
    circuit.state = 'CLOSED'
    circuit.failures = 0
    circuit.successes = 0
    circuit.nextAttempt = 0
    circuit.lastFailure = undefined
  }
  console.log('[Circuit] All circuits reset')
}