const SELENIUM_URL = process.env.SELENIUM_URL || 'http://localhost:4444'
const NOVNC_URL = process.env.NOVNC_URL || 'http://localhost:7900'
const SESSION_TIMEOUT_MS = 10 * 60 * 1000 // 10분

interface LoginSession {
  userId: string
  webdriverSessionId: string
  timer: ReturnType<typeof setTimeout>
}

const sessions = new Map<string, LoginSession>()

function generateSessionId(): string {
  return `bl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Selenium WebDriver로 브라우저 세션 생성 → suno.com 이동 → noVNC URL 반환
 */
export async function createLoginSession(userId: string): Promise<{
  sessionId: string
  liveUrl: string
}> {
  // 기존 세션 전부 정리 (Selenium + 앱 Map)
  for (const [id, session] of sessions.entries()) {
    if (session.userId === userId) {
      await destroySession(id, userId)
    }
  }
  // Selenium에 남아있는 세션도 정리
  try {
    const statusRes = await fetch(`${SELENIUM_URL}/status`)
    const statusData = await statusRes.json()
    for (const node of statusData.value?.nodes || []) {
      for (const slot of node.slots || []) {
        const sess = slot.session
        if (sess?.sessionId) {
          await fetch(`${SELENIUM_URL}/session/${sess.sessionId}`, { method: 'DELETE' }).catch(() => {})
        }
      }
    }
  } catch {
    // 정리 실패해도 계속 진행
  }

  const sessionId = generateSessionId()

  // WebDriver 세션 생성
  const createRes = await fetch(`${SELENIUM_URL}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      capabilities: {
        alwaysMatch: {
          browserName: 'chrome',
          'goog:chromeOptions': {
            args: [
              '--window-size=1280,720',
              '--disable-blink-features=AutomationControlled',
              '--kiosk',
            ],
            excludeSwitches: ['enable-automation'],
            useAutomationExtension: false,
          },
        },
      },
    }),
  })
  const createData = await createRes.json()
  const webdriverSessionId = createData.value?.sessionId
  if (!webdriverSessionId) {
    throw new Error('Selenium 세션 생성 실패')
  }

  // suno.com으로 이동
  await fetch(`${SELENIUM_URL}/session/${webdriverSessionId}/url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://suno.com' }),
  })

  // 쿠키 배너 자동 닫기 ("Accept All Cookies" 클릭)
  try {
    await fetch(
      `${SELENIUM_URL}/session/${webdriverSessionId}/chromium/send_command_and_get_result`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cmd: 'Runtime.evaluate',
          params: {
            expression: `
              setTimeout(() => {
                const btn = document.querySelector('button[id*="accept"], button.onetrust-accept-btn-handler')
                  || [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Accept All'));
                if (btn) btn.click();
              }, 2000);
            `,
          },
        }),
      }
    )
  } catch {
    // 배너 없으면 무시
  }

  // noVNC URL (자동 연결 + 스케일링)
  const liveUrl = `${NOVNC_URL}/?autoconnect=1&resize=scale`

  // 타임아웃 자동 정리
  const timer = setTimeout(() => {
    destroySession(sessionId).catch(() => {})
  }, SESSION_TIMEOUT_MS)

  sessions.set(sessionId, {
    userId,
    webdriverSessionId,
    timer,
  })

  return { sessionId, liveUrl }
}

/**
 * 세션의 로그인 상태를 확인. WebDriver로 쿠키를 가져와 __client 확인.
 */
export async function pollSession(sessionId: string, userId: string): Promise<{
  status: 'pending' | 'logged_in' | 'not_found' | 'error'
  cookie?: string
  label?: string
}> {
  const session = sessions.get(sessionId)
  if (!session || session.userId !== userId) {
    return { status: 'not_found' }
  }

  try {
    // CDP로 httpOnly __client 쿠키 가져오기
    const cdpRes = await fetch(
      `${SELENIUM_URL}/session/${session.webdriverSessionId}/chromium/send_command_and_get_result`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: 'Network.getAllCookies', params: {} }),
      }
    )
    const cdpData = await cdpRes.json()
    const cookies: Array<{ name: string; value: string }> = cdpData.value?.cookies || []

    const clientCookie = cookies.find(c => c.name === '__client')
    if (!clientCookie) {
      return { status: 'pending' }
    }

    // __client 쿠키가 있어도 게스트일 수 있음 — Clerk API로 실제 로그인 확인
    const clerkRes = await fetch('https://clerk.suno.com/v1/client', {
      headers: {
        Cookie: `__client=${clientCookie.value}`,
        'User-Agent': 'Mozilla/5.0',
        Origin: 'https://suno.com',
      },
    })
    const clerkData = await clerkRes.json()
    const activeSessions = (clerkData.response?.sessions || [])
      .filter((s: { status: string }) => s.status === 'active')

    if (activeSessions.length === 0) {
      return { status: 'pending' } // 게스트 쿠키 — 아직 로그인 안 됨
    }

    // 로그인된 사용자 이메일 추출
    const user = activeSessions[0].user || {}
    const email = user.email_addresses?.[0]?.email_address
    const label = email || `Suno (브라우저 로그인 ${new Date().toLocaleDateString('ko-KR')})`

    // SunoApi가 cookie.parse()로 파싱하므로 key=value; 형태로 반환
    const cookieString = cookies
      .map((c: { name: string; value: string }) => `${c.name}=${c.value}`)
      .join('; ')

    return {
      status: 'logged_in',
      cookie: cookieString,
      label,
    }
  } catch (e) {
    console.error('[browser-login] poll error:', e)
    return { status: 'error' }
  }
}

/**
 * 세션 정리 — WebDriver 세션 삭제
 */
export async function destroySession(sessionId: string, userId?: string): Promise<boolean> {
  const session = sessions.get(sessionId)
  if (!session) return false
  if (userId && session.userId !== userId) return false

  clearTimeout(session.timer)

  try {
    await fetch(`${SELENIUM_URL}/session/${session.webdriverSessionId}`, {
      method: 'DELETE',
    })
  } catch {
    // 이미 삭제됨
  }

  sessions.delete(sessionId)
  return true
}
