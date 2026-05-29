function createStructuredLogger(module: string) {
  return {
    info: (ctx: Record<string, unknown>, msg: string) => {
      console.log(JSON.stringify({ level: 'info', module, ...ctx, message: msg }))
    },
    warn: (ctx: Record<string, unknown>, msg: string) => {
      console.warn(JSON.stringify({ level: 'warn', module, ...ctx, message: msg }))
    },
    error: (ctx: Record<string, unknown>, msg: string) => {
      console.error(JSON.stringify({ level: 'error', module, ...ctx, message: msg }))
    },
  }
}

export const logger = createStructuredLogger('billzo')
