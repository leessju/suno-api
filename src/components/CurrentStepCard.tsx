import Link from 'next/link'

const STEP_INFO: Record<number, { title: string; desc: string; href?: string; action?: string }> = {
  1: { title: '채널을 선택해주세요', desc: '워크스페이스에 사용할 YouTube 채널을 지정합니다.', href: 'settings', action: '채널 설정' },
  2: { title: '워크스페이스를 활성화하세요', desc: '워크스페이스 상태를 active로 변경합니다.' },
  3: { title: 'MIDI 또는 MP3 파일을 업로드하세요', desc: 'MIDI 변환 Job을 실행하면 음악 리스트가 생성됩니다.' },
  4: { title: '음악 리스트에서 트랙을 선택하세요', desc: '파이프라인에 포함할 Suno 트랙을 체크합니다.', href: 'variants', action: '트랙 선택' },
  5: { title: '각 트랙에 이미지를 연결하세요', desc: '썸네일/커버 이미지를 업로드하거나 연결합니다.', href: 'images', action: '이미지 연결' },
  6: { title: '렌더링을 실행하세요', desc: 'Remotion Job을 통해 영상을 생성합니다.' },
  7: { title: '머지 순서를 설정하세요', desc: '최종 영상에서 트랙을 합칠 순서를 지정합니다.', href: 'merge', action: '순서 지정' },
  8: { title: 'YouTube에 업로드하세요', desc: '렌더링된 영상을 YouTube 채널에 업로드합니다.', href: 'upload', action: '업로드' },
  9: { title: '쇼츠를 제작하세요', desc: '선택된 트랙으로 YouTube Shorts를 제작합니다.', href: 'shorts', action: '쇼츠 제작' },
  10: { title: '쇼츠를 업로드하세요', desc: '제작된 Shorts를 YouTube 채널에 업로드합니다.', href: 'shorts', action: '쇼츠 업로드' },
}

interface CurrentStepCardProps {
  workspaceId: string
  currentStep: number
  completedSteps: number[]
}

export function CurrentStepCard({ workspaceId, currentStep, completedSteps }: CurrentStepCardProps) {
  const allDone = completedSteps.length === 10
  if (allDone) {
    return (
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-5">
        <p className="text-sm font-medium text-green-700 dark:text-green-400">모든 단계가 완료되었습니다.</p>
      </div>
    )
  }

  const info = STEP_INFO[currentStep]
  if (!info) return null

  return (
    <div className="bg-background border border-border rounded-lg shadow-sm p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground font-medium mb-1">Step {currentStep}</p>
          <h3 className="text-sm font-semibold text-foreground">{info.title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{info.desc}</p>
        </div>
        {info.href && info.action && (
          <Link
            href={`/workspaces/${workspaceId}/${info.href}`}
            className="flex-shrink-0 px-3 py-1.5 bg-primary hover:bg-primary text-primary-foreground text-xs font-medium rounded-md transition-colors"
          >
            {info.action}
          </Link>
        )}
      </div>
    </div>
  )
}
