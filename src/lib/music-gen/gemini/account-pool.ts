import { GoogleGenAI, type Part } from '@google/genai';
import { GoogleAuth } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

// ── Spike Result (US-V2-001) ─────────────────────────────────────────────────
// Vertex AI (GoogleGenAI with vertexai:true) does NOT support ai.files.upload().
// The Gemini Developer Files API endpoint is unavailable on the Vertex AI path.
// → vertex-ai accounts: read file bytes and return inline base64 (MediaRef kind='inline')
// → gemini-api accounts: call ai.files.upload() → return fileUri (MediaRef kind='gemini-file')

// ── MediaRef ─────────────────────────────────────────────────────────────────

export type MediaRef =
  | { kind: 'gemini-file'; fileUri: string; mimeType: string }
  | { kind: 'inline'; bytes: Buffer; mimeType: string };

// ── Schema ───────────────────────────────────────────────────────────────────

const geminiApiAccountSchema = z.object({
  type: z.literal('gemini-api'),
  name: z.string(),
  apiKey: z.string().min(1),
});

const vertexAiAccountSchema = z.object({
  type: z.literal('vertex-ai'),
  name: z.string(),
  project: z.string().min(1),
  location: z.string().default('us-central1'),
  credentialsPath: z.string().min(1),
});

const vertexAiApiKeyAccountSchema = z.object({
  type: z.literal('vertex-ai-apikey'),
  name: z.string(),
  project: z.string().min(1),
  location: z.string().default('us-central1'),
  apiKey: z.string().min(1),
});

const accountConfigSchema = z.discriminatedUnion('type', [
  geminiApiAccountSchema,
  vertexAiAccountSchema,
  vertexAiApiKeyAccountSchema,
]);

const accountsFileSchema = z.object({
  accounts: z.array(accountConfigSchema).min(1),
});

export type AccountConfig = z.infer<typeof accountConfigSchema>;

// ── Errors ───────────────────────────────────────────────────────────────────

export class AllAccountsExhaustedError extends Error {
  constructor() {
    super('ALL_ACCOUNTS_EXHAUSTED');
    this.name = 'AllAccountsExhaustedError';
  }
}

export class AccountPoolInvalidError extends Error {
  constructor(message: string) {
    super(`ACCOUNT_POOL_INVALID: ${message}`);
    this.name = 'AccountPoolInvalidError';
  }
}

// ── Token cache for Vertex AI ────────────────────────────────────────────────

interface TokenEntry {
  accessToken: string;
  expiresAt: number; // Unix ms
}

const tokenCache = new Map<string, TokenEntry>();

async function getVertexAccessToken(credentialsPath: string): Promise<string> {
  const cached = tokenCache.get(credentialsPath);
  if (cached && cached.expiresAt - Date.now() > 5 * 60 * 1000) {
    return cached.accessToken;
  }

  const resolvedPath = path.resolve(credentialsPath);
  const credentials = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));

  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const accessToken = tokenResponse.token;
  if (!accessToken) throw new Error('Failed to obtain Vertex AI access token');

  // Cache for ~55 minutes (tokens typically expire in 1h)
  tokenCache.set(credentialsPath, {
    accessToken,
    expiresAt: Date.now() + 55 * 60 * 1000,
  });
  return accessToken;
}

// ── GenerateMultimodalOpts ───────────────────────────────────────────────────

export interface GenerateMultimodalOpts {
  model?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  systemInstruction?: string;
  responseMimeType?: string;
  responseSchema?: Record<string, unknown>;
  thinkingBudget?: number; // tokens allocated for thinking (Gemini 3+ only)
}

// ── AccountPool ──────────────────────────────────────────────────────────────

function isRateLimit(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('rate limit') ||
    msg.includes('quota')
  );
}

export class AccountPool {
  private readonly accounts: AccountConfig[];
  private currentIdx: number;
  /** ms timestamp until which an account is considered rate-limited */
  private readonly rateLimitedUntil = new Map<string, number>();

  constructor(accounts: AccountConfig[]) {
    if (accounts.length === 0) throw new AccountPoolInvalidError('No accounts provided');
    this.accounts = accounts;
    // Randomize start to spread load across workers
    this.currentIdx = Math.floor(Math.random() * accounts.length);
  }

  /** Text-only generation — signature unchanged for backwards compatibility */
  async generate(
    messages: Array<{ role: string; content: string }>,
    model?: string,
  ): Promise<string> {
    const resolvedModel = model ?? getGeminiModel('gemini-2.0-flash');
    let attempts = 0;

    while (attempts < this.accounts.length) {
      const account = this.accounts[this.currentIdx];
      const accountName = account.name;

      const limitedUntil = this.rateLimitedUntil.get(accountName) ?? 0;
      if (limitedUntil > Date.now()) {
        this.rotateToNext();
        attempts++;
        continue;
      }

      try {
        const result = await this.callWithAccount(account, messages, resolvedModel);
        return result;
      } catch (err) {
        if (isRateLimit(err)) {
          this.rateLimitedUntil.set(accountName, Date.now() + 60 * 1000);
          this.rotateToNext();
          attempts++;
          continue;
        }
        throw err;
      }
    }

    throw new AllAccountsExhaustedError();
  }

  /**
   * Upload a file and return a MediaRef.
   * - vertex-ai accounts: reads bytes inline (Files API unavailable on Vertex)
   * - gemini-api accounts: uploads via ai.files.upload() and returns fileUri
   */
  async uploadFile(filePath: string, mimeType: string): Promise<MediaRef> {
    const account = this.accounts[this.currentIdx];

    // Both vertex-ai and gemini-api use inline base64 for files ≤ 20 MB.
    // The Gemini Files API upload path is unreliable for audio files due to
    // headers timeout on slower connections. Inline base64 is supported by
    // the Gemini API for files up to 20 MB and avoids the upload round-trip.
    const bytes = fs.readFileSync(filePath);
    const fileSizeMB = bytes.length / (1024 * 1024);
    if (fileSizeMB > 20) {
      throw new Error(`File too large for inline base64 (${fileSizeMB.toFixed(1)} MB > 20 MB). Use a smaller file.`);
    }
    return { kind: 'inline', bytes, mimeType };
  }

  /** Convert a MediaRef to a Gemini API Part */
  refToPart(ref: MediaRef): Part {
    if (ref.kind === 'gemini-file') {
      return { fileData: { fileUri: ref.fileUri, mimeType: ref.mimeType } };
    }
    return { inlineData: { data: ref.bytes.toString('base64'), mimeType: ref.mimeType } };
  }

  /**
   * Multimodal generation with Parts (text + media).
   * Applies the same rotation/rate-limit logic as generate().
   */
  async generateMultimodal(parts: Part[], opts: GenerateMultimodalOpts = {}): Promise<string> {
    let attempts = 0;

    while (attempts < this.accounts.length) {
      const account = this.accounts[this.currentIdx];
      const accountName = account.name;

      const limitedUntil = this.rateLimitedUntil.get(accountName) ?? 0;
      if (limitedUntil > Date.now()) {
        this.rotateToNext();
        attempts++;
        continue;
      }

      try {
        const result = await this.callMultimodalWithAccount(account, parts, opts);
        return result;
      } catch (err) {
        if (isRateLimit(err)) {
          this.rateLimitedUntil.set(accountName, Date.now() + 60 * 1000);
          this.rotateToNext();
          attempts++;
          continue;
        }
        throw err;
      }
    }

    throw new AllAccountsExhaustedError();
  }

  private rotateToNext(): void {
    this.currentIdx = (this.currentIdx + 1) % this.accounts.length;
  }

  private async callWithAccount(
    account: AccountConfig,
    messages: Array<{ role: string; content: string }>,
    model: string,
  ): Promise<string> {
    const ai = await this.buildAI(account);

    const systemMsg = messages.find((m) => m.role === 'system');
    const chatMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: (m.role === 'assistant' ? 'model' : m.role) as 'user' | 'model',
        parts: [{ text: m.content }],
      }));

    const response = await ai.models.generateContent({
      model,
      config: {
        ...(systemMsg ? { systemInstruction: systemMsg.content } : {}),
      },
      contents: chatMessages,
    });

    const text = response.text;
    if (!text) throw new Error('Empty response from Gemini');
    return text;
  }

  private async callMultimodalWithAccount(
    account: AccountConfig,
    parts: Part[],
    opts: GenerateMultimodalOpts,
  ): Promise<string> {
    const ai = await this.buildAI(account);
    // Models not yet available on Vertex AI (aiplatform.googleapis.com) — fall back to nearest equivalent
    // Note: gemini-3-flash-preview returns 404 on Vertex AI endpoint even with API key
    const VERTEX_AI_FALLBACK: Record<string, string> = {
      'gemini-3-pro-preview':     'gemini-2.5-pro',   // 404 on aiplatform.googleapis.com
      'gemini-3-flash-preview':   'gemini-2.5-flash', // 404 on aiplatform.googleapis.com
      'gemini-3.0-flash-preview': 'gemini-2.5-flash', // 404 확인
    };
    const requestedModel = opts.model ?? getGeminiModel('gemini-2.5-flash');
    const isVertex = account.type === 'vertex-ai' || account.type === 'vertex-ai-apikey';
    const model =
      isVertex && VERTEX_AI_FALLBACK[requestedModel]
        ? VERTEX_AI_FALLBACK[requestedModel]
        : requestedModel;

    const response = await ai.models.generateContent({
      model,
      config: {
        ...(opts.systemInstruction ? { systemInstruction: opts.systemInstruction } : {}),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...(opts.topP !== undefined ? { topP: opts.topP } : {}),
        ...(opts.topK !== undefined ? { topK: opts.topK } : {}),
        ...(opts.responseMimeType ? { responseMimeType: opts.responseMimeType } : {}),
        ...(opts.responseSchema ? { responseSchema: opts.responseSchema } : {}),
        ...(opts.thinkingBudget !== undefined
          ? { thinkingConfig: { thinkingBudget: opts.thinkingBudget } }
          : {}),
      },
      contents: [{ role: 'user', parts }],
    });

    const text = response.text;
    if (!text) throw new Error('Empty response from Gemini multimodal call');

    // Log token usage for cost estimation
    const usage = (response as unknown as Record<string, unknown>).usageMetadata as Record<string, number> | undefined;
    if (usage) {
      const inputTokens = usage.promptTokenCount ?? 0;
      const outputTokens = usage.candidatesTokenCount ?? 0;
      const thinkingTokens = usage.thoughtsTokenCount ?? 0;
      console.log(
        `[Gemini usage] model=${model} input=${inputTokens} output=${outputTokens} thinking=${thinkingTokens} total=${inputTokens + outputTokens + thinkingTokens}`,
      );
    }

    return text;
  }

  private async buildAI(account: AccountConfig): Promise<GoogleGenAI> {
    if (account.type === 'gemini-api') {
      return new GoogleGenAI({
        apiKey: account.apiKey,
        httpOptions: { timeout: 120_000 },
      });
    }
    if (account.type === 'vertex-ai-apikey') {
      return new GoogleGenAI({
        vertexai: true,
        project: account.project,
        location: account.location,
        apiKey: account.apiKey,
        httpOptions: { timeout: 120_000 },
      } as ConstructorParameters<typeof GoogleGenAI>[0]);
    }
    const accessToken = await getVertexAccessToken(account.credentialsPath);
    return new GoogleGenAI({
      vertexai: true,
      project: account.project,
      location: account.location,
      httpOptions: {
        timeout: 120_000,
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    } as ConstructorParameters<typeof GoogleGenAI>[0]);
  }
}

// ── Gemini Model ─────────────────────────────────────────────────────────────

let _cachedModel: string | null = null;
let _modelCachedAt = 0;

/** DB(gem_global_settings) → env → 기본값 순서로 Gemini 모델명 조회 */
export function getGeminiModel(fallback = 'gemini-2.5-flash'): string {
  if (_cachedModel && Date.now() - _modelCachedAt < 30_000) return _cachedModel;
  try {
    const { getDb } = require('@/lib/music-gen/db');
    const db = getDb();
    const row = db.prepare("SELECT value FROM gem_global_settings WHERE key = 'gemini_model'").get() as { value: string } | undefined;
    if (row?.value) {
      _cachedModel = row.value;
      _modelCachedAt = Date.now();
      return row.value;
    }
  } catch { /* DB 조회 실패 시 env 폴백 */ }
  const envModel = process.env.GEMINI_MODEL;
  if (envModel) return envModel;
  return fallback;
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _pool: AccountPool | null = null;
let _poolBuiltAt = 0;
const POOL_TTL_MS = 30_000; // 30초마다 DB에서 갱신

/**
 * DB의 gemini_accounts 테이블에서 활성 계정 목록을 로드.
 * 모든 유저의 키를 로드 — 이 시스템은 싱글 테넌트(2-10명 공유 도구)이므로
 * 키는 전역 공유 리소스로 취급. user_id는 API 소유권 관리용.
 */
function loadAccountsFromDb(): AccountConfig[] | null {
  try {
    const { getDb } = require('@/lib/music-gen/db');
    const db = getDb();
    const rows = db
      .prepare(
        'SELECT type, name, api_key, project, location FROM gemini_accounts WHERE is_active = 1 AND deleted_at IS NULL ORDER BY priority ASC, id ASC',
      )
      .all() as Array<{
      type: string;
      name: string;
      api_key: string;
      project: string | null;
      location: string | null;
    }>;

    if (rows.length === 0) return null;

    return rows.map((r) => {
      if (r.type === 'vertex-ai-apikey') {
        return {
          type: 'vertex-ai-apikey' as const,
          name: r.name,
          project: r.project ?? '',
          location: r.location ?? 'us-central1',
          apiKey: r.api_key,
        };
      }
      return {
        type: 'gemini-api' as const,
        name: r.name,
        apiKey: r.api_key,
      };
    });
  } catch {
    return null;
  }
}

/** 키 변경 시 풀 캐시를 강제 무효화 */
export function invalidateAccountPool(): void {
  _pool = null;
  _poolBuiltAt = 0;
}

export function getAccountPool(): AccountPool {
  // TTL 기반 캐시 — 키 추가/삭제 시 최대 30초 내 반영
  if (_pool && Date.now() - _poolBuiltAt < POOL_TTL_MS) {
    return _pool;
  }

  // 1순위: DB (gemini_accounts 테이블)
  const dbAccounts = loadAccountsFromDb();
  if (dbAccounts && dbAccounts.length > 0) {
    _pool = new AccountPool(dbAccounts);
    _poolBuiltAt = Date.now();
    return _pool;
  }

  // 2순위: accounts.json → DB 자동 마이그레이션 (레거시 호환)
  const accountsPath = process.env.MUSIC_GEN_ACCOUNTS_PATH;
  if (accountsPath) {
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(path.resolve(accountsPath), 'utf-8'));
    } catch (err) {
      throw new AccountPoolInvalidError(
        `Cannot read/parse ${accountsPath}: ${(err as Error).message}`,
      );
    }
    const parsed = accountsFileSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AccountPoolInvalidError(
        `Invalid accounts.json schema: ${parsed.error.message}`,
      );
    }

    // DB에 키가 없으면 accounts.json → DB로 자동 마이그레이션
    try {
      const { getDb } = require('@/lib/music-gen/db');
      const db = getDb();
      const count = db.prepare("SELECT COUNT(*) as cnt FROM gemini_accounts WHERE user_id = 'system'").get() as { cnt: number };
      if (count.cnt === 0) {
        const now = Math.floor(Date.now() / 1000);
        const insert = db.prepare(`
          INSERT OR IGNORE INTO gemini_accounts (user_id, name, type, api_key, project, location, priority, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (let i = 0; i < parsed.data.accounts.length; i++) {
          const acc = parsed.data.accounts[i];
          insert.run(
            'system',
            acc.name,
            acc.type === 'vertex-ai-apikey' ? 'vertex-ai-apikey' : 'gemini-api',
            'apiKey' in acc ? acc.apiKey : '',
            'project' in acc ? acc.project : null,
            'location' in acc ? acc.location : 'us-central1',
            i,
            now,
            now,
          );
        }
        console.log(`[account-pool] accounts.json → DB 마이그레이션 완료 (${parsed.data.accounts.length}개)`);
        // 마이그레이션 후 DB에서 다시 로드
        const migrated = loadAccountsFromDb();
        if (migrated && migrated.length > 0) {
          _pool = new AccountPool(migrated);
          _poolBuiltAt = Date.now();
          return _pool;
        }
      }
    } catch {
      // 마이그레이션 실패 시 accounts.json으로 계속 진행
    }

    _pool = new AccountPool(parsed.data.accounts);
    _poolBuiltAt = Date.now();
    return _pool;
  }

  // 3순위: GEMINI_API_KEY 환경변수
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }
  _pool = new AccountPool([{ type: 'gemini-api', name: 'default', apiKey }]);
  _poolBuiltAt = Date.now();
  return _pool;
}
