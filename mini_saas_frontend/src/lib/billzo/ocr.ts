import { createWorker, type Worker } from 'tesseract.js'

let worker: Worker | null = null
let workerPromise: Promise<Worker> | null = null
let workerEnded = false

async function getWorker(): Promise<Worker> {
  if (worker && !workerEnded) return worker
  if (workerPromise) return workerPromise

  workerEnded = false
  workerPromise = (async () => {
    worker = await createWorker('eng+hin', undefined, {
      logger: (m) => {
        if (m.status === 'loading tesseract core' && typeof window !== 'undefined') {
          console.log('[OCR] Loading Tesseract core...')
        }
        if (m.status === 'initializing tesseract' && typeof window !== 'undefined') {
          console.log('[OCR] Initializing Tesseract...')
        }
        if (m.status === 'loading language traineddata' && typeof window !== 'undefined') {
          console.log('[OCR] Loading language data...')
        }
        if (m.status === 'initializing api' && typeof window !== 'undefined') {
          console.log('[OCR] Ready.')
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

  const w = await getWorker()
  const result = await w.recognize(imageData)

  return {
    rawText: result.data.text,
    confidence: result.data.confidence,
    processingTimeMs: Date.now() - start,
  }
}

export async function terminateWorker() {
  if (worker && !workerEnded) {
    await worker.terminate()
    workerEnded = true
    worker = null
    workerPromise = null
  }
}

export function isWorkerReady(): boolean {
  return worker !== null && !workerEnded
}