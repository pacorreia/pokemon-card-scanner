/**
 * src/lib/image-processing.ts
 *
 * Client-side (Canvas 2D API) utilities for:
 *  - Image quality assessment: blur (Laplacian variance) and glare detection
 *  - Image enhancement: sharpening, auto-contrast, glare suppression
 *  - Targeted crops: bottom-area enlargement for card number / set-symbol text
 *  - Lightweight image hashing for LLM result caching
 *
 * No external dependencies — only standard browser APIs (HTMLCanvasElement, ImageData).
 */

// ── Thresholds ────────────────────────────────────────────────────────────────
/** Laplacian variance below this = blurry image. Empirically calibrated. */
const BLUR_VAR_THRESHOLD = 80
/** Fraction of near-white (overexposed) pixels above which glare is flagged. */
const GLARE_PIXEL_THRESHOLD = 0.10
/** Max resolution for the quality-assessment pass (keeps it fast). */
const QUALITY_SAMPLE_SIZE = 256
/** Max long-side resolution for the enhancement pass. */
const MAX_ENHANCE_SIDE = 1400

// ── Types ─────────────────────────────────────────────────────────────────────
export type ImageQualityReport = {
  /** 0 = very blurry, 1 = sharp */
  blurScore: number
  /** 0 = no glare, 1 = severe glare */
  glareScore: number
  isBlurry: boolean
  hasGlare: boolean
  needsEnhancement: boolean
  /** Human-readable suggestion shown to the user (undefined when image is fine). */
  suggestion?: string
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** Load a data-URL into a canvas, optionally capping the long side. */
async function loadToCanvas(
  dataUrl: string,
  maxSide?: number,
): Promise<{ canvas: HTMLCanvasElement; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let w = img.naturalWidth || img.width
      let h = img.naturalHeight || img.height
      if (maxSide && Math.max(w, h) > maxSide) {
        const s = maxSide / Math.max(w, h)
        w = Math.max(1, Math.round(w * s))
        h = Math.max(1, Math.round(h * s))
      }
      const canvas = createCanvas(w, h)
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      resolve({ canvas, w, h })
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

/** Convert RGBA ImageData to a Float32Array of luminance values. */
function toGrayscale(imageData: ImageData): Float32Array {
  const { data, width, height } = imageData
  const gray = new Float32Array(width * height)
  for (let i = 0; i < width * height; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
  }
  return gray
}

/** Apply the 3×3 [0,1,0,1,-4,1,0,1,0] Laplacian to a grayscale buffer. */
function laplacianResponse(gray: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      out[i] = gray[i - w] + gray[i - 1] - 4 * gray[i] + gray[i + 1] + gray[i + w]
    }
  }
  return out
}

/** Variance of a Float32Array. */
function arrVariance(arr: Float32Array): number {
  const n = arr.length
  if (n === 0) return 0
  let sum = 0
  let sumSq = 0
  for (let i = 0; i < n; i++) { sum += arr[i]; sumSq += arr[i] * arr[i] }
  const mean = sum / n
  return sumSq / n - mean * mean
}

/** Apply a 3×3 convolution kernel (flat, 9 numbers) to RGBA ImageData. */
function applyConvolution(imageData: ImageData, kernel: number[], weight: number): ImageData {
  const { width: w, height: h, data } = imageData
  const out = new Uint8ClampedArray(data.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0
      for (let ky = 0; ky < 3; ky++) {
        for (let kx = 0; kx < 3; kx++) {
          const py = Math.min(h - 1, Math.max(0, y + ky - 1))
          const px = Math.min(w - 1, Math.max(0, x + kx - 1))
          const src = (py * w + px) * 4
          const k = kernel[ky * 3 + kx]
          r += data[src] * k
          g += data[src + 1] * k
          b += data[src + 2] * k
        }
      }
      const dst = (y * w + x) * 4
      out[dst]     = Math.min(255, Math.max(0, Math.round(r / weight)))
      out[dst + 1] = Math.min(255, Math.max(0, Math.round(g / weight)))
      out[dst + 2] = Math.min(255, Math.max(0, Math.round(b / weight)))
      out[dst + 3] = data[dst + 3]
    }
  }
  return new ImageData(out, w, h)
}

/**
 * Auto-contrast: stretch [3rd–97th percentile luminance] to [0–255].
 * Corrects washed-out and under-exposed images.
 */
function autoContrastImageData(imageData: ImageData): ImageData {
  const { data, width: w, height: h } = imageData
  const n = w * h
  const hist = new Uint32Array(256)
  for (let i = 0; i < n; i++) {
    hist[Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2])]++
  }
  const lowCut = n * 0.03
  const highCut = n * 0.97
  let cum = 0, low = 0, high = 255
  for (let i = 0; i < 256; i++) {
    cum += hist[i]
    if (cum < lowCut) low = i
    if (cum < highCut) high = i
  }
  if (high <= low) return imageData
  const range = high - low
  const out = new Uint8ClampedArray(data)
  for (let i = 0; i < n; i++) {
    const b = i * 4
    out[b]     = Math.min(255, Math.max(0, Math.round((data[b]     - low) * 255 / range)))
    out[b + 1] = Math.min(255, Math.max(0, Math.round((data[b + 1] - low) * 255 / range)))
    out[b + 2] = Math.min(255, Math.max(0, Math.round((data[b + 2] - low) * 255 / range)))
    out[b + 3] = data[b + 3]
  }
  return new ImageData(out, w, h)
}

/**
 * Tone-compress overexposed highlights.
 * Maps [230–255] → [230–200] to reduce glare wash-out.
 */
function suppressGlareImageData(imageData: ImageData, glareScore: number): ImageData {
  if (glareScore < 0.05) return imageData
  const { data, width: w, height: h } = imageData
  const n = w * h
  const threshold = 230
  const out = new Uint8ClampedArray(data)
  const compress = (v: number) =>
    v <= threshold ? v : Math.round(threshold + ((v - threshold) / (255 - threshold)) * (200 - threshold))
  for (let i = 0; i < n; i++) {
    const b = i * 4
    if (Math.max(data[b], data[b + 1], data[b + 2]) > threshold) {
      out[b]     = compress(data[b])
      out[b + 1] = compress(data[b + 1])
      out[b + 2] = compress(data[b + 2])
    }
  }
  return new ImageData(out, w, h)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Assess image quality for blur and glare.
 * Downsamples to QUALITY_SAMPLE_SIZE × QUALITY_SAMPLE_SIZE for performance
 * (~1–5 ms on modern hardware).
 */
export async function assessImageQuality(dataUrl: string): Promise<ImageQualityReport> {
  try {
    const { canvas, w, h } = await loadToCanvas(dataUrl, QUALITY_SAMPLE_SIZE)
    const ctx = canvas.getContext('2d')!
    const imageData = ctx.getImageData(0, 0, w, h)

    // Blur: Laplacian variance — higher = sharper
    const gray = toGrayscale(imageData)
    const lap = laplacianResponse(gray, w, h)
    const lapVar = arrVariance(lap)
    // Empirical normalization: variance ≈ 500+ is sharp; < 80 is clearly blurry
    const blurScore = Math.min(1, lapVar / 500)

    // Glare: fraction of near-white pixels (R,G,B > 240)
    const { data } = imageData
    const n = w * h
    let glareCount = 0
    for (let i = 0; i < n; i++) {
      if (data[i * 4] > 240 && data[i * 4 + 1] > 240 && data[i * 4 + 2] > 240) glareCount++
    }
    const glareScore = glareCount / n

    const isBlurry = lapVar < BLUR_VAR_THRESHOLD
    const hasGlare = glareScore > GLARE_PIXEL_THRESHOLD
    const needsEnhancement = isBlurry || hasGlare

    let suggestion: string | undefined
    if (isBlurry && hasGlare) {
      suggestion = 'Image appears blurry with glare. Hold steady and avoid direct light sources.'
    } else if (isBlurry) {
      suggestion = 'Image appears blurry. Hold the camera still and ensure the card is in focus.'
    } else if (hasGlare) {
      suggestion = 'Glare detected. Tilt the card slightly or diffuse the light source.'
    }

    return { blurScore, glareScore, isBlurry, hasGlare, needsEnhancement, suggestion }
  } catch {
    return { blurScore: 0.5, glareScore: 0, isBlurry: false, hasGlare: false, needsEnhancement: false }
  }
}

/**
 * Full enhancement pipeline: glare suppression → auto-contrast → sharpen.
 * Sharpening strength is adapted to the blur score.
 * Works on the image capped to MAX_ENHANCE_SIDE for performance.
 */
export async function enhanceCardImage(
  dataUrl: string,
  report: ImageQualityReport,
): Promise<string> {
  try {
    const { canvas, w, h } = await loadToCanvas(dataUrl, MAX_ENHANCE_SIDE)
    const ctx = canvas.getContext('2d')!
    let imageData = ctx.getImageData(0, 0, w, h)

    // Step 1: suppress glare highlights
    if (report.hasGlare) {
      imageData = suppressGlareImageData(imageData, report.glareScore)
    }

    // Step 2: auto-contrast stretch
    imageData = autoContrastImageData(imageData)

    // Step 3: sharpen
    // Stronger kernel for blurry images; lighter touch for crisp images with minor glare
    const sharpenKernel = report.blurScore < 0.3
      ? [ 0, -1,  0, -1,  5, -1,  0, -1,  0]   // standard unsharp-mask sharpen
      : [ 0, -0.5, 0, -0.5, 3, -0.5, 0, -0.5, 0] // light sharpening
    imageData = applyConvolution(imageData, sharpenKernel, 1)

    ctx.putImageData(imageData, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.92)
  } catch {
    return dataUrl // Fall back to original on any error
  }
}

/**
 * Return an upscaled crop of the bottom portion of a card image.
 * This area contains the card number, set symbol, and rarity symbol — all
 * printed in very small fonts that vision models often misread.
 *
 * @param fromPercent Height fraction from the bottom to capture (default 0.22 = bottom 22%)
 * @param upscaleFactor Scale factor applied to the crop (default 2.5×)
 */
export async function extractCardBottomCrop(
  dataUrl: string,
  fromPercent = 0.22,
  upscaleFactor = 2.5,
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const srcW = img.naturalWidth || img.width
      const srcH = img.naturalHeight || img.height
      if (!srcW || !srcH) { resolve(dataUrl); return }

      const cropY = Math.floor(srcH * (1 - fromPercent))
      const cropH = srcH - cropY
      const dstW = Math.round(srcW * upscaleFactor)
      const dstH = Math.round(cropH * upscaleFactor)

      const canvas = createCanvas(dstW, dstH)
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, cropY, srcW, cropH, 0, 0, dstW, dstH)
      resolve(canvas.toDataURL('image/jpeg', 0.93))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

/**
 * Lightweight fingerprint of a data-URL for use as a Map cache key.
 * Samples characters from start, middle, and end for speed.
 * NOT cryptographically secure — only used for deduplication.
 */
export function imageDataUrlHash(dataUrl: string): string {
  const mid = dataUrl.length >> 1
  const sample =
    dataUrl.length <= 2000
      ? dataUrl
      : dataUrl.slice(0, 500) + dataUrl.slice(mid, mid + 500) + dataUrl.slice(-500)
  let h = 5381
  for (let i = 0; i < sample.length; i++) {
    h = (((h << 5) + h) ^ sample.charCodeAt(i)) >>> 0
  }
  return h.toString(36)
}
