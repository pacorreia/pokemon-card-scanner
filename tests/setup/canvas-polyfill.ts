/**
 * tests/setup/canvas-polyfill.ts
 *
 * Registers node-canvas globals so that src/lib/image-processing.ts can run
 * in the Node.js/Vitest environment without a real browser.
 *
 * node-canvas provides compatible HTMLCanvasElement, Image, and ImageData
 * implementations backed by Cairo, so all pixel operations work correctly.
 */
import { createCanvas, Image, ImageData } from 'canvas'

// Replace document.createElement('canvas') with node-canvas
Object.defineProperty(globalThis, 'document', {
  value: {
    createElement(tag: string) {
      if (tag === 'canvas') return createCanvas(0, 0)
      throw new Error(`document.createElement('${tag}') is not supported in the test environment`)
    },
  },
  writable: true,
})

// Expose Image so `new Image()` works inside image-processing.ts
Object.defineProperty(globalThis, 'Image', {
  value: Image,
  writable: true,
})

// Expose ImageData for any direct construction in tests or lib code
Object.defineProperty(globalThis, 'ImageData', {
  value: ImageData,
  writable: true,
})
