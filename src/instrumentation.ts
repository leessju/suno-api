/**
 * Next.js Instrumentation Hook
 * 서버 시작 시 AccountManager 데몬 + OAuth 브릿지 초기화
 *
 * 토큰 우선순위:
 *   1. CLAUDE_CODE_OAUTH_TOKEN env
 *   2. macOS Keychain "Claude Code-credentials" (Claude Code CLI가 관리)
 *   3. 기존 ~/.claude/.credentials.json (이미 존재하고 유효한 경우)
 */

function readKeychainToken(): string | null {
  // macOS only
  if (process.platform !== 'darwin') return null;
  try {
    const { execSync } = require('child_process') as typeof import('child_process');
    const username = process.env.USER || require('os').userInfo().username;
    const raw = execSync(
      `security find-generic-password -s "Claude Code-credentials" -a "${username}" -w 2>/dev/null`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const token = parsed?.claudeAiOauth?.accessToken;
    return token || null;
  } catch {
    return null;
  }
}

function syncCredentialsFromKeychain(): void {
  const { writeFileSync, readFileSync, existsSync, mkdirSync } = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');

  const home = process.env.HOME || process.env.USERPROFILE || require('os').homedir();
  const credDir = path.join(home, '.claude');
  const credPath = path.join(credDir, '.credentials.json');

  // 기존 파일이 유효한지 확인 (만료까지 10분 이상 남았으면 skip)
  if (existsSync(credPath)) {
    try {
      const existing = JSON.parse(readFileSync(credPath, 'utf-8'));
      const exp = existing?.claudeAiOauth?.expiresAt || 0;
      if (exp - Date.now() > 10 * 60 * 1000) {
        console.log('[Instrumentation] .credentials.json valid, skipping keychain sync');
        return;
      }
    } catch { /* 파싱 실패 시 계속 진행 */ }
  }

  // keychain에서 최신 토큰 읽기
  try {
    const { execSync } = require('child_process') as typeof import('child_process');
    const username = process.env.USER || require('os').userInfo().username;
    const raw = execSync(
      `security find-generic-password -s "Claude Code-credentials" -a "${username}" -w 2>/dev/null`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();
    if (!raw) return;

    const parsed = JSON.parse(raw);
    mkdirSync(credDir, { recursive: true });
    writeFileSync(credPath, JSON.stringify(parsed));
    const exp = parsed?.claudeAiOauth?.expiresAt || 0;
    const remainMin = Math.round((exp - Date.now()) / 60000);
    console.log(`[Instrumentation] Keychain → .credentials.json synced (expires in ${remainMin}m)`);
  } catch (err) {
    console.warn('[Instrumentation] Keychain sync failed:', err instanceof Error ? err.message : err);
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startAccountDaemon } = await import('./lib/utils/account-manager');
    const { writeFileSync, existsSync, mkdirSync } = await import('fs');
    const path = await import('path');

    const home = process.env.HOME || process.env.USERPROFILE || require('os').homedir();
    const credDir = path.default.join(home, '.claude');
    const credPath = path.default.join(credDir, '.credentials.json');

    // 1. CLAUDE_CODE_OAUTH_TOKEN env → .credentials.json (파일 없을 때만)
    const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    if (oauthToken && !existsSync(credPath)) {
      try {
        mkdirSync(credDir, { recursive: true });
        writeFileSync(credPath, JSON.stringify({
          claudeAiOauth: { accessToken: oauthToken, expiresAt: Date.now() + 8 * 3600 * 1000 }
        }));
        console.log('[Instrumentation] CLAUDE_CODE_OAUTH_TOKEN → .credentials.json');
      } catch (err) {
        console.warn('[Instrumentation] Token bridge failed:', err);
      }
    }

    // 2. macOS Keychain 동기화 (만료 임박 또는 파일 없을 때)
    syncCredentialsFromKeychain();

    // 5분마다 keychain 재동기화 (Claude Code CLI가 keychain을 자동 갱신)
    setInterval(syncCredentialsFromKeychain, 5 * 60 * 1000);

    // AccountManager 데몬 시작
    startAccountDaemon();
    console.log('[Instrumentation] AccountDaemon started');
  }
}
