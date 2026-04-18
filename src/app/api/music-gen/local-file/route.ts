import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

const MIME_MAP: Record<string, string> = {
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  mid: 'audio/midi', midi: 'audio/midi',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  json: 'application/json', txt: 'text/plain',
}

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get('path')
  if (!filePath) {
    return NextResponse.json({ error: 'path required' }, { status: 400 })
  }

  // 보안: data/ 디렉토리 또는 절대 경로(프로젝트 내)만 허용
  const resolved = path.resolve(filePath.startsWith('/') ? filePath : path.join(process.cwd(), filePath))
  const cwd = process.cwd()
  if (!resolved.startsWith(cwd) && !resolved.includes('/data/')) {
    return NextResponse.json({ error: 'access denied' }, { status: 403 })
  }

  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ error: 'file not found' }, { status: 404 })
  }

  const ext = path.extname(resolved).slice(1).toLowerCase()
  const contentType = MIME_MAP[ext] ?? 'application/octet-stream'
  const filename = path.basename(resolved)
  const stat = fs.statSync(resolved)
  const buffer = fs.readFileSync(resolved)

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(stat.size),
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
