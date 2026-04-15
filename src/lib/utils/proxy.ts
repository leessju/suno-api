/**
 * Proxy 유틸리티 모듈
 *
 * OAUTH_PROXY_URL 환경변수로 프록시 URL을 설정합니다.
 * 복수 URL은 콤마로 구분하며, 순차 시도 후 첫 성공한 프록시를 사용합니다.
 * 모든 프록시 실패 시 직접 연결로 fallback합니다.
 *
 * 환경변수 예시:
 *   OAUTH_PROXY_URL=http://user:pass@gate.decodo.com:10001,http://user:pass@gate.decodo.com:10002
 */

import { ProxyAgent } from 'undici';

/**
 * OAUTH_PROXY_URL 환경변수에서 프록시 URL 목록을 파싱합니다.
 */
function getProxyUrls(): string[] {
  const raw = process.env.OAUTH_PROXY_URL || '';
  if (!raw.trim()) return [];
  return raw.split(',').map((u) => u.trim()).filter(Boolean);
}

/**
 * 첫 번째 프록시 URL을 반환합니다 (Agent SDK subprocess env 전달용).
 */
export function getProxyUrl(): string | undefined {
  const urls = getProxyUrls();
  return urls.length > 0 ? urls[0] : undefined;
}

/**
 * 프록시를 경유하는 fetch wrapper.
 *
 * 동작 방식:
 * 1. OAUTH_PROXY_URL이 설정되어 있으면 프록시를 먼저 시도 (proxy-first)
 * 2. 순차적으로 각 프록시 URL을 시도
 * 3. 연결 실패(timeout, ECONNREFUSED 등)만 failover 대상
 *    - HTTP 4xx/5xx는 프록시 성공으로 간주하여 응답을 그대로 반환
 * 4. 모든 프록시 실패 시 직접 연결로 fallback
 * 5. OAUTH_PROXY_URL 미설정 시 일반 fetch()와 동일하게 동작
 */
export async function proxyFetch(
  url: string | URL,
  options?: RequestInit & { signal?: AbortSignal }
): Promise<Response> {
  const proxyUrls = getProxyUrls();

  // 프록시 미설정 → 직접 연결
  if (proxyUrls.length === 0) {
    return fetch(url, options);
  }

  // 프록시 순차 시도 (proxy-first)
  for (let i = 0; i < proxyUrls.length; i++) {
    try {
      const dispatcher = new ProxyAgent(proxyUrls[i]);
      const resp = await fetch(url, {
        ...options,
        // @ts-expect-error -- Node.js fetch (undici-backed) supports dispatcher option
        dispatcher,
      });
      // HTTP 응답 수신 = 프록시 연결 성공 (4xx/5xx 포함)
      console.log(`[proxy] Request via proxy #${i + 1} succeeded (status: ${resp.status})`);
      return resp;
    } catch (err) {
      // 연결 실패 → 다음 프록시 시도
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[proxy] Proxy #${i + 1} failed: ${msg}`);
    }
  }

  // 모든 프록시 실패 → 직접 연결 fallback
  console.warn('[proxy] All proxies failed, falling back to direct connection');
  return fetch(url, options);
}
