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
    const resolvedModel = model ?? process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';
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
    const requestedModel = opts.model ?? process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
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

// ── Singleton ─────────────────────────────────────────────────────────────────

let _pool: AccountPool | null = null;

export function getAccountPool(): AccountPool {
  if (_pool) return _pool;

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
    _pool = new AccountPool(parsed.data.accounts);
    return _pool;
  }

  // Fallback: single GEMINI_API_KEY
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }
  _pool = new AccountPool([{ type: 'gemini-api', name: 'default', apiKey }]);
  return _pool;
}
