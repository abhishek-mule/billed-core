export function getErrorMessage(error: unknown, fallback = 'Something went wrong') {
  if (error instanceof Error && error.message) return error.message

  if (typeof error === 'string' && error.trim()) return error

  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>
    const message = record.message
    if (typeof message === 'string' && message.trim()) return message

    const apiError = record.error
    if (typeof apiError === 'string' && apiError.trim()) return apiError
  }

  return fallback
}
