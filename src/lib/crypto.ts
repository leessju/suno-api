import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? ''
  if (!secret) throw new Error('BETTER_AUTH_SECRET not set')
  // SHA-256으로 32바이트 키 생성
  return createHash('sha256').update(secret).digest()
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // iv(12) + tag(16) + encrypted → base64
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

export function decrypt(ciphertext: string): string {
  const key = getKey()
  const buf = Buffer.from(ciphertext, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const encrypted = buf.subarray(28)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
