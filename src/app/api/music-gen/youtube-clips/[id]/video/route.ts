import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/music-gen/db'
import { requireUser } from '@/lib/auth/guards'
import { createReadStream, statSync } from 'fs'
import { Readable } from 'stream'

type Params = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'

// GET /api/music-gen/youtube-clips/[id]/video — 영상 스트리밍
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { user, response } = await requireUser()
  if (response) return response

  const db = getDb()
  const row = db.prepare(`
    SELECT yc.video_path FROM youtube_clips yc
    JOIN channels c ON c.id = yc.channel_id
    JOIN workspaces ws ON ws.channel_id = c.id
    WHERE yc.id = ? AND ws.user_id = ? AND yc.deleted_at IS NULL
  `).get(id, user.id) as { video_path: string | null } | undefined

  if (!row?.video_path) {
    return new NextResponse('Not Found', { status: 404 })
  }

  let stat: ReturnType<typeof statSync>
  try {
    stat = statSync(row.video_path)
  } catch {
    return new NextResponse('File Not Found', { status: 404 })
  }

  const rangeHeader = req.headers.get('range')
  const fileSize = stat.size

  if (rangeHeader) {
    const [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-')
    const start = parseInt(startStr, 10)
    const end = endStr ? parseInt(endStr, 10) : fileSize - 1
    const chunkSize = end - start + 1

    const stream = createReadStream(row.video_path, { start, end })
    const nodeStream = Readable.from(stream)
    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on('data', chunk => controller.enqueue(chunk))
        nodeStream.on('end', () => controller.close())
        nodeStream.on('error', e => controller.error(e))
      },
    })

    return new NextResponse(webStream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': 'video/mp4',
      },
    })
  }

  const stream = createReadStream(row.video_path)
  const nodeStream = Readable.from(stream)
  const webStream = new ReadableStream({
    start(controller) {
      nodeStream.on('data', chunk => controller.enqueue(chunk))
      nodeStream.on('end', () => controller.close())
      nodeStream.on('error', e => controller.error(e))
    },
  })

  return new NextResponse(webStream, {
    headers: {
      'Content-Length': String(fileSize),
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    },
  })
}
