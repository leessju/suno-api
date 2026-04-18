import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { requireUser } from '@/lib/auth/guards'
import { createLoginSession } from '@/lib/music-gen/browser-login'

export async function POST() {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const { sessionId, liveUrl } = await createLoginSession(user.id)

    return ok({ sessionId, liveUrl })
  } catch (e) {
    console.error('[browser-login] create error:', e)
    return handleError(e)
  }
}
