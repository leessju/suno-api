import { NextResponse } from 'next/server';
import { getAccountManager } from '@/lib/utils/account-manager';

export async function GET() {
  const mgr = getAccountManager();
  if (!mgr) {
    return NextResponse.json({
      status: 'no_accounts',
      message: '~/.claude/.credentials.json 또는 ~/.claude/credentials/account-N.json 파일이 없습니다.',
      setup: [
        '1. Claude Code CLI가 실행 중이면 CLAUDE_CODE_OAUTH_TOKEN 환경변수가 자동 설정됩니다.',
        '2. pnpm dev 재시작 시 자동으로 ~/.claude/.credentials.json이 생성됩니다.',
        '3. 수동: cat ~/.claude/.credentials.json 으로 확인 가능',
      ],
    }, { status: 404 });
  }

  const status = mgr.getStatus();
  return NextResponse.json({
    status: 'ok',
    ...status,
  });
}

export async function POST() {
  // 강제 토큰 갱신
  const mgr = getAccountManager();
  if (!mgr) {
    return NextResponse.json({ error: 'No accounts configured' }, { status: 404 });
  }

  try {
    await mgr.refreshAllTokens(true);
    mgr._writeActiveCredentials();
    return NextResponse.json({ ok: true, message: 'Token refreshed' });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
