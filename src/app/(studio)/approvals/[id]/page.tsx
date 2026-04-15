import { getDb } from '@/lib/music-gen/db'
import { notFound } from 'next/navigation'

interface Vote {
  id: number
  voter_type: string
  voter_id: string
  score: number
  verdict: string
  comment: string
  ts: number
}

interface Session {
  id: string
  track_id: string
  workspace_id: string
  status: string
  started_at: number
  concluded_at: number | null
  final_verdict: string | null
}

export default async function ApprovalBoardPage({ params }: { params: { id: string } }) {
  const db = getDb()
  const session = db.prepare(
    'SELECT * FROM approval_sessions WHERE id = ?'
  ).get(params.id) as Session | undefined

  if (!session) notFound()

  const votes = db.prepare(
    'SELECT * FROM approval_votes WHERE session_id = ? ORDER BY ts ASC'
  ).all(params.id) as Vote[]

  const avgScore = votes.length > 0
    ? votes.reduce((s, v) => s + (v.score ?? 0), 0) / votes.length
    : 0

  const personaNames: Record<string, string> = {
    melody_critic: 'Melody Critic',
    production_judge: 'Production Judge',
    lyric_analyst: 'Lyric Analyst',
    genre_purist: 'Genre Purist',
    user: '사용자',
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">결재 보드</h1>
          <p className="text-gray-400 text-sm mt-1">트랙: {session.track_id}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
          session.status === 'approved' ? 'bg-green-900/50 text-green-400' :
          session.status === 'rejected' ? 'bg-red-900/50 text-red-400' :
          'bg-yellow-900/50 text-yellow-400'
        }`}>
          {session.status.toUpperCase()}
        </span>
      </div>

      {/* 평균 점수 */}
      <div className="p-4 bg-gray-900 rounded-xl border border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-gray-400">평균 점수</p>
          <p className="text-2xl font-bold">{avgScore.toFixed(1)}</p>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              avgScore >= 70 ? 'bg-green-500' : avgScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${avgScore}%` }}
          />
        </div>
      </div>

      {/* Persona 투표 결과 */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-gray-400">Agent 평가</h2>
        {votes.filter(v => v.voter_type === 'agent').map(vote => (
          <div key={vote.id} className="p-4 bg-gray-900 rounded-xl border border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-medium text-sm">{personaNames[vote.voter_id] ?? vote.voter_id}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  vote.verdict === 'approve' ? 'bg-green-900/50 text-green-400' :
                  vote.verdict === 'reject' ? 'bg-red-900/50 text-red-400' :
                  'bg-gray-800 text-gray-400'
                }`}>
                  {vote.verdict}
                </span>
                <span className="text-lg font-bold">{vote.score?.toFixed(0)}</span>
              </div>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-2">
              <div
                className={`h-full rounded-full ${
                  (vote.score ?? 0) >= 70 ? 'bg-green-500' : (vote.score ?? 0) >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${vote.score ?? 0}%` }}
              />
            </div>
            {vote.comment && (
              <p className="text-xs text-gray-400">{vote.comment}</p>
            )}
          </div>
        ))}
        {votes.length === 0 && (
          <div className="p-4 bg-gray-900 rounded-xl border border-gray-800 text-center text-gray-400 text-sm">
            결재 진행 중...
          </div>
        )}
      </div>

      {/* 사용자 override */}
      {session.status === 'pending' && (
        <div className="flex gap-3">
          <form action={`/api/music-gen/approvals/${params.id}/vote`} method="POST">
            <input type="hidden" name="verdict" value="approve" />
            <button type="submit" className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg transition-colors">
              승인 Override
            </button>
          </form>
          <form action={`/api/music-gen/approvals/${params.id}/vote`} method="POST">
            <input type="hidden" name="verdict" value="reject" />
            <button type="submit" className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg transition-colors">
              거절 Override
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
