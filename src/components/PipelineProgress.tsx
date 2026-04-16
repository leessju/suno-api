'use client'

import Link from 'next/link'

export interface PipelineStep {
  number: number
  label: string
  href?: string
}

export const PIPELINE_STEPS: PipelineStep[] = [
  { number: 1, label: '채널 선택' },
  { number: 2, label: '워크스페이스' },
  { number: 3, label: 'MIDI/MP3' },
  { number: 4, label: '음악 선택', href: 'variants' },
  { number: 5, label: '이미지 연결', href: 'images' },
  { number: 6, label: '렌더링' },
  { number: 7, label: '머지 순서', href: 'merge' },
  { number: 8, label: 'YT 업로드', href: 'upload' },
  { number: 9, label: '쇼츠 제작', href: 'shorts' },
  { number: 10, label: '쇼츠 업로드', href: 'shorts' },
]

interface PipelineProgressProps {
  workspaceId: string
  currentStep: number
  completedSteps: number[]
}

export function PipelineProgress({ workspaceId, currentStep, completedSteps }: PipelineProgressProps) {
  return (
    <div className="bg-background border border-border rounded-lg shadow-sm p-5">
      <h2 className="text-sm font-medium text-foreground mb-4">파이프라인 진행 현황</h2>
      <div className="flex items-start gap-1 overflow-x-auto pb-1">
        {PIPELINE_STEPS.map((step, idx) => {
          const isDone = completedSteps.includes(step.number)
          const isCurrent = step.number === currentStep
          const href = step.href ? `/workspaces/${workspaceId}/${step.href}` : undefined

          const circleClass = isDone
            ? 'bg-primary text-primary-foreground border-foreground'
            : isCurrent
            ? 'bg-accent dark:bg-accent text-foreground border-foreground dark:border-foreground'
            : 'bg-accent text-muted-foreground border-border'

          const labelClass = isDone
            ? 'text-foreground font-medium'
            : isCurrent
            ? 'text-foreground font-medium'
            : 'text-muted-foreground'

          const inner = (
            <div className="flex flex-col items-center gap-1.5 min-w-[52px]">
              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-semibold flex-shrink-0 transition-colors ${circleClass}`}>
                {isDone ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : step.number}
              </div>
              <span className={`text-[10px] text-center leading-tight ${labelClass}`}>{step.label}</span>
            </div>
          )

          return (
            <div key={step.number} className="flex items-start">
              {href ? (
                <Link href={href} className="hover:opacity-80 transition-opacity">
                  {inner}
                </Link>
              ) : inner}
              {idx < PIPELINE_STEPS.length - 1 && (
                <div className={`mt-4 w-4 flex-shrink-0 h-0.5 mx-0.5 ${
                  completedSteps.includes(step.number) ? 'bg-primary/60' : 'bg-background'
                }`} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
