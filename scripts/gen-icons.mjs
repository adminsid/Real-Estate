/**
 * gen-icons.mjs
 * Generates PWA icons (192x192 and 512x512 PNG) from the inline SVG definition.
 * Uses only Node.js built-in modules — no extra dependencies required.
 *
 * The PNG is generated using raw pixel data compressed with zlib (built-in).
 */

import { createWriteStream, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(__dirname, '../public/icons')
mkdirSync(OUT_DIR, { recursive: true })

// ── Brand colors ─────────────────────────────────────────────────────────────
const NAVY = [15, 32, 64]      // #0F2040
const GOLD = [201, 168, 76]    // #C9A84C
const WHITE = [255, 255, 255]

/**
 * Draw a filled rectangle into a pixel buffer (RGBA flat array).
 */
function fillRect(pixels, width, x, y, w, h, [r, g, b]) {
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) {
      const i = (row * width + col) * 4
      pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = 255
    }
  }
}

/**
 * Draw a filled circle into a pixel buffer.
 */
function fillCircle(pixels, width, cx, cy, radius, [r, g, b]) {
  const x0 = Math.max(0, cx - radius)
  const x1 = Math.min(width - 1, cx + radius)
  const y0 = Math.max(0, cy - radius)
  const y1 = Math.min(width - 1, cy + radius)
  for (let row = y0; row <= y1; row++) {
    for (let col = x0; col <= x1; col++) {
      const dx = col - cx, dy = row - cy
      if (dx * dx + dy * dy <= radius * radius) {
        const i = (row * width + col) * 4
        pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = 255
      }
    }
  }
}

/**
 * Draw a house silhouette icon at a given scale into pixel buffer.
 * All coordinates are normalised to a 100-unit canvas then scaled.
 */
function drawIcon(pixels, size) {
  const s = size / 100

  // Background rounded rectangle (simulate with just filling entire image)
  fillRect(pixels, size, 0, 0, size, size, NAVY)

  // Roof triangle — drawn as a series of horizontal lines
  const roofTip = { x: 50 * s, y: 15 * s }
  const roofLeft = { x: 14 * s, y: 44 * s }
  const roofRight = { x: 86 * s, y: 44 * s }
  for (let row = roofTip.y; row <= roofLeft.y; row++) {
    const t = (row - roofTip.y) / (roofLeft.y - roofTip.y)
    const x0 = Math.round(roofTip.x - t * (roofTip.x - roofLeft.x))
    const x1 = Math.round(roofTip.x + t * (roofRight.x - roofTip.x))
    for (let col = x0; col <= x1; col++) {
      const i = (row * size + col) * 4
      pixels[i] = GOLD[0]; pixels[i + 1] = GOLD[1]; pixels[i + 2] = GOLD[2]; pixels[i + 3] = 255
    }
  }

  // House body
  fillRect(pixels, size, Math.round(18 * s), Math.round(42 * s), Math.round(64 * s), Math.round(36 * s), GOLD)

  // Door
  fillRect(pixels, size, Math.round(40 * s), Math.round(60 * s), Math.round(20 * s), Math.round(18 * s), NAVY)

  // Left window
  fillRect(pixels, size, Math.round(22 * s), Math.round(50 * s), Math.round(13 * s), Math.round(10 * s), NAVY)

  // Right window
  fillRect(pixels, size, Math.round(65 * s), Math.round(50 * s), Math.round(13 * s), Math.round(10 * s), NAVY)

  // Chimney
  fillRect(pixels, size, Math.round(62 * s), Math.round(20 * s), Math.round(8 * s), Math.round(20 * s), GOLD)

  // Corner dots for branding flair
  fillCircle(pixels, size, Math.round(88 * s), Math.round(88 * s), Math.round(6 * s), WHITE)
}

/**
 * Encode raw RGBA pixels as a PNG file (no external deps).
 */
function encodePNG(width, height, pixels) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR
  function mkIHDR() {
    const d = Buffer.alloc(13)
    d.writeUInt32BE(width, 0)
    d.writeUInt32BE(height, 4)
    d[8] = 8  // bit depth
    d[9] = 2  // color type: RGB (we'll strip alpha for simplicity below)
    d[10] = 0; d[11] = 0; d[12] = 0
    return chunk('IHDR', d)
  }

  // Convert RGBA pixels → raw RGB scanlines with filter byte prefix (filter 0 = None)
  function mkIDAT() {
    const rows = []
    for (let y = 0; y < height; y++) {
      const row = Buffer.alloc(1 + width * 3)
      row[0] = 0 // filter type None
      for (let x = 0; x < width; x++) {
        const si = (y * width + x) * 4
        row[1 + x * 3] = pixels[si]
        row[2 + x * 3] = pixels[si + 1]
        row[3 + x * 3] = pixels[si + 2]
      }
      rows.push(row)
    }
    const raw = Buffer.concat(rows)
    const compressed = deflateSync(raw, { level: 6 })
    return chunk('IDAT', compressed)
  }

  function mkIEND() { return chunk('IEND', Buffer.alloc(0)) }

  function chunk(type, data) {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length, 0)
    const typeB = Buffer.from(type, 'ascii')
    const crcInput = Buffer.concat([typeB, data])
    const crcVal = crc32(crcInput)
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE(crcVal >>> 0, 0)
    return Buffer.concat([len, typeB, data, crcBuf])
  }

  return Buffer.concat([sig, mkIHDR(), mkIDAT(), mkIEND()])
}

// ── CRC-32 (required by PNG spec) ────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ── Generate ──────────────────────────────────────────────────────────────────
for (const size of [192, 512]) {
  const pixels = new Uint8Array(size * size * 4)
  drawIcon(pixels, size)
  const pngData = encodePNG(size, size, pixels)
  const outPath = path.join(OUT_DIR, `icon-${size}.png`)
  const ws = createWriteStream(outPath)
  ws.write(pngData)
  ws.end()
  console.log(`✓ Generated ${outPath} (${(pngData.length / 1024).toFixed(1)} KB)`)
}
