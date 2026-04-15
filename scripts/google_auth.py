#!/usr/bin/env python3
"""
Suno Google OAuth 자동 로그인
__client 쿠키 만료 시 Google OAuth로 재로그인하여 .env 자동 업데이트

사용법: python3 scripts/google_auth.py
"""
import os, re, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ENV_PATH = Path(__file__).parent.parent / ".env"

# .env 파싱
env = {}
for line in ENV_PATH.read_text().splitlines():
    m = re.match(r'^([^#=]+)=(.*)$', line)
    if m:
        env[m.group(1).strip()] = m.group(2).strip()

GOOGLE_EMAIL = env.get("GOOGLE_EMAIL")
GOOGLE_PASSWORD = env.get("GOOGLE_PASSWORD")

if not GOOGLE_EMAIL or not GOOGLE_PASSWORD:
    print("❌ .env에 GOOGLE_EMAIL, GOOGLE_PASSWORD 설정 필요")
    exit(1)

def login():
    print("🚀 Suno Google OAuth 자동 로그인\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False,
            channel="chrome",  # 시스템 Chrome 사용
        )
        context = browser.new_context(locale="en", viewport={"width": 1280, "height": 800})
        page = context.new_page()

        try:
            # 1. suno.com 접속
            print("📍 suno.com 접속...")
            page.goto("https://suno.com", wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(3000)

            # 2. 로그인 버튼 클릭
            print("🔑 로그인 버튼 찾는 중...")
            for sel in ["text=Sign In", "text=Sign in", "text=Make a song", "text=Log in"]:
                try:
                    el = page.locator(sel).first
                    if el.is_visible(timeout=2000):
                        el.click()
                        print(f"  ✅ {sel} 클릭")
                        break
                except:
                    continue
            else:
                print("  ⚠️ 로그인 버튼 못 찾음")
                page.screenshot(path="/tmp/suno_auth_1.png")

            page.wait_for_timeout(2000)

            # 3. Google 버튼 클릭 (리다이렉트 방식)
            print("🔗 Google OAuth...")
            for sel in ['button:has-text("Continue with Google")', 'button:has-text("Google")']:
                try:
                    el = page.locator(sel).first
                    if el.is_visible(timeout=3000):
                        el.click()
                        print(f"  ✅ {sel} 클릭")
                        break
                except:
                    continue

            # Google 로그인 페이지 대기 (같은 탭에서 리다이렉트)
            page.wait_for_timeout(3000)

            # 4. 이메일 입력
            print("📧 이메일 입력...")
            page.wait_for_selector('input[type="email"]', timeout=10000)
            page.fill('input[type="email"]', GOOGLE_EMAIL)
            page.wait_for_timeout(500)

            for sel in ["#identifierNext", 'button:has-text("Next")', 'button:has-text("다음")']:
                try:
                    btn = page.locator(sel).first
                    if btn.is_visible(timeout=2000):
                        btn.click()
                        print("  ✅ 이메일 제출")
                        break
                except:
                    continue

            page.wait_for_timeout(3000)

            # 5. 비밀번호 입력
            print("🔒 비밀번호 입력...")
            page.wait_for_selector('input[type="password"]', timeout=10000)
            page.fill('input[type="password"]', GOOGLE_PASSWORD)
            page.wait_for_timeout(500)

            for sel in ["#passwordNext", 'button:has-text("Next")', 'button:has-text("다음")']:
                try:
                    btn = page.locator(sel).first
                    if btn.is_visible(timeout=2000):
                        btn.click()
                        print("  ✅ 비밀번호 제출")
                        break
                except:
                    continue

            # 6. 2FA 또는 추가 인증 대기 (수동 처리 가능)
            print("⏳ 인증 완료 대기 (2FA 뜨면 직접 처리, 최대 2분)...")
            try:
                page.wait_for_url("**/suno.com/**", timeout=120000)
                print("  ✅ suno.com 리다이렉트 완료")
            except:
                print("  ⚠️ 타임아웃")
                page.screenshot(path="/tmp/suno_auth_redirect.png")
                print("  스크린샷: /tmp/suno_auth_redirect.png")

            page.wait_for_timeout(5000)

            # 8. 쿠키 추출
            print("\n🍪 쿠키 추출...")
            cookies = context.cookies()
            suno_cookies = [c for c in cookies if "suno.com" in c["domain"]]

            client_cookie = next((c for c in cookies if c["name"] == "__client"), None)
            if not client_cookie:
                print("  ❌ __client 쿠키 없음")
                print("  쿠키:", [c["name"] for c in suno_cookies])
                page.screenshot(path="/tmp/suno_auth_nocookie.png")
                return

            print(f"  ✅ __client 획득 (길이: {len(client_cookie['value'])})")

            cookie_string = "; ".join(f'{c["name"]}={c["value"]}' for c in suno_cookies)

            # 9. .env 업데이트
            print("\n📝 .env 업데이트...")
            content = ENV_PATH.read_text()
            if "SUNO_COOKIE=" in content:
                content = re.sub(r'SUNO_COOKIE=.*', f'SUNO_COOKIE={cookie_string}', content)
            else:
                content += f'\nSUNO_COOKIE={cookie_string}\n'
            ENV_PATH.write_text(content)
            print("  ✅ 완료")

            # 10. 검증
            print("\n🔍 검증...")
            import urllib.request, json
            req = urllib.request.Request(
                "https://auth.suno.com/v1/client?_is_native=true&_clerk_js_version=5.117.0",
                headers={"Authorization": client_cookie["value"]}
            )
            try:
                resp = urllib.request.urlopen(req)
                data = json.loads(resp.read())
                sid = data.get("response", {}).get("last_active_session_id")
                print(f"  ✅ 인증 성공! Session ID: {sid}")
            except Exception as e:
                print(f"  ⚠️ 검증 실패: {e}")

            print("\n✅ 완료! API 서버를 재시작하세요: npm run dev")

        except Exception as e:
            print(f"\n❌ 에러: {e}")
            page.screenshot(path="/tmp/suno_auth_error.png")
            print("  스크린샷: /tmp/suno_auth_error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    login()
