import { createWorker, type Worker } from 'tesseract.js'

let worker: Worker | null = null
let workerPromise: Promise<Worker> | null = null

async function getWorker(): Promise<Worker> {
  if (worker && !worker.terminated) return worker
  if (workerPromise) return workerPromise

  workerPromise = (async () => {
    worker = await createWorker('eng+hin', undefined, {
      logger: (m) => {
        if (m.status === 'loading tesseract core') {
          if (typeof window !== 'undefined') {
            console.log('[OCR] Loading Tesseract core...')
          }
        }
        if (m.status === 'initializing tesseract') {
          if (typeof window !== 'undefined') {
            console.log('[OCR] Initializing Tesseract...')
          }
        }
        if (m.status === 'loading language traineddata') {
          if (typeof window !== 'undefined') {
            console.log('[OCR] Loading language data...')
          }
        }
        if (m.status === 'initializing api') {
          if (typeof window !== 'undefined') {
            console.log('[OCR] Ready.')
          }
        }
      },
    })
    await worker
    return worker
  })()

  return workerPromise
}

export interface OCRResult {
  rawText: string
  confidence: number
  processingTimeMs: number
}

export async function extractTextFromImage(imageData: File | Blob | string): Promise<OCRResult> {
  const start = Date.now()

  try {
    const w = await getWorker()

    let imageBuffer: string | Blob
    if (typeof imageData === 'string') {
      imageBuffer = imageData
    } else {
      imageBuffer = imageData
    }

    const result = await w.recognize(imageBuffer)

    return {
      rawText: result.data.text,
      confidence: result.data.confidence,
      processingTimeMs: Date.now() - start,
    }
  } catch (err) {
    console.error('[OCR] Tesseract error:', err)
    throw new Error('Failed to extract text from image')
  }
}

export async function terminateWorker() {
  if (worker && !worker.terminated) {
    await worker.terminate()
    worker = null
    workerPromise = null
  }
}

export function isWorkerReady(): boolean {
  return worker !== null && !worker.terminated
}