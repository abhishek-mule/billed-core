import { preprocessImage } from './preprocess'

self.onmessage = async (e: MessageEvent<File>) => {
  try {
    const file = e.data
    const result = await preprocessImage(file)
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
