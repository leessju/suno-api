import { getDb } from '@/lib/music-gen/db'

interface MidiMaster {
  id: string
  source_url: string | null
  midi_r2_key: string
  bpm: number | null
  key_signature: string | null
  usage_count: number
  created_at: number
}

export const dynamic = 'force-dynamic'

export default async function AssetsPage() {
  let midis: MidiMaster[] = []
  try {
    const db = getDb()
    midis = db.prepare(
      'SELECT * FROM midi_masters ORDER BY usage_count DESC, created_at DESC LIMIT 50'
    ).all() as MidiMaster[]
  } catch { /* DB not ready */ }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">에셋 라이브러리</h1>
        <span className="text-sm text-gray-400">MIDI 마스터 {midis.length}개</span>
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
    </div>
  )
}
