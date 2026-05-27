import pino from 'pino'
import type { Logger } from 'pino'

const LOG_LEVEL = process.env.LOG_LEVEL || 'info'

export function createQueueLogger(name: string): Logger {
  return pino({
    name,
    level: LOG_LEVEL,
    formatters: {
      level(label) {
        return { level: label }
      },
    },
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
  })
}
