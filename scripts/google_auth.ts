#!/usr/bin/env npx tsx
/**
 * Suno Google OAuth 자동 로그인 스크립트
 *
 * __client 쿠키가 만료되었을 때 Google OAuth로 재로그인하여
 * 새 __client 쿠키를 획득하고 .env를 자동 업데이트합니다.
 *
 * 사용법:
 *   npx tsx scripts/google_auth.ts
 *
 * 필수 .env 변수:
 *   GOOGLE_EMAIL=your@gmail.com
 *   GOOGLE_PASSWORD=your_password
 *
 * 선택 .env 변수:
 *   BROWSER_HEADLESS=false (기본: false — Google OAuth는 headed 권장)
 */

import { chromium } from 'rebrowser-playwright-core';
import * as fs from 'fs';
import * as path from 'path';

// dotenv 없이 직접 .env 파싱
const envPath = path.join(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const GOOGLE_EMAIL = process.env.GOOGLE_EMAIL;
const GOOGLE_PASSWORD = process.env.GOOGLE_PASSWORD;
const ENV_PATH = path.join(process.cwd(), '.env');

if (!GOOGLE_EMAIL || !GOOGLE_PASSWORD) {
  console.error('❌ GOOGLE_EMAIL과 GOOGLE_PASSWORD를 .env에 설정해주세요');
  process.exit(1);
}

async function login() {
  console.log('🚀 Suno Google OAuth 자동 로그인 시작...\n');

  // 1. 브라우저 실행 (headed — Google은 headless 차단할 수 있음)
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  const context = await browser.newContext({
    locale: 'en',
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  try {
    // 2. Suno 홈페이지 이동
    console.log('📍 suno.com 접속...');
    await page.goto('https://suno.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 3. 로그인 버튼 클릭
    console.log('🔑 로그인 버튼 찾는 중...');

    // "Sign In" 또는 "Log In" 또는 "Make a song" 버튼 찾기
    const signInSelectors = [
      'text=Sign In',
      'text=Sign in',
      'text=Log In',
      'text=Log in',
      'text=Make a song',
      '[data-testid="sign-in-button"]',
      'button:has-text("Sign")',
    ];

    let clicked = false;
    for (const selector of signInSelectors) {
      try {
        const el = page.locator(selector).first();
        if (await el.isVisible({ timeout: 2000 })) {
          await el.click();
          clicked = true;
          console.log(`  ✅ "${selector}" 클릭`);
          break;
        }
      } catch { /* try next */ }
    }

    if (!clicked) {
      console.log('  ⚠️ 로그인 버튼 못 찾음 — 이미 로그인 상태이거나 UI 변경됨');
      console.log('  현재 URL:', page.url());
      // 스크린샷 저장
      await page.screenshot({ path: '/tmp/suno_auth_debug.png' });
      console.log('  스크린샷: /tmp/suno_auth_debug.png');
    }

    await page.waitForTimeout(2000);

    // 4. "Continue with Google" 클릭 + 팝업 대기
    console.log('🔗 Google OAuth 시작...');

    // 팝업을 먼저 대기한 후 클릭
    const popupPromise = context.waitForEvent('page', { timeout: 15000 });

    const googleSelectors = [
      'button:has-text("Continue with Google")',
      'button:has-text("Google")',
      '[data-provider="google"]',
      '.cl-socialButtonsBlockButton__google',
      'button:has-text("구글")',
    ];

    clicked = false;
    for (const selector of googleSelectors) {
      try {
        const el = page.locator(selector).first();
        if (await el.isVisible({ timeout: 3000 })) {
          await el.click();
          clicked = true;
          console.log(`  ✅ "${selector}" 클릭`);
          break;
        }
      } catch { /* try next */ }
    }

    if (!clicked) {
      console.log('  ❌ Google 로그인 버튼 못 찾음');
      await page.screenshot({ path: '/tmp/suno_auth_google_debug.png' });
      console.log('  스크린샷: /tmp/suno_auth_google_debug.png');
      throw new Error('Google login button not found');
    }

    // 5. Google 팝업 처리
    console.log('📱 Google 팝업 대기...');
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    console.log('  ✅ 팝업 열림:', popup.url());

    // 6. 이메일 입력
    console.log('📧 이메일 입력...');
    await popup.waitForSelector('input[type="email"]', { timeout: 10000 });
    await popup.fill('input[type="email"]', GOOGLE_EMAIL!);
    await popup.waitForTimeout(500);

    // Next 버튼 클릭
    const nextSelectors = ['#identifierNext', 'button:has-text("Next")', 'button:has-text("다음")'];
    for (const selector of nextSelectors) {
      try {
        const btn = popup.locator(selector).first();
        if (await btn.isVisible({ timeout: 2000 })) {
          await btn.click();
          console.log('  ✅ 이메일 제출');
          break;
        }
      } catch { /* try next */ }
    }

    await popup.waitForTimeout(3000);

    // 7. 비밀번호 입력
    console.log('🔒 비밀번호 입력...');
    await popup.waitForSelector('input[type="password"]', { timeout: 10000 });
    await popup.fill('input[type="password"]', GOOGLE_PASSWORD!);
    await popup.waitForTimeout(500);

    // Next 버튼 클릭
    const pwdNextSelectors = ['#passwordNext', 'button:has-text("Next")', 'button:has-text("다음")'];
    for (const selector of pwdNextSelectors) {
      try {
        const btn = popup.locator(selector).first();
        if (await btn.isVisible({ timeout: 2000 })) {
          await btn.click();
          console.log('  ✅ 비밀번호 제출');
          break;
        }
      } catch { /* try next */ }
    }

    // 8. 팝업 닫힘 + suno.com 리다이렉트 대기
    console.log('⏳ 인증 완료 대기...');

    // 팝업이 닫히거나 리다이렉트될 때까지 대기
    try {
      await popup.waitForEvent('close', { timeout: 30000 });
      console.log('  ✅ 팝업 닫힘');
    } catch {
      console.log('  ⚠️ 팝업 닫힘 타임아웃 — 현재 URL:', popup.url());
      await popup.screenshot({ path: '/tmp/suno_auth_popup_debug.png' });
    }

    // suno.com이 로그인 상태가 될 때까지 대기
    await page.waitForTimeout(5000);

    // Clerk 인증 응답 대기
    try {
      await page.waitForResponse(
        response => response.url().includes('auth.suno.com/v1/client') && response.status() === 200,
        { timeout: 15000 }
      );
      console.log('  ✅ Clerk 인증 완료');
    } catch {
      console.log('  ⚠️ Clerk 응답 대기 타임아웃 — 계속 진행');
    }

    await page.waitForTimeout(3000);

    // 9. __client 쿠키 추출
    console.log('\n🍪 쿠키 추출...');
    const cookies = await context.cookies();

    const clientCookie = cookies.find(c => c.name === '__client');
    const clientUatCookie = cookies.find(c => c.name === '__client_uat' && c.value !== '0');
    const clientUatVariant = cookies.find(c => c.name.startsWith('__client_uat_') && c.value !== '0');

    if (!clientCookie) {
      console.log('  ❌ __client 쿠키를 찾을 수 없음');
      console.log('  현재 쿠키 목록:', cookies.map(c => c.name).join(', '));
      await page.screenshot({ path: '/tmp/suno_auth_nocookie_debug.png' });
      throw new Error('__client cookie not found');
    }

    console.log('  ✅ __client 쿠키 획득 (길이:', clientCookie.value.length, ')');
    if (clientUatCookie) console.log('  ✅ __client_uat:', clientUatCookie.value);
    if (clientUatVariant) console.log('  ✅', clientUatVariant.name, ':', clientUatVariant.value);

    // 10. 전체 쿠키를 SUNO_COOKIE 형식으로 조합
    const cookieString = cookies
      .filter(c => c.domain.includes('suno.com'))
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

    // 11. .env 파일 업데이트
    console.log('\n📝 .env 업데이트...');
    let envContent = fs.readFileSync(ENV_PATH, 'utf-8');

    // SUNO_COOKIE 라인 교체
    if (envContent.includes('SUNO_COOKIE=')) {
      envContent = envContent.replace(
        /SUNO_COOKIE=.*/,
        `SUNO_COOKIE=${cookieString}`
      );
    } else {
      envContent += `\nSUNO_COOKIE=${cookieString}\n`;
    }

    fs.writeFileSync(ENV_PATH, envContent);
    console.log('  ✅ .env 업데이트 완료');

    // 12. 검증 — 새 쿠키로 Clerk API 호출
    console.log('\n🔍 검증...');
    const verifyUrl = `https://auth.suno.com/v1/client?_is_native=true&_clerk_js_version=5.117.0&__clerk_api_version=2025-11-10`;
    const verifyResp = await fetch(verifyUrl, {
      headers: { Authorization: clientCookie.value }
    });

    if (verifyResp.ok) {
      const data = await verifyResp.json() as any;
      const sessionId = data?.response?.last_active_session_id;
      console.log('  ✅ 인증 성공! Session ID:', sessionId);
    } else {
      console.log('  ⚠️ 인증 검증 실패:', verifyResp.status);
    }

    console.log('\n✅ 완료! Suno API 서버를 재시작하세요.');
    console.log('   npm run dev\n');

  } catch (error) {
    console.error('\n❌ 에러:', error);
    await page.screenshot({ path: '/tmp/suno_auth_error.png' });
    console.log('  스크린샷: /tmp/suno_auth_error.png');
  } finally {
    await browser.close();
  }
}

login().catch(console.error);
