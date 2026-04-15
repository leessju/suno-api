# Claude OAuth 계정 관리

## 계정 파일 위치
~/.claude/credentials/account-1.json
~/.claude/credentials/account-2.json

## 환경변수
OAUTH_PROXY_URL=http://user:pass@gate.decodo.com:10001  # 선택 (Cloudflare 우회)

## 사용법
import { getAccountManager, startAccountDaemon } from '@/lib/utils/account-manager'

// 앱 시작 시
startAccountDaemon()

// API 호출 전
const manager = getAccountManager()
const token = manager.activeAccount?.accessToken
