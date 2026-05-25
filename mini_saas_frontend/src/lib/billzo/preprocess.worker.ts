import { preprocessLight, preprocessFull } from './preprocess'

self.onmessage = async (e: MessageEvent<{ file: File; mode?: 'light' | 'full' }>) => {
  try {
    const { file, mode = 'light' } = e.data
    const fn = mode === 'full' ? preprocessFull : preprocessLight
    const result = await fn(file)
    self.postMessage({
      type: 'success',
      blob: result.blob,
      metadata: result.metadata,
    })
  } catch (err: any) {
    self.postMessage({
      type: 'error',
      error: err.message || 'Preprocessing failed',
    })
  }
}
