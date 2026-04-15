/**
 * 멀티 계정 관리자 (AccountManager)
 *
 * trade_alt의 Python AccountManager와 동일한 방식:
 * - ~/.claude/credentials/account-N.json 자동 탐색
 * - 429 rate limit 시 스마트 계정 전환
 * - 5분 쿨다운으로 과도한 전환 방지
 * - 모든 계정의 토큰 독립 갱신
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'fs';
import path from 'path';
import { proxyFetch } from './proxy';

const OAUTH_REFRESH_URL = 'https://console.anthropic.com/v1/oauth/token';
const OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const REFRESH_MARGIN_MS = 14_400_000;   // 만료 4시간 전부터 갱신 (Mac RT 경합 방지, 버그 6)
const CHECK_INTERVAL_MS = 300_000;      // 5분마다 체크
const SWITCH_COOLDOWN_MS = 300_000;     // 전환 쿨다운 5분
const MAX_REFRESH_FAILURES = 5;         // 계정당 최대 갱신 실패

interface AccountSlot {
  slot: number;
  path: string;
  hostPath: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number;         // ms timestamp
  lastRateLimit: number;     // Date.now()
  lastSuccess: number;       // Date.now()
  refreshFailures: number;
}

interface CredentialsJson {
  claudeAiOauth?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  };
}

let _instance: AccountManager | null = null;
let _daemonStarted = false;

export class AccountManager {
  private accounts: AccountSlot[] = [];
  private activeSlot: number = 0;
  private lastSwitch: number = 0;

  constructor() {
    this._discoverAccounts();
    // 시작 시 최적 슬롯 자동 선택 (expiresAt 기준)
    this._selectInitialSlot();
    // 활성 슬롯 → .credentials.json 동기화
    this._writeActiveCredentials();
  }

  get accountCount(): number {
    return this.accounts.length;
  }

  get activeAccount(): AccountSlot | null {
    return this.accounts.find(a => a.slot === this.activeSlot) || null;
  }

  /**
   * ~/.claude/credentials/account-*.json 자동 탐색
   * 없으면 .credentials.json을 slot 0으로 사용 (하위 호환)
   */
  private _discoverAccounts(): void {
    const home = process.env.HOME || '/app/data/.claude-home';
    const credDir = path.join(home, '.claude', 'credentials');
    const hostCredDir = '/host-claude/credentials';
    const activeCred = path.join(home, '.claude', '.credentials.json');

    // 멀티 계정 디렉토리 탐색
    if (existsSync(credDir)) {
      try {
        const files = readdirSync(credDir)
          .filter(f => /^account-\d+\.json$/.test(f))
          .sort();

        for (const file of files) {
          const match = file.match(/^account-(\d+)\.json$/);
          if (!match) continue;

          const slot = parseInt(match[1], 10);
          const filePath = path.join(credDir, file);
          const hostPath = existsSync(hostCredDir)
            ? path.join(hostCredDir, file)
            : null;

          const cred = this._readCredentials(filePath);
          this.accounts.push({
            slot,
            path: filePath,
            hostPath,
            accessToken: cred?.claudeAiOauth?.accessToken || null,
            refreshToken: cred?.claudeAiOauth?.refreshToken || null,
            expiresAt: cred?.claudeAiOauth?.expiresAt || 0,
            lastRateLimit: 0,
            lastSuccess: 0,
            refreshFailures: 0,
          });
        }
      } catch (err) {
        console.warn('[AccountManager] Error reading credentials dir:', err);
      }
    }

    // 멀티 계정이 없으면 단일 .credentials.json을 slot 0으로
    if (this.accounts.length === 0 && existsSync(activeCred)) {
      const cred = this._readCredentials(activeCred);
      this.accounts.push({
        slot: 0,
        path: activeCred,
        hostPath: existsSync('/host-claude/.credentials.json')
          ? '/host-claude/.credentials.json'
          : null,
        accessToken: cred?.claudeAiOauth?.accessToken || null,
        refreshToken: cred?.claudeAiOauth?.refreshToken || null,
        expiresAt: cred?.claudeAiOauth?.expiresAt || 0,
        lastRateLimit: 0,
        lastSuccess: 0,
        refreshFailures: 0,
      });
    }

    if (this.accounts.length > 0) {
      console.log(`[AccountManager] Discovered ${this.accounts.length} account(s)`);
    }
  }

  /**
   * 스마트 선택: lastRateLimit 이후 시간이 가장 긴 계정
   */
  selectBestAccount(): AccountSlot | null {
    if (this.accounts.length === 0) return null;
    if (this.accounts.length === 1) return this.accounts[0];

    const now = Date.now();
    // 유효한 계정만 필터링 (만료되지 않고 실패 횟수 초과하지 않은)
    const valid = this.accounts.filter(
      a => a.accessToken && a.expiresAt > now && a.refreshFailures < MAX_REFRESH_FAILURES
    );
    if (valid.length === 0) return this.accounts[0]; // 모두 만료 시 폴백
    if (valid.length === 1) return valid[0];

    return valid.reduce((best, acc) => {
      const bestIdle = now - best.lastRateLimit;
      const accIdle = now - acc.lastRateLimit;
      return accIdle > bestIdle ? acc : best;
    });
  }

  /**
   * selectBestAccount() → .credentials.json atomic 교체
   * 5분 쿨다운으로 과도한 전환 방지
   */
  switchAccount(): AccountSlot | null {
    if (this.accounts.length <= 1) return this.activeAccount;

    const now = Date.now();
    if (now - this.lastSwitch < SWITCH_COOLDOWN_MS) {
      console.log('[AccountManager] Switch cooldown active, skipping');
      return this.activeAccount;
    }

    const best = this.selectBestAccount();
    if (!best || best.slot === this.activeSlot) {
      console.log('[AccountManager] No better account available');
      return this.activeAccount;
    }

    return this._doSwitch(best);
  }

  /**
   * 특정 슬롯으로 직접 전환 (API 수동 전환용)
   */
  switchToSlot(slot: number): AccountSlot | null {
    const target = this.accounts.find(a => a.slot === slot);
    if (!target) {
      console.warn(`[AccountManager] Slot ${slot} not found`);
      return null;
    }
    return this._doSwitch(target);
  }

  private _doSwitch(target: AccountSlot): AccountSlot | null {
    if (!target.accessToken) {
      console.warn(`[AccountManager] Slot ${target.slot} has no token`);
      return null;
    }

    const home = process.env.HOME || '/app/data/.claude-home';
    const activePath = path.join(home, '.claude', '.credentials.json');
    const hostActivePath = '/host-claude/.credentials.json';

    const credData: CredentialsJson = {
      claudeAiOauth: {
        accessToken: target.accessToken,
        refreshToken: target.refreshToken || undefined,
        expiresAt: target.expiresAt,
      },
    };

    // Atomic write
    this._atomicWrite(activePath, credData);
    if (existsSync('/host-claude')) {
      this._atomicWrite(hostActivePath, credData);
    }

    // OAuth 토큰은 .credentials.json으로만 전달 (ANTHROPIC_API_KEY에 설정하면 CLI가 API 키로 인식)

    const prevSlot = this.activeSlot;
    this.activeSlot = target.slot;
    this.lastSwitch = Date.now();

    console.log(`[AccountManager] Switched: slot ${prevSlot} → slot ${target.slot}`);
    return target;
  }

  /**
   * 429 발생 기록. slot 미지정 시 활성 슬롯
   */
  recordRateLimit(slot?: number): void {
    const targetSlot = slot ?? this.activeSlot;
    const acc = this.accounts.find(a => a.slot === targetSlot);
    if (acc) {
      acc.lastRateLimit = Date.now();
      console.log(`[AccountManager] Rate limit recorded for slot ${targetSlot}`);
    }
  }

  /**
   * 성공 기록
   */
  recordSuccess(slot?: number): void {
    const targetSlot = slot ?? this.activeSlot;
    const acc = this.accounts.find(a => a.slot === targetSlot);
    if (acc) {
      acc.lastSuccess = Date.now();
    }
  }

  /**
   * 모든 계정의 토큰을 개별 갱신
   * @param force - true이면 만료 여부와 무관하게 만료된 토큰 즉시 갱신
   */
  async refreshAllTokens(force: boolean = false): Promise<void> {
    for (const acc of this.accounts) {
      if (!acc.refreshToken) continue;
      if (acc.refreshFailures >= MAX_REFRESH_FAILURES) continue;

      const remainingMs = acc.expiresAt - Date.now();
      const isExpired = remainingMs <= 0;
      const isExpiringSoon = remainingMs <= REFRESH_MARGIN_MS;

      // 만료됐거나, 만료 1시간 이내이거나, force일 때 갱신
      if (!isExpired && !isExpiringSoon && !force) continue;

      try {
        const success = await this._refreshToken(acc);
        if (success) {
          acc.refreshFailures = 0;
        } else {
          acc.refreshFailures++;
          // 활성 슬롯 갱신 실패 → 다른 유효 슬롯으로 자동 전환
          if (acc.slot === this.activeSlot && this.accounts.length > 1) {
            const validOther = this.accounts.find(
              a => a.slot !== acc.slot && a.expiresAt > Date.now() && a.refreshFailures < MAX_REFRESH_FAILURES
            );
            if (validOther) {
              this._doSwitch(validOther);
              console.log(`[AccountManager] Active slot ${acc.slot} refresh failed → switched to slot ${validOther.slot}`);
            }
          }
        }
      } catch (err) {
        acc.refreshFailures++;
        console.error(`[AccountManager] Refresh failed for slot ${acc.slot}:`, err);
      }
    }

    // 전체 슬롯 health 로깅
    const healthy = this.accounts.filter(a => a.expiresAt > Date.now()).length;
    const dead = this.accounts.length - healthy;
    if (dead > 0) {
      console.warn(`[AccountManager] Slot health: ${healthy} healthy, ${dead} dead`);
    }
  }

  /**
   * 활성 계정의 credentials 파일이 최신인지 확인하고 동기화
   */
  ensureActiveCredentialsSynced(): void {
    const acc = this.activeAccount;
    if (!acc) return;

    // 파일에서 재읽기 (외부 갱신 감지 — start.js 데몬이 갱신한 토큰 반영)
    const cred = this._readCredentials(acc.path);
    if (!cred?.claudeAiOauth) return;

    const fileAT = cred.claudeAiOauth.accessToken;
    const fileRT = cred.claudeAiOauth.refreshToken;
    const fileExp = cred.claudeAiOauth.expiresAt || 0;

    // AT가 다르거나 expiresAt가 더 크면 업데이트 (데몬 갱신 반영)
    if ((fileAT && fileAT !== acc.accessToken) || fileExp > acc.expiresAt) {
      acc.accessToken = fileAT || null;
      acc.refreshToken = fileRT || null;
      acc.expiresAt = fileExp;
    }
  }

  /**
   * 계정 상태 조회 (API용)
   */
  getStatus(): {
    accounts: Array<{
      slot: number;
      active: boolean;
      hasToken: boolean;
      expiresInMin: number;
      lastRateLimit: number;
      refreshFailures: number;
    }>;
    strategy: string;
  } {
    const now = Date.now();
    return {
      accounts: this.accounts.map(acc => ({
        slot: acc.slot,
        active: acc.slot === this.activeSlot,
        hasToken: !!acc.accessToken,
        expiresInMin: Math.round((acc.expiresAt - now) / 60000),
        lastRateLimit: acc.lastRateLimit,
        refreshFailures: acc.refreshFailures,
      })),
      strategy: this.accounts.length > 1 ? 'multi' : 'single',
    };
  }

  /**
   * 활성 슬롯의 토큰을 .credentials.json에 동기화
   */
  _writeActiveCredentials(): void {
    const acc = this.activeAccount;
    if (!acc || !acc.accessToken) return;

    const home = process.env.HOME || '/app/data/.claude-home';
    const activePath = path.join(home, '.claude', '.credentials.json');
    const hostActivePath = '/host-claude/.credentials.json';

    const credData: CredentialsJson = {
      claudeAiOauth: {
        accessToken: acc.accessToken,
        refreshToken: acc.refreshToken || undefined,
        expiresAt: acc.expiresAt,
      },
    };

    this._atomicWrite(activePath, credData);
    if (existsSync('/host-claude')) {
      this._atomicWrite(hostActivePath, credData);
    }

    // OAuth 토큰은 .credentials.json으로만 전달
  }

  // --- Private helpers ---

  /**
   * 시작 시 expiresAt가 가장 긴 슬롯을 활성으로 선택
   */
  private _selectInitialSlot(): void {
    if (this.accounts.length <= 1) return;

    const best = this.accounts.reduce((a, b) => (b.expiresAt > a.expiresAt ? b : a));
    if (best.slot !== this.activeSlot && best.accessToken) {
      this.activeSlot = best.slot;
      console.log(`[AccountManager] Initial slot selected: ${best.slot} (expires in ${Math.round((best.expiresAt - Date.now()) / 60000)} min)`);
    }
  }

  private async _refreshToken(acc: AccountSlot, retried = false): Promise<boolean> {
    if (!acc.refreshToken) return false;

    try {
      const resp = await proxyFetch(OAUTH_REFRESH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: acc.refreshToken,
          client_id: OAUTH_CLIENT_ID,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!resp.ok) {
        console.warn(`[AccountManager] Refresh failed for slot ${acc.slot}: ${resp.status}`);
        // 400 invalid_grant → 호스트에서 RT 복구 시도 (Mac이 RT를 먼저 소비한 경우)
        if (resp.status === 400 && !retried) {
          const recovered = this._tryRecoverFromHost(acc);
          if (recovered) {
            console.log(`[AccountManager] Slot ${acc.slot} RT recovered from host, retrying...`);
            return this._refreshToken(acc, true); // 복구된 RT로 1회만 재시도
          }
        }
        return false;
      }

      const data = await resp.json();
      const newAccess = data.access_token;
      const newRefresh = data.refresh_token || acc.refreshToken;

      if (!newAccess) return false;

      let newExpires: number;
      if (data.expires_in && typeof data.expires_in === 'number') {
        newExpires = Math.round((Date.now() / 1000 + data.expires_in) * 1000);
      } else if (data.expires_at) {
        newExpires = data.expires_at > 1e12 ? data.expires_at : data.expires_at * 1000;
      } else {
        newExpires = Date.now() + 28800 * 1000;
      }

      acc.accessToken = newAccess;
      acc.refreshToken = newRefresh;
      acc.expiresAt = newExpires;

      // 파일 저장
      const credData: CredentialsJson = {
        claudeAiOauth: { accessToken: newAccess, refreshToken: newRefresh, expiresAt: newExpires },
      };

      this._atomicWrite(acc.path, credData);
      if (acc.hostPath) {
        this._atomicWrite(acc.hostPath, credData);
      }

      // 활성 슬롯이면 .credentials.json + env도 업데이트
      if (acc.slot === this.activeSlot) {
        const home = process.env.HOME || '/app/data/.claude-home';
        const activePath = path.join(home, '.claude', '.credentials.json');
        this._atomicWrite(activePath, credData);
        if (existsSync('/host-claude')) {
          this._atomicWrite('/host-claude/.credentials.json', credData);
        }
        // OAuth 토큰은 .credentials.json으로만 전달
      }

      const remainMin = Math.round((newExpires - Date.now()) / 60000);
      console.log(`[AccountManager] Slot ${acc.slot} refreshed, expires in ${remainMin} min`);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[AccountManager] Refresh error slot ${acc.slot}: ${msg}`);
      return false;
    }
  }

  /**
   * refresh 400 시 호스트 마운트에서 최신 RT 복구 (Mac이 RT를 먼저 소비한 경우)
   */
  private _tryRecoverFromHost(acc: AccountSlot): boolean {
    const hostCredDir = '/host-claude/credentials';
    if (!existsSync(hostCredDir)) return false;

    const fileName = `account-${acc.slot}.json`;
    const hostPath = path.join(hostCredDir, fileName);
    if (!existsSync(hostPath)) return false;

    const hostCred = this._readCredentials(hostPath);
    const hostRT = hostCred?.claudeAiOauth?.refreshToken;

    // 호스트 RT가 현재와 다르면 (/retoken으로 새 RT가 들어왔을 수 있음)
    if (hostRT && hostRT !== acc.refreshToken) {
      acc.refreshToken = hostRT;
      acc.accessToken = hostCred?.claudeAiOauth?.accessToken || acc.accessToken;
      acc.expiresAt = hostCred?.claudeAiOauth?.expiresAt || acc.expiresAt;

      // 로컬 파일도 업데이트
      this._atomicWrite(acc.path, {
        claudeAiOauth: {
          accessToken: acc.accessToken || undefined,
          refreshToken: acc.refreshToken,
          expiresAt: acc.expiresAt,
        },
      });

      console.log(`[AccountManager] Slot ${acc.slot} RT recovered from host`);
      return true;
    }
    return false;
  }

  private _readCredentials(filePath: string): CredentialsJson | null {
    try {
      if (!existsSync(filePath)) return null;
      return JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  private _atomicWrite(filePath: string, data: CredentialsJson): void {
    try {
      // 기존 데이터 병합
      let existing: Record<string, unknown> = {};
      if (existsSync(filePath)) {
        try { existing = JSON.parse(readFileSync(filePath, 'utf-8')); } catch { /* */ }
      }
      existing.claudeAiOauth = data.claudeAiOauth;

      const dir = path.dirname(filePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      const tmpPath = filePath + `.${process.pid}.tmp`;
      writeFileSync(tmpPath, JSON.stringify(existing));
      renameSync(tmpPath, filePath);
    } catch (err) {
      console.warn(`[AccountManager] _atomicWrite failed for ${filePath}:`, err instanceof Error ? err.message : err);
    }
  }
}

/**
 * 싱글톤 AccountManager 반환
 */
export function getAccountManager(): AccountManager | null {
  if (!_instance) {
    _instance = new AccountManager();
    if (_instance.accountCount === 0) {
      _instance = null;
    }
  }
  return _instance;
}

/**
 * 멀티 계정 토큰 갱신 데몬 시작 (프로세스당 1회)
 */
export function startAccountDaemon(): void {
  if (_daemonStarted) return;
  _daemonStarted = true;

  const mgr = getAccountManager();
  if (!mgr) {
    console.log('[AccountManager] No accounts found, daemon not started');
    return;
  }

  console.log(`[AccountManager] Daemon started (${mgr.accountCount} account(s))`);

  // 시작 시 만료된 토큰 즉시 갱신
  mgr.refreshAllTokens(true).then(() => {
    mgr._writeActiveCredentials();
    console.log('[AccountManager] Initial token refresh complete');
  }).catch(err => {
    console.error('[AccountManager] Initial refresh error:', err);
  });

  setInterval(async () => {
    try {
      const mgr = getAccountManager();
      if (!mgr) return;

      // API 키(sk-ant-api)면 갱신 불필요
      const envKey = process.env.ANTHROPIC_API_KEY || '';
      if (envKey && !envKey.startsWith('sk-ant-oat')) return;

      await mgr.refreshAllTokens();
      // 매 사이클 활성 슬롯 → .credentials.json 동기화
      mgr._writeActiveCredentials();
    } catch (err) {
      console.error('[AccountManager] Daemon loop error:', err);
    }
  }, CHECK_INTERVAL_MS);
}

/**
 * 429 감지 시 계정 전환 처리
 */
export function handleRateLimitSwitch(): boolean {
  const mgr = getAccountManager();
  if (!mgr || mgr.accountCount <= 1) return false;

  mgr.recordRateLimit();
  const newAccount = mgr.switchAccount();
  if (newAccount) {
    console.log(`[AccountManager] Switched to slot ${newAccount.slot} after rate limit`);
    return true;
  }
  return false;
}

export { AccountManager as default };
