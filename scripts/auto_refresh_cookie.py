#!/usr/bin/env python3
"""
Suno 쿠키 자동 감시 + 갱신 스크립트

- keepAlive 주기적 체크 (30분 간격)
- __client 만료 감지 시 browser-use로 자동 재로그인
- .env 자동 업데이트 + API 서버 재시작

사용법:
  python3 scripts/auto_refresh_cookie.py          # 포그라운드
  nohup python3 scripts/auto_refresh_cookie.py &  # 백그라운드
"""
import subprocess, re, json, time, os, sys
from pathlib import Path
from datetime import datetime

ENV_PATH = Path(__file__).parent.parent / ".env"
CHECK_INTERVAL = 1800  # 30분
PROFILE = "nicejames"
CLERK_URL = "https://auth.suno.com/v1/client?_is_native=true&_clerk_js_version=5.117.0&__clerk_api_version=2025-11-10"

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)

def get_client_cookie():
    """현재 .env에서 __client 쿠키 추출"""
    content = ENV_PATH.read_text()
    m = re.search(r'SUNO_COOKIE=(.*)', content)
    if not m:
        return None
    cookie_str = m.group(1)
    for part in cookie_str.split("; "):
        if part.startswith("__client="):
            return part[len("__client="):]
    return None

def check_auth(client_cookie):
    """Clerk API로 __client 유효성 확인"""
    try:
        import urllib.request
        req = urllib.request.Request(CLERK_URL, headers={
            "Authorization": client_cookie,
            "Origin": "https://suno.com",
            "Referer": "https://suno.com/",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        })
        resp = urllib.request.urlopen(req, timeout=10)
        data = json.loads(resp.read())
        sid = data.get("response", {}).get("last_active_session_id")
        return sid is not None
    except Exception as e:
        log(f"  인증 실패: {e}")
        return False

def refresh_cookie():
    """browser-use (프로필) → suno.com 접속 → cookies get으로 httpOnly 포함 추출 → .env 업데이트"""
    log("🔄 browser-use로 쿠키 갱신 시작...")
    import ast

    try:
        # 1. 기존 세션 정리 + suno.com 열기
        subprocess.run(["browser-use", "close"], capture_output=True, timeout=10)
        time.sleep(2)

        log("  브라우저 열기 (프로필: nicejames)...")
        r = subprocess.run(
            ["browser-use", "--profile", PROFILE, "open", "https://suno.com"],
            capture_output=True, text=True, timeout=60
        )
        if r.returncode != 0:
            log(f"  ❌ 브라우저 열기 실패: {r.stderr[:200]}")
            return False

        time.sleep(10)  # Clerk 인증 대기

        # 2. cookies get으로 httpOnly 포함 전체 쿠키 추출
        log("  쿠키 추출 (httpOnly 포함)...")
        r = subprocess.run(
            ["browser-use", "cookies", "get"],
            capture_output=True, text=True, timeout=30
        )
        if r.returncode != 0:
            log(f"  ❌ 쿠키 추출 실패: {r.stderr[:200]}")
            return False

        raw = r.stdout.strip()
        if raw.startswith("cookies: "):
            raw = raw[9:]
        cookies = ast.literal_eval(raw)

        # 3. suno 관련 쿠키 필터
        suno_cookies = [c for c in cookies if "suno" in c.get("domain", "")]
        client_cookie = next((c for c in suno_cookies if c["name"] == "__client"), None)

        if not client_cookie:
            log("  ❌ __client 쿠키 없음 — Google 재로그인 필요")
            log("  수동: browser-use --profile nicejames open https://suno.com")
            return False

        log(f"  ✅ __client 획득 (길이: {len(client_cookie['value'])})")

        # 4. 쿠키 문자열 조합
        cookie_string = "; ".join(f'{c["name"]}={c["value"]}' for c in suno_cookies)

        # 5. .env 업데이트
        log("  .env 업데이트...")
        content = ENV_PATH.read_text()
        if "SUNO_COOKIE=" in content:
            content = re.sub(r'SUNO_COOKIE=.*', f'SUNO_COOKIE={cookie_string}', content)
        else:
            content += f'\nSUNO_COOKIE={cookie_string}\n'
        ENV_PATH.write_text(content)

        # 6. 검증
        if check_auth(client_cookie["value"]):
            log("  ✅ 쿠키 갱신 + 검증 성공!")
            return True
        else:
            log("  ⚠️ 쿠키 갱신했으나 검증 실패")
            return False

    except Exception as e:
        log(f"  ❌ 에러: {e}")
        return False

def restart_api():
    """API 서버 재시작 (pm2 또는 프로세스 재시작)"""
    # pm2가 있으면 pm2로, 없으면 알림만
    try:
        r = subprocess.run(["pm2", "restart", "suno-api"], capture_output=True, timeout=10)
        if r.returncode == 0:
            log("  🔄 API 서버 재시작 (pm2)")
            return
    except:
        pass
    log("  ℹ️ API 서버를 수동으로 재시작하세요: npm run dev")

def main():
    log("🚀 Suno 쿠키 자동 감시 시작")
    log(f"  체크 간격: {CHECK_INTERVAL // 60}분")
    log(f"  프로필: {PROFILE}")
    log(f"  .env: {ENV_PATH}\n")

    consecutive_fails = 0

    while True:
        client = get_client_cookie()

        if not client:
            log("⚠️ .env에 __client 쿠키 없음")
            if refresh_cookie():
                restart_api()
                consecutive_fails = 0
            else:
                consecutive_fails += 1
        elif check_auth(client):
            log("✅ 인증 유효")
            consecutive_fails = 0
        else:
            log("⚠️ __client 만료됨!")
            if refresh_cookie():
                restart_api()
                consecutive_fails = 0
            else:
                consecutive_fails += 1

        if consecutive_fails >= 3:
            log("❌ 3회 연속 실패 — 수동 개입 필요")
            log("   browser-use --profile nicejames open https://suno.com")
            log("   로그인 후 이 스크립트를 다시 실행하세요")
            # 알림 (텔레그램 봇이 있으면 여기서 전송)
            consecutive_fails = 0  # 리셋 후 계속 시도

        log(f"  다음 체크: {CHECK_INTERVAL // 60}분 후\n")
        time.sleep(CHECK_INTERVAL)

if __name__ == "__main__":
    # 단일 실행 모드: --once 플래그
    if "--once" in sys.argv:
        client = get_client_cookie()
        if not client or not check_auth(client):
            log("쿠키 만료 → 갱신")
            if refresh_cookie():
                restart_api()
        else:
            log("✅ 인증 유효 — 갱신 불필요")
    else:
        main()
