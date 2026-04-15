import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import * as sessionsRepo from '@/lib/music-gen/repositories/sessions';
import { analyzeMediaFromUrl } from '@/lib/music-gen/media/analyzer';
import { ok, err, options, handleError } from '@/lib/music-gen/api-helpers';

const ALLOWED_MIMES = ['audio/mpeg', 'audio/midi', 'audio/mid'];
const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

type Params = { params: Promise<{ id: string }> };

export async function OPTIONS() {
  return options();
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id: sessionId } = await params;

    const session = sessionsRepo.findById(sessionId);
    if (!session) return err('SESSION_NOT_FOUND', `Session ${sessionId} not found`, 404);

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return err('INVALID_INPUT', 'file field is required', 400);

    const mimeType = file.type;
    if (!ALLOWED_MIMES.includes(mimeType)) {
      return err('INVALID_MIME', `MIME type ${mimeType} not allowed. Allowed: ${ALLOWED_MIMES.join(', ')}`, 400);
    }

    if (file.size > MAX_SIZE_BYTES) {
      return err('FILE_TOO_LARGE', `File size ${file.size} exceeds limit of ${MAX_SIZE_BYTES} bytes`, 400);
    }

    // Save file to disk
    const ext = mimeType === 'audio/mpeg' ? 'mp3' : 'mid';
    const uploadDir = path.resolve(`data/music-gen/uploads/${sessionId}`);
    fs.mkdirSync(uploadDir, { recursive: true });
    const filename = `${randomUUID()}.${ext}`;
    const filePath = path.join(uploadDir, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    // Analyze with Gemini (one-time, result stored in session)
    const mediaAnalysis = await analyzeMediaFromUrl(filePath, mimeType);
    const analysisJson = JSON.stringify(mediaAnalysis);

    sessionsRepo.updateMediaAnalysis(sessionId, analysisJson, filePath);

    return ok({ sessionId, mediaAnalysis });
  } catch (e) {
    return handleError(e);
  }
}
