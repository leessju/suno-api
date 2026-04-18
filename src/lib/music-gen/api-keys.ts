import { getDb } from '@/lib/music-gen/db'

export type KeyType =
  | 'youtube_api_key'
  | 'telegram_bot_token'
  | 'telegram_chat_id'
  | 'gemini_api_key'
  | 'two_captcha_key'

const ENV_MAP: Record<KeyType, string> = {
  youtube_api_key: 'YOUTUBE_API_KEY',
  telegram_bot_token: 'TELEGRAM_BOT_TOKEN',
  telegram_chat_id: 'TELEGRAM_CHAT_ID',
  gemini_api_key: 'GEMINI_API_KEY',
  two_captcha_key: 'TWO_CAPTCHA_KEY',
}

/**
 * DB에 저장된 값이 있으면 반환, 없으면 환경 변수 fallback.
 * userId를 생략하면 env 변수만 반환.
 */
export function getApiKey(keyType: KeyType, userId?: string): string | undefined {
  if (userId) {
    try {
      const db = getDb()
      const row = db
        .prepare('SELECT key_value FROM user_api_keys WHERE user_id = ? AND key_type = ?')
        .get(userId, keyType) as { key_value: string } | undefined
      if (row?.key_value) return row.key_value
    } catch {
      // DB 조회 실패 시 env fallback
    }
  }
  return process.env[ENV_MAP[keyType]] || undefined
}
