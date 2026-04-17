import { getDb } from '@/lib/music-gen/db'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'

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

export default async function ApprovalBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  const session = db.prepare(
    'SELECT * FROM approval_sessions WHERE id = ?'
  ).get(id) as Session | undefined

  if (!session) notFound()

  const votes = db.prepare(
    'SELECT * FROM approval_votes WHERE session_id = ? ORDER BY ts ASC'
  ).all(id) as Vote[]

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
    <div className="space-y-6 w-full">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">결재 보드</h1>
          <p className="text-sm text-muted-foreground mt-1">트랙: {session.track_id}</p>
        </div>
        <span className={`self-start px-2 py-0.5 rounded-full text-xs font-medium ${
          session.status === 'approved'
            ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400'
            : session.status === 'rejected'
            ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
            : 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
        }`}>
          {session.status.toUpperCase()}
        </span>
      </div>

      {/* 평균 점수 */}
      <div className="bg-background border border-border rounded-lg shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-muted-foreground">평균 점수</p>
          <p className="text-2xl font-bold text-foreground">{avgScore.toFixed(1)}</p>
        </div>
        <div className="h-2 bg-accent rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              avgScore >= 70 ? 'bg-green-500' : avgScore >= 50 ? 'bg-amber-500' : 'bg-red-500'
            }`}
            style={{ width: `${avgScore}%` }}
          />
        </div>
      </div>

      {/* Persona 투표 결과 */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Agent 평가</h2>
        {votes.filter(v => v.voter_type === 'agent').map(vote => (
          <div key={vote.id} className="bg-background border border-border rounded-lg shadow-sm p-5">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-medium text-sm text-foreground">{personaNames[vote.voter_id] ?? vote.voter_id}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  vote.verdict === 'approve'
                    ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                    : vote.verdict === 'reject'
                    ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                    : 'bg-accent text-muted-foreground'
                }`}>
                  {vote.verdict}
                </span>
                <span className="text-lg font-bold text-foreground">{vote.score?.toFixed(0)}</span>
              </div>
            </div>
            <div className="h-1.5 bg-accent rounded-full overflow-hidden mb-2">
              <div
                className={`h-full rounded-full ${
                  (vote.score ?? 0) >= 70 ? 'bg-green-500' : (vote.score ?? 0) >= 50 ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ width: `${vote.score ?? 0}%` }}
              />
            </div>
            {vote.comment && (
              <p className="text-sm text-muted-foreground">{vote.comment}</p>
            )}
          </div>
        ))}
        {votes.length === 0 && (
          <div className="bg-background border border-border rounded-lg shadow-sm p-5 text-center text-sm text-muted-foreground">
            결재 진행 중...
          </div>
        )}
      </div>

      {/* 사용자 override */}
      {session.status === 'pending' && (
        <div className="flex gap-3">
          <form action={`/api/music-gen/approvals/${id}/vote`} method="POST">
            <input type="hidden" name="verdict" value="approve" />
            <Button type="submit" className="px-4 py-2 bg-green-600 hover:bg-green-500 text-primary-foreground text-sm font-medium rounded-md transition-colors">
              승인 Override
            </Button>
          </form>
          <form action={`/api/music-gen/approvals/${id}/vote`} method="POST">
            <input type="hidden" name="verdict" value="reject" />
            <Button type="submit" className="px-4 py-2 bg-red-600 hover:bg-red-500 text-primary-foreground text-sm font-medium rounded-md transition-colors">
              거절 Override
            </Button>
          </form>
        </div>
      )}
    </div>
  )
}
