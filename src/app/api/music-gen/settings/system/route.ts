import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { requireUser } from '@/lib/auth/guards'
import {
  getAllSystemSettings,
  setSystemSetting,
  isSecretKey,
  maskValue,
  SYSTEM_SETTINGS,
  type SystemSettingKey,
} from '@/lib/music-gen/system-settings'

const VALID_KEYS = new Set(SYSTEM_SETTINGS.map(s => s.key))

export async function GET() {
  try {
    const { response } = await requireUser()
    if (response) return response

    const all = getAllSystemSettings()
    // 비밀 키 마스킹
    const masked: Record<string, { value: string; source: string }> = {}
    for (const [key, info] of Object.entries(all)) {
      masked[key] = {
        value: isSecretKey(key) && info.value ? maskValue(info.value) : info.value,
        source: info.source,
      }
    }
    return ok(masked)
  } catch (e) {
    return handleError(e)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { response } = await requireUser()
    if (response) return response

    const { key, value } = await req.json()
    if (!key || !VALID_KEYS.has(key)) {
      return err('INVALID_INPUT', `유효하지 않은 키: ${key}`, 400)
    }
    setSystemSetting(key as SystemSettingKey, value ?? '')
    return ok({ success: true })
  } catch (e) {
    return handleError(e)
  }
}
