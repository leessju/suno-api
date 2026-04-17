import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/music-gen/api-helpers'
import { requireUser } from '@/lib/auth/guards'
import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'

export async function POST(req: NextRequest) {
  try {
    const { user, response } = await requireUser()
    if (response) return response

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return err('VALIDATION_ERROR', '파일이 없습니다.', 400)

    // type validation
    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/x-mpeg']
    const ext = path.extname(file.name).toLowerCase()
    if (!allowedTypes.includes(file.type) && ext !== '.mp3') {
      return err('VALIDATION_ERROR', 'MP3 파일만 업로드 가능합니다.', 400)
    }

    // size limit: 500MB
    if (file.size > 500 * 1024 * 1024) {
      return err('VALIDATION_ERROR', '파일 크기는 500MB 이하여야 합니다.', 400)
    }

    const uploadDir = path.join(process.cwd(), 'data', 'uploads')
    fs.mkdirSync(uploadDir, { recursive: true })

    const uuid = randomUUID()
    const savePath = path.join(uploadDir, `${uuid}.mp3`)
    const buffer = Buffer.from(await file.arrayBuffer())
    fs.writeFileSync(savePath, buffer)

    const relativePath = path.join('data', 'uploads', `${uuid}.mp3`)
    return ok({ path: relativePath, originalName: file.name })
  } catch (e) {
    return handleError(e)
  }
}
