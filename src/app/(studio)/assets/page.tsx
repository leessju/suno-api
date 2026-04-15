import { getDb } from '@/lib/music-gen/db'
import { listObjects, getObjectUrl } from '@/lib/r2'

interface MidiMaster {
  id: string
  source_url: string | null
  midi_r2_key: string
  bpm: number | null
  key_signature: string | null
  usage_count: number
  created_at: number
}

interface R2Object {
  key: string
  size: number
  uploaded: string
}

export const dynamic = 'force-dynamic'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileExt(key: string): string {
  return key.split('.').pop()?.toLowerCase() ?? ''
}

export default async function AssetsPage() {
  let midis: MidiMaster[] = []
  try {
    const db = getDb()
    midis = db.prepare(
      'SELECT * FROM midi_masters ORDER BY usage_count DESC, created_at DESC LIMIT 50'
    ).all() as MidiMaster[]
  } catch { /* DB not ready */ }

  let r2Objects: R2Object[] = []
  try {
    r2Objects = await listObjects()
  } catch { /* R2 unavailable or empty */ }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">에셋 라이브러리</h1>
      </div>

      {/* R2 파일 섹션 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-white">R2 파일</h2>
          <span className="text-sm text-gray-400">{r2Objects.length}개</span>
        </div>
        <div className="grid gap-3">
          {r2Objects.map(obj => {
            const ext = getFileExt(obj.key)
            const isAudio = ['mp3', 'wav', 'ogg', 'flac'].includes(ext)
            const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)
            const url = getObjectUrl(obj.key)
            const filename = obj.key.split('/').pop() ?? obj.key

            return (
              <div key={obj.key} className="p-4 bg-gray-900 rounded-xl border border-gray-800">
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{filename}</p>
                    <div className="flex gap-3 mt-1">
                      <span className="text-xs text-gray-400">{formatBytes(obj.size)}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(obj.uploaded).toLocaleDateString('ko-KR')}
                      </span>
                    </div>
                  </div>
                  {!isAudio && !isImage && (
                    <a
                      href={url}
                      download={filename}
                      className="text-xs text-blue-400 hover:text-blue-300 flex-shrink-0 ml-4"
                    >
                      다운로드
                    </a>
                  )}
                </div>
                {isAudio && (
                  <audio
                    controls
                    src={url}
                    className="w-full h-8 mt-2"
                    style={{ colorScheme: 'dark' }}
                  />
                )}
                {isImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt={filename}
                    className="mt-2 max-h-48 rounded-lg object-contain"
                  />
                )}
              </div>
            )
          })}
          {r2Objects.length === 0 && (
            <div className="p-6 bg-gray-900 rounded-xl border border-gray-800 text-center text-gray-400 text-sm">
              R2 버킷이 비어 있습니다
            </div>
          )}
        </div>
      </section>

      {/* MIDI 마스터 섹션 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-white">MIDI 마스터</h2>
          <span className="text-sm text-gray-400">{midis.length}개</span>
        </div>
        <div className="grid gap-3">
          {midis.map(midi => (
            <div key={midi.id} className="p-4 bg-gray-900 rounded-xl border border-gray-800">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">
                    {midi.source_url ? new URL(midi.source_url).pathname.split('/').pop() : midi.id.slice(0, 12)}
                  </p>
                  <div className="flex gap-3 mt-1">
                    {midi.bpm && <span className="text-xs text-gray-400">{midi.bpm.toFixed(0)} BPM</span>}
                    {midi.key_signature && <span className="text-xs text-gray-400">{midi.key_signature}</span>}
                    <span className="text-xs text-gray-500">{midi.usage_count}회 사용</span>
                  </div>
                </div>
                <span className="text-xs text-gray-600 flex-shrink-0 ml-4">
                  {new Date(midi.created_at).toLocaleDateString('ko-KR')}
                </span>
              </div>
            </div>
          ))}
          {midis.length === 0 && (
            <div className="p-6 bg-gray-900 rounded-xl border border-gray-800 text-center text-gray-400 text-sm">
              아직 MIDI 마스터가 없습니다
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
