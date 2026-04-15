/**
 * OAuth 토큰 자동 갱신 데몬
 *
 * Athena의 _start_token_refresh_daemon() Python 구현과 동일한 방식:
 * - 5분마다 토큰 만료 시간 체크
 * - 만료 1시간 전부터 갱신 시도
 * - POST /v1/oauth/token (refresh_token 사용)
 * - 갱신 성공 시 credentials 파일 업데이트 + process.env 반영
 * - cron 갱신 실패 시 백업 역할
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import path from 'path';
import { proxyFetch } from './proxy';

const OAUTH_REFRESH_URL = 'https://console.anthropic.com/v1/oauth/token';
const OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const REFRESH_MARGIN_MS = 14_400_000;  // 만료 4시간 전부터 갱신 (Mac RT 경합 방지)
const CHECK_INTERVAL_MS = 300_000;     // 5분마다 체크
const MAX_REFRESH_FAILURES = 10;       // 최대 연속 실패 후 갱신 중단

interface OAuthState {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number;  // Unix timestamp (ms)
  lastRefresh: number;
  refreshFailures: number;
}

const state: OAuthState = {
  accessToken: null,
  refreshToken: null,
  expiresAt: 0,
  lastRefresh: 0,
  refreshFailures: 0,
};

let daemonStarted = false;

function getCredentialsPaths(): string[] {
  const home = process.env.HOME || '/app/data/.claude-home';
  return [
    path.join(home, '.claude', '.credentials.json'),
    '/host-claude/.credentials.json',
  ];
}

function parseCredentials(): boolean {
  for (const credPath of getCredentialsPaths()) {
    try {
      if (!existsSync(credPath)) continue;
      const raw = readFileSync(credPath, 'utf-8');
      const data = JSON.parse(raw);
      const oauth = data?.claudeAiOauth;
      if (oauth?.accessToken) {
        state.accessToken = oauth.accessToken;
        state.refreshToken = oauth.refreshToken || null;
        state.expiresAt = oauth.expiresAt || 0;
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

function isTokenExpiring(): boolean {
  if (!state.accessToken) return false;
  const remainingMs = state.expiresAt - Date.now();
  return remainingMs <= REFRESH_MARGIN_MS;
}

/**
 * 실패 횟수에 따른 backoff 간격 계산 (ms)
 * 1회: 즉시, 2회: 1분, 3회: 2분, 4회: 4분, ... 최대 10분
 */
function getBackoffMs(): number {
  if (state.refreshFailures <= 1) return 0;
  const backoff = Math.min(60_000 * Math.pow(2, state.refreshFailures - 2), 600_000);
  return backoff;
}

function shouldSkipByBackoff(): boolean {
  if (state.refreshFailures <= 1) return false;
  const elapsed = Date.now() - state.lastRefresh;
  const backoff = getBackoffMs();
  if (elapsed < backoff) {
    return true;
  }
  return false;
}

async function refreshOAuthToken(): Promise<boolean> {
  if (!state.refreshToken) return false;

  // 최대 실패 횟수 초과 시 중단 (refreshToken 소진 가능성)
  if (state.refreshFailures >= MAX_REFRESH_FAILURES) {
    console.error(
      `[token-refresh] Max failures (${MAX_REFRESH_FAILURES}) reached. ` +
      'RefreshToken may be consumed. Manual /retoken required.'
    );
    return false;
  }

  try {
    const resp = await proxyFetch(OAUTH_REFRESH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: state.refreshToken,
        client_id: OAUTH_CLIENT_ID,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      state.refreshFailures++;
      state.lastRefresh = Date.now();
      console.warn(`[token-refresh] OAuth refresh failed: ${resp.status} (failures: ${state.refreshFailures})`);
      // 2회 이상 실패 시 credentials 파일 재읽기 (외부에서 갱신됐을 수 있음)
      if (state.refreshFailures >= 2) {
        parseCredentials();
        console.log('[token-refresh] Reparsed credentials after failure');
      }
      return false;
    }

    const data = await resp.json();
    const newAccess = data.access_token;
    const newRefresh = data.refresh_token || state.refreshToken;

    if (!newAccess) {
      state.refreshFailures++;
      state.lastRefresh = Date.now();
      console.warn('[token-refresh] No access_token in response');
      return false;
    }

    // expiresAt 계산: expires_in(초) 기반 → expires_at fallback
    let newExpires: number;
    if (data.expires_in && typeof data.expires_in === 'number') {
      // API 표준 응답: expires_in (초 단위)
      newExpires = Math.round((Date.now() / 1000 + data.expires_in) * 1000);
    } else if (data.expires_at) {
      // fallback: expires_at (초 또는 ms 단위)
      const rawExpires = data.expires_at;
      newExpires = rawExpires > 1e12 ? rawExpires : rawExpires * 1000;
    } else {
      // 둘 다 없으면 기본 8시간
      newExpires = Date.now() + 28800 * 1000;
    }

    state.accessToken = newAccess;
    state.refreshToken = newRefresh;
    state.expiresAt = newExpires;
    state.lastRefresh = Date.now();
    state.refreshFailures = 0;

    // OAuth 토큰은 .credentials.json으로만 전달 (ANTHROPIC_API_KEY에 설정하면 CLI가 API 키로 인식)

    // credentials 파일에 저장 (쓰기 가능한 경로)
    persistCredentials(newAccess, newRefresh, newExpires);

    const remainingMin = Math.round((newExpires - Date.now()) / 60000);
    console.log(`[token-refresh] Token refreshed, expires in ${remainingMin} min`);
    return true;
  } catch (err) {
    state.refreshFailures++;
    state.lastRefresh = Date.now();
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[token-refresh] Refresh error: ${msg} (failures: ${state.refreshFailures})`);
    return false;
  }
}

function persistCredentials(accessToken: string, refreshToken: string, expiresAt: number): void {
  const credPaths = getCredentialsPaths();

  for (const credPath of credPaths) {
    try {
      let existing: Record<string, unknown> = {};
      if (existsSync(credPath)) {
        existing = JSON.parse(readFileSync(credPath, 'utf-8'));
      }
      existing.claudeAiOauth = {
        ...(existing.claudeAiOauth as Record<string, unknown>),
        accessToken,
        refreshToken,
        expiresAt,
      };

      const dir = path.dirname(credPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      // atomic write via temp file
      const tmpPath = credPath + '.tmp';
      writeFileSync(tmpPath, JSON.stringify(existing));
      renameSync(tmpPath, credPath);
      console.log(`[token-refresh] Credentials persisted to ${credPath}`);
    } catch {
      // symlink to ro mount 등 쓰기 실패 — 다음 경로 시도
      continue;
    }
  }
  console.warn('[token-refresh] Could not persist credentials to any path (ro mount?)');
}

function daemonLoop(): void {
  setInterval(() => {
    try {
      // 실제 API 키(sk-ant-api)면 OAuth 갱신 불필요
      const envKey = process.env.ANTHROPIC_API_KEY || '';
      if (envKey && !envKey.startsWith('sk-ant-oat')) return;

      // credentials 재파싱 (외부 갱신 감지)
      parseCredentials();

      if (isTokenExpiring()) {
        // exponential backoff 체크
        if (shouldSkipByBackoff()) {
          const waitSec = Math.round(getBackoffMs() / 1000);
          console.log(`[token-refresh] Backing off (${waitSec}s), skipping this cycle`);
          return;
        }

        console.log('[token-refresh] Token expiring soon, triggering refresh...');
        refreshOAuthToken().then((success) => {
          if (!success) {
            // 갱신 실패 → credentials 파일 재읽기 (cron이 갱신했을 수 있음)
            parseCredentials();
            if (!isTokenExpiring()) {
              console.log('[token-refresh] Token recovered from file (cron refresh)');
              state.refreshFailures = 0;
            }
          }
        });
      }
    } catch (err) {
      console.error('[token-refresh] Daemon loop error:', err);
    }
  }, CHECK_INTERVAL_MS);
}

/**
 * 토큰 갱신 데몬 시작 (프로세스당 1회)
 */
export function startTokenRefreshDaemon(): void {
  if (daemonStarted) return;
  daemonStarted = true;

  // 초기 credentials 로드
  if (parseCredentials()) {
    const remainingMin = Math.round((state.expiresAt - Date.now()) / 60000);
    console.log(`[token-refresh] Daemon started. Token expires in ${remainingMin} min`);

    // 즉시 만료 체크
    if (isTokenExpiring()) {
      console.log('[token-refresh] Token expiring soon, immediate refresh...');
      refreshOAuthToken();
    }
  } else {
    console.warn('[token-refresh] Daemon started but no credentials found');
  }

  daemonLoop();
}

/**
 * 현재 OAuth 상태 반환 (health check / 디버깅용)
 */
export function getTokenStatus(): {
  hasToken: boolean;
  expiresAt: number;
  remainingMin: number;
  refreshFailures: number;
  maxFailures: number;
  daemonRunning: boolean;
} {
  return {
    hasToken: !!state.accessToken,
    expiresAt: state.expiresAt,
    remainingMin: Math.round((state.expiresAt - Date.now()) / 60000),
    refreshFailures: state.refreshFailures,
    maxFailures: MAX_REFRESH_FAILURES,
    daemonRunning: daemonStarted,
  };
}
