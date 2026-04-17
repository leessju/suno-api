import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/utils';
import { AllAccountsExhaustedError, AccountPoolInvalidError } from './gemini/account-pool';
import { ValidationError } from './gemini/generator';

export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: corsHeaders });
}

export function err(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status, headers: corsHeaders });
}

export function options(): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export function handleError(e: unknown): NextResponse {
  if (e instanceof AllAccountsExhaustedError) {
    return err('ALL_ACCOUNTS_EXHAUSTED', 'All Gemini accounts are rate-limited. Retry later.', 503);
  }
  if (e instanceof AccountPoolInvalidError) {
    return err('ACCOUNT_POOL_INVALID', e.message, 500);
  }
  if (e instanceof ValidationError) {
    if (e.message.startsWith('MAX_RETRY_EXCEEDED')) {
      const reason = e.message.replace('MAX_RETRY_EXCEEDED: ', '')
      return err('MAX_RETRY_EXCEEDED', `가사 생성 3회 실패 — ${reason}`, 422);
    }
  }
  if (e instanceof Error && e.message === 'GEMINI_API_KEY_MISSING') {
    return err('GEMINI_API_KEY_MISSING', 'GEMINI_API_KEY is not configured.', 500);
  }
  console.error('[music-gen]', e);
  return err('INTERNAL_ERROR', 'An unexpected error occurred.', 500);
}
