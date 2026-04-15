"""
Claude OAuth 클라이언트 팩토리
우선순위: CLAUDE_CODE_OAUTH_TOKEN → ~/.claude/.credentials.json →
          ~/.claude/credentials/account-N.json → ANTHROPIC_API_KEY
"""

import json
import logging
import os
from pathlib import Path

logger = logging.getLogger('utils.claude_auth')


def get_oauth_token() -> str | None:
    """OAuth 액세스 토큰 획득 (우선순위 체인)"""

    # 1. 환경변수 (Claude Code CLI가 주입)
    token = os.environ.get('CLAUDE_CODE_OAUTH_TOKEN')
    if token:
        logger.debug('OAuth token from CLAUDE_CODE_OAUTH_TOKEN env')
        return token

    home = Path.home()

    # 2. ~/.claude/.credentials.json (단일 계정 / 브릿지 파일)
    cred_path = home / '.claude' / '.credentials.json'
    if cred_path.exists():
        try:
            data = json.loads(cred_path.read_text())
            token = data.get('claudeAiOauth', {}).get('accessToken')
            if token:
                logger.debug('OAuth token from ~/.claude/.credentials.json')
                return token
        except Exception as e:
            logger.warning(f'Failed to read .credentials.json: {e}')

    # 3. ~/.claude/credentials/account-N.json (멀티 계정)
    cred_dir = home / '.claude' / 'credentials'
    if cred_dir.exists():
        for f in sorted(cred_dir.glob('account-*.json')):
            try:
                data = json.loads(f.read_text())
                token = data.get('claudeAiOauth', {}).get('accessToken')
                if token:
                    logger.debug(f'OAuth token from {f.name}')
                    return token
            except Exception:
                pass

    return None


def get_client(model: str | None = None):
    """
    anthropic.Anthropic() 클라이언트 반환.
    OAuth 토큰 우선, ANTHROPIC_API_KEY fallback.
    """
    import anthropic

    token = get_oauth_token()
    if token:
        return anthropic.Anthropic(api_key=token)

    # ANTHROPIC_API_KEY fallback (없으면 SDK가 에러 발생)
    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if api_key:
        logger.warning('Using ANTHROPIC_API_KEY fallback — OAuth 설정 필요')
        return anthropic.Anthropic(api_key=api_key)

    raise RuntimeError(
        'Claude 인증 실패: CLAUDE_CODE_OAUTH_TOKEN, '
        '~/.claude/.credentials.json, ~/.claude/credentials/account-N.json, '
        'ANTHROPIC_API_KEY 모두 없음'
    )
