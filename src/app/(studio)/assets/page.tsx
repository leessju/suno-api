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
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">에셋 라이브러리</h1>
      </div>

      {/* R2 파일 섹션 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">R2 파일</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">{r2Objects.length}개</span>
        </div>
        {r2Objects.length === 0 ? (
          <div className="p-8 bg-white dark:bg-gray-900 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg text-center text-sm text-gray-400 dark:text-gray-500">
            R2 버킷이 비어 있습니다
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm divide-y divide-gray-200 dark:divide-gray-800">
            {r2Objects.map(obj => {
              const ext = getFileExt(obj.key)
              const isAudio = ['mp3', 'wav', 'ogg', 'flac'].includes(ext)
              const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)
              const url = getObjectUrl(obj.key)
              const filename = obj.key.split('/').pop() ?? obj.key

              return (
                <div key={obj.key} className="px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{filename}</p>
                      <div className="flex gap-3 mt-1">
                        <span className="text-xs text-gray-500 dark:text-gray-400">{formatBytes(obj.size)}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {new Date(obj.uploaded).toLocaleDateString('ko-KR')}
                        </span>
                      </div>
                    </div>
                    {!isAudio && !isImage && (
                      <a
                        href={url}
                        download={filename}
                        className="text-xs text-[#F6821F] hover:text-[#e07318] flex-shrink-0 ml-4 font-medium transition-colors"
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
          </div>
        )}
      </section>

      {/* MIDI 마스터 섹션 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">MIDI 마스터</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">{midis.length}개</span>
        </div>
        {midis.length === 0 ? (
          <div className="p-8 bg-white dark:bg-gray-900 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg text-center text-sm text-gray-400 dark:text-gray-500">
            아직 MIDI 마스터가 없습니다
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm divide-y divide-gray-200 dark:divide-gray-800">
            {midis.map(midi => (
              <div key={midi.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {midi.source_url ? new URL(midi.source_url).pathname.split('/').pop() : midi.id.slice(0, 12)}
                  </p>
                  <div className="flex gap-3 mt-1">
                    {midi.bpm && <span className="text-xs text-gray-500 dark:text-gray-400">{midi.bpm.toFixed(0)} BPM</span>}
                    {midi.key_signature && <span className="text-xs text-gray-500 dark:text-gray-400">{midi.key_signature}</span>}
                    <span className="text-xs text-gray-400 dark:text-gray-500">{midi.usage_count}회 사용</span>
                  </div>
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 ml-4">
                  {new Date(midi.created_at).toLocaleDateString('ko-KR')}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
