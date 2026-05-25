export type PreprocessMode = 'light' | 'full'

export interface PreprocessMetadata {
  originalWidth: number
  originalHeight: number
  resizedWidth: number
  resizedHeight: number
  cropped: boolean
  threshold: number
  deskewAngle: number
  elapsedMs: number
  mode: PreprocessMode
}

export interface PreprocessResult {
  blob: Blob
  metadata: PreprocessMetadata
}

function createCanvas(width: number, height: number): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D } {
  let canvas: HTMLCanvasElement | OffscreenCanvas
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(width, height)
  } else {
    canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
  }
  const ctx = canvas.getContext('2d')!
  return { canvas, ctx }
}

const MIN_IMAGE_DIMENSION = 200

export function validateImageSize(width: number, height: number): void {
  if (width < MIN_IMAGE_DIMENSION || height < MIN_IMAGE_DIMENSION) {
    throw new Error(`Image too small (${width}x${height}). Minimum ${MIN_IMAGE_DIMENSION}x${MIN_IMAGE_DIMENSION} pixels required.`)
  }
}

export async function decodeImage(file: File): Promise<ImageData> {
  const bitmap = await createImageBitmap(file)
  validateImageSize(bitmap.width, bitmap.height)
  const { canvas, ctx } = createCanvas(bitmap.width, bitmap.height)
  ctx.drawImage(bitmap, 0, 0)
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
  bitmap.close()
  return data
}

export function resizeImage(data: ImageData, maxDimension = 1600): ImageData {
  const { width, height } = data
  if (width <= maxDimension && height <= maxDimension) return data

  const scale = Math.min(maxDimension / width, maxDimension / height)
  const newWidth = Math.round(width * scale)
  const newHeight = Math.round(height * scale)

  const { canvas, ctx } = createCanvas(newWidth, newHeight)
  const { canvas: tempCanvas, ctx: tempCtx } = createCanvas(width, height)
  tempCtx.putImageData(data, 0, 0)

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(tempCanvas, 0, 0, newWidth, newHeight)
  return ctx.getImageData(0, 0, newWidth, newHeight)
}

export function autoCropBoundary(data: ImageData): ImageData {
  const { width, height } = data
  const pixels = data.data

  let minX = width, minY = height, maxX = 0, maxY = 0

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4
      const gx =
        -pixels[idx - width * 4 - 4] - 2 * pixels[idx - width * 4] - pixels[idx - width * 4 + 4]
        + pixels[idx + width * 4 - 4] + 2 * pixels[idx + width * 4] + pixels[idx + width * 4 + 4]
      const gy =
        -pixels[idx - width * 4 - 4] - 2 * pixels[idx - 4] - pixels[idx + width * 4 - 4]
        + pixels[idx - width * 4 + 4] + 2 * pixels[idx + 4] + pixels[idx + width * 4 + 4]
      const magnitude = Math.abs(gx) + Math.abs(gy)

      if (magnitude > 80) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX === 0 || maxY === 0 || (maxX - minX) < width * 0.1 || (maxY - minY) < height * 0.1) {
    return data
  }

  const pad = Math.round(Math.min(width, height) * 0.03)
  const cropX = Math.max(0, minX - pad)
  const cropY = Math.max(0, minY - pad)
  const cropW = Math.min(width - cropX, maxX - minX + pad * 2)
  const cropH = Math.min(height - cropY, maxY - minY + pad * 2)

  if (cropW < width * 0.5 || cropH < height * 0.5) return data

  const { canvas, ctx } = createCanvas(cropW, cropH)
  const { canvas: tempCanvas, ctx: tempCtx } = createCanvas(width, height)
  tempCtx.putImageData(data, 0, 0)
  ctx.drawImage(tempCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)
  return ctx.getImageData(0, 0, cropW, cropH)
}

export function toGrayscale(data: ImageData): ImageData {
  const pixels = data.data
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2])
    pixels[i] = gray
    pixels[i + 1] = gray
    pixels[i + 2] = gray
  }
  return data
}

export function normalizeContrast(data: ImageData): ImageData {
  const pixels = data.data
  let min = 255, max = 0
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] < min) min = pixels[i]
    if (pixels[i] > max) max = pixels[i]
  }
  const range = max - min
  if (range < 10) return data
  const scale = 255 / range
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = Math.round((pixels[i] - min) * scale)
    pixels[i + 1] = Math.round((pixels[i + 1] - min) * scale)
    pixels[i + 2] = Math.round((pixels[i + 2] - min) * scale)
  }
  return data
}

export function computeOtsuThreshold(data: ImageData): number {
  const pixels = data.data
  const hist = new Uint32Array(256)
  let total = 0
  for (let i = 0; i < pixels.length; i += 4) {
    hist[pixels[i]]++
    total++
  }
  let sumTotal = 0
  for (let t = 0; t < 256; t++) sumTotal += t * hist[t]

  let sumB = 0, wB = 0, wF = 0, maxVariance = 0, threshold = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const meanB = sumB / wB
    const meanF = (sumTotal - sumB) / wF
    const between = wB * wF * (meanB - meanF) * (meanB - meanF)
    if (between > maxVariance) {
      maxVariance = between
      threshold = t
    }
  }
  return threshold
}

export function applyThreshold(data: ImageData, threshold: number): ImageData {
  const pixels = data.data
  for (let i = 0; i < pixels.length; i += 4) {
    const val = pixels[i] < threshold ? 0 : 255
    pixels[i] = val
    pixels[i + 1] = val
    pixels[i + 2] = val
  }
  return data
}

export function otsuThreshold(data: ImageData): ImageData {
  const threshold = computeOtsuThreshold(data)
  return applyThreshold(data, threshold)
}

export function medianFilter(data: ImageData, kernelSize = 3): ImageData {
  const { width, height } = data
  const pixels = data.data
  const half = Math.floor(kernelSize / 2)
  const out = new Uint8ClampedArray(pixels)

  for (let y = half; y < height - half; y++) {
    for (let x = half; x < width - half; x++) {
      const neighbors: number[] = []
      for (let ky = -half; ky <= half; ky++) {
        for (let kx = -half; kx <= half; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4
          neighbors.push(pixels[idx])
        }
      }
      neighbors.sort((a, b) => a - b)
      const median = neighbors[Math.floor(neighbors.length / 2)]
      const outIdx = (y * width + x) * 4
      out[outIdx] = median
      out[outIdx + 1] = median
      out[outIdx + 2] = median
    }
  }

  for (let i = 0; i < out.length; i++) pixels[i] = out[i]
  return data
}

export function deskewProjection(data: ImageData): { data: ImageData; angle: number } {
  const { width, height } = data
  let bestAngle = 0
  let bestVariance = 0

  for (let angle = -5; angle <= 5; angle += 0.5) {
    const rad = (angle * Math.PI) / 180
    const cos = Math.abs(Math.cos(rad))
    const sin = Math.abs(Math.sin(rad))
    const newWidth = Math.round(width * cos + height * sin)
    const newHeight = Math.round(height * cos + width * sin)

    const { canvas, ctx } = createCanvas(newWidth, newHeight)

    const cx = newWidth / 2
    const cy = newHeight / 2
    ctx.translate(cx, cy)
    ctx.rotate((angle * Math.PI) / 180)
    ctx.translate(-width / 2, -height / 2)

    const { canvas: tempCanvas, ctx: tempCtx } = createCanvas(width, height)
    tempCtx.putImageData(data, 0, 0)
    ctx.drawImage(tempCanvas, 0, 0)

    const rotated = ctx.getImageData(0, 0, newWidth, newHeight)
    const rotPixels = rotated.data

    const projections: number[] = []
    for (let y = 0; y < newHeight; y++) {
      let rowSum = 0
      for (let x = 0; x < newWidth; x++) {
        rowSum += rotPixels[(y * newWidth + x) * 4]
      }
      projections.push(rowSum)
    }

    const mean = projections.reduce((s, v) => s + v, 0) / projections.length
    const variance = projections.reduce((s, v) => s + (v - mean) * (v - mean), 0) / projections.length

    if (variance > bestVariance) {
      bestVariance = variance
      bestAngle = angle
    }
  }

  if (Math.abs(bestAngle) < 0.5) return { data, angle: 0 }

  const rad = (bestAngle * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const newWidth = Math.round(width * cos + height * sin)
  const newHeight = Math.round(height * cos + width * sin)

  const { canvas: resultCanvas, ctx: resultCtx } = createCanvas(newWidth, newHeight)
  resultCtx.translate(newWidth / 2, newHeight / 2)
  resultCtx.rotate((bestAngle * Math.PI) / 180)
  resultCtx.translate(-width / 2, -height / 2)

  const { canvas: srcCanvas, ctx: srcCtx } = createCanvas(width, height)
  srcCtx.putImageData(data, 0, 0)
  resultCtx.drawImage(srcCanvas, 0, 0)

  return {
    data: resultCtx.getImageData(0, 0, newWidth, newHeight),
    angle: Math.round(bestAngle * 10) / 10,
  }
}

export function sharpenText(data: ImageData): ImageData {
  const { width, height } = data
  const pixels = data.data
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0]
  const out = new Uint8ClampedArray(pixels)

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4
          const kIdx = (ky + 1) * 3 + (kx + 1)
          sum += pixels[idx] * kernel[kIdx]
        }
      }
      const outIdx = (y * width + x) * 4
      out[outIdx] = Math.max(0, Math.min(255, sum))
      out[outIdx + 1] = Math.max(0, Math.min(255, sum))
      out[outIdx + 2] = Math.max(0, Math.min(255, sum))
    }
  }

  for (let i = 0; i < out.length; i++) pixels[i] = out[i]
  return data
}

export async function encodeToBlob(data: ImageData, format = 'image/jpeg', quality = 0.92): Promise<Blob> {
  const { canvas } = createCanvas(data.width, data.height)
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(data, 0, 0)

  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: format, quality })
  }

  return new Promise<Blob>((resolve) => {
    (canvas as HTMLCanvasElement).toBlob((blob) => {
      resolve(blob || new Blob([], { type: format }))
    }, format, quality)
  })
}

export async function preprocessLight(file: File): Promise<PreprocessResult> {
  const start = Date.now()

  let imageData = await decodeImage(file)
  const originalWidth = imageData.width
  const originalHeight = imageData.height

  imageData = resizeImage(imageData, 1600)
  const resizedWidth = imageData.width
  const resizedHeight = imageData.height

  const croppedData = autoCropBoundary(imageData)
  const cropped = croppedData.width !== imageData.width || croppedData.height !== imageData.height
  imageData = croppedData

  imageData = toGrayscale(imageData)
  imageData = normalizeContrast(imageData)

  const blob = await encodeToBlob(imageData)

  return {
    blob,
    metadata: {
      originalWidth,
      originalHeight,
      resizedWidth,
      resizedHeight,
      cropped,
      threshold: 0,
      deskewAngle: 0,
      elapsedMs: Date.now() - start,
      mode: 'light',
    },
  }
}

export async function preprocessFull(file: File): Promise<PreprocessResult> {
  const start = Date.now()

  let imageData = await decodeImage(file)
  const originalWidth = imageData.width
  const originalHeight = imageData.height

  imageData = resizeImage(imageData, 1600)
  const resizedWidth = imageData.width
  const resizedHeight = imageData.height

  const croppedData = autoCropBoundary(imageData)
  const cropped = croppedData.width !== imageData.width || croppedData.height !== imageData.height
  imageData = croppedData

  imageData = toGrayscale(imageData)
  imageData = normalizeContrast(imageData)
  const threshold = computeOtsuThreshold(imageData)
  imageData = applyThreshold(imageData, threshold)
  imageData = medianFilter(imageData, 3)

  const { data: deskewed, angle: deskewAngle } = deskewProjection(imageData)
  imageData = deskewed

  imageData = sharpenText(imageData)

  const blob = await encodeToBlob(imageData)

  return {
    blob,
    metadata: {
      originalWidth,
      originalHeight,
      resizedWidth,
      resizedHeight,
      cropped,
      threshold,
      deskewAngle,
      elapsedMs: Date.now() - start,
      mode: 'full',
    },
  }
}

export const preprocessImage = preprocessFull
