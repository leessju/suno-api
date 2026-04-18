#!/usr/bin/env node
/**
 * BPM 감지 스크립트 — Essentia.js RhythmExtractor2013
 * Usage: node scripts/bpm_detect.mjs <audio_file>
 * Output: {"bpm": 80.82, "confidence": 0.95}
 */

import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const audioFile = process.argv[2]
if (!audioFile || !existsSync(audioFile)) {
  process.stderr.write(`Usage: node bpm_detect.mjs <audio_file>\n`)
  process.exit(1)
}

// ffmpeg으로 mono 22050Hz float32le PCM 디코딩
// maxBuffer: 200MB — 10분 이상 곡도 처리 가능
function decodeAudio(filePath) {
  const raw = execSync(
    `ffmpeg -i "${filePath}" -f f32le -acodec pcm_f32le -ar 22050 -ac 1 - 2>/dev/null`,
    { maxBuffer: 200 * 1024 * 1024 }
  )
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4)
}

function detectBpm(filePath) {
  const EssentiaWASM = require('../node_modules/essentia.js/dist/essentia-wasm.umd.js')
  const Essentia = require('../node_modules/essentia.js/dist/essentia.js-core.umd.js')

  const essentia = new Essentia(EssentiaWASM)
  const floats = decodeAudio(filePath)
  const audioVector = essentia.arrayToVector(floats)
  const result = essentia.RhythmExtractor2013(audioVector)

  console.log(JSON.stringify({
    bpm: Math.round(result.bpm * 100) / 100,
    confidence: result.confidence ?? null,
  }))
}

try {
  detectBpm(audioFile)
} catch (e) {
  process.stderr.write(`Error: ${e.message}\n`)
  process.exit(1)
}
