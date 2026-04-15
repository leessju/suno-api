import { createHash } from 'crypto'

/** 키 정렬 + 공백 없는 JSON (Node/Python 동일 규칙) */
function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return JSON.stringify(obj)
  }
  const sorted = Object.keys(obj as Record<string, unknown>)
    .sort()
    .reduce((acc, key) => {
      acc[key] = (obj as Record<string, unknown>)[key]
      return acc
    }, {} as Record<string, unknown>)
  return JSON.stringify(sorted)
}

export function generateIdempotencyKey(type: string, payload: unknown): string {
  const input = `${type}|${canonicalJson(payload)}`
  return createHash('sha256').update(input).digest('hex')
}
