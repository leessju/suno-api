import { getDb } from './db'

export type SystemSettingKey =
  | 'cloudflare_account_id'
  | 'cloudflare_api_token'
  | 'r2_bucket_name'
  | 'r2_access_key_id'
  | 'r2_secret_access_key'
  | 'r2_endpoint'
  | 'suno_video_root'

const ENV_MAP: Record<SystemSettingKey, string> = {
  cloudflare_account_id: 'CLOUDFLARE_ACCOUNT_ID',
  cloudflare_api_token: 'CLOUDFLARE_API_TOKEN',
  r2_bucket_name: 'R2_BUCKET_NAME',
  r2_access_key_id: 'R2_ACCESS_KEY_ID',
  r2_secret_access_key: 'R2_SECRET_ACCESS_KEY',
  r2_endpoint: 'R2_ENDPOINT',
  suno_video_root: 'SUNO_VIDEO_ROOT',
}

const SECRET_KEYS: Set<SystemSettingKey> = new Set([
  'cloudflare_api_token',
  'r2_access_key_id',
  'r2_secret_access_key',
])

export interface SystemSettingConfig {
  key: SystemSettingKey
  label: string
  hint?: string
  secret: boolean
  group: string
}

export const SYSTEM_SETTINGS: SystemSettingConfig[] = [
  { key: 'cloudflare_account_id', label: 'Account ID', hint: 'Cloudflare 대시보드에서 확인', secret: false, group: 'Cloudflare / R2' },
  { key: 'cloudflare_api_token', label: 'API Token', hint: 'Cloudflare API 토큰', secret: true, group: 'Cloudflare / R2' },
  { key: 'r2_bucket_name', label: 'Bucket Name', hint: 'R2 버킷 이름', secret: false, group: 'Cloudflare / R2' },
  { key: 'r2_access_key_id', label: 'Access Key ID', hint: 'R2 액세스 키', secret: true, group: 'Cloudflare / R2' },
  { key: 'r2_secret_access_key', label: 'Secret Access Key', hint: 'R2 시크릿 키', secret: true, group: 'Cloudflare / R2' },
  { key: 'r2_endpoint', label: 'Endpoint', hint: 'R2 엔드포인트 URL', secret: false, group: 'Cloudflare / R2' },
  { key: 'suno_video_root', label: 'Suno Video Root', hint: 'suno-video 프로젝트 경로', secret: false, group: '경로 설정' },
]

/**
 * 시스템 설정값 조회 — DB(gem_global_settings) 우선, env 폴백.
 */
export function getSystemSetting(key: SystemSettingKey): string | undefined {
  try {
    const db = getDb()
    const row = db
      .prepare('SELECT value FROM gem_global_settings WHERE key = ?')
      .get(`sys_${key}`) as { value: string } | undefined
    if (row?.value) return row.value
  } catch { /* DB 조회 실패 시 env 폴백 */ }
  return process.env[ENV_MAP[key]] || undefined
}

export function setSystemSetting(key: SystemSettingKey, value: string): void {
  const db = getDb()
  const now = Date.now()
  db.prepare(`
    INSERT INTO gem_global_settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(`sys_${key}`, value, now)
}

export function getAllSystemSettings(): Record<string, { value: string; source: 'db' | 'env' | 'none' }> {
  const result: Record<string, { value: string; source: 'db' | 'env' | 'none' }> = {}
  const db = getDb()

  for (const key of Object.keys(ENV_MAP) as SystemSettingKey[]) {
    const dbRow = db
      .prepare('SELECT value FROM gem_global_settings WHERE key = ?')
      .get(`sys_${key}`) as { value: string } | undefined

    if (dbRow?.value) {
      result[key] = { value: dbRow.value, source: 'db' }
    } else {
      const envVal = process.env[ENV_MAP[key]]
      if (envVal) {
        result[key] = { value: envVal, source: 'env' }
      } else {
        result[key] = { value: '', source: 'none' }
      }
    }
  }
  return result
}

export function isSecretKey(key: string): boolean {
  return SECRET_KEYS.has(key as SystemSettingKey)
}

export function maskValue(value: string): string {
  if (!value || value.length <= 8) return '****'
  return value.slice(0, 8) + '****'
}
