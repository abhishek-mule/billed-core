let counter = 0

export function generateId(prefix = 'test'): string {
  counter++
  return `${prefix}-${Date.now()}-${counter}`
}

export function resetIdCounter() {
  counter = 0
}
