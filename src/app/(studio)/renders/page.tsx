export default function RendersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">렌더영상</h1>
        <p className="text-sm text-muted-foreground mt-1">생성된 영상 목록</p>
      </div>
      <div className="text-center py-16 text-muted-foreground">
        <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <p>렌더 영상 기능은 준비 중입니다.</p>
      </div>
    </div>
  )
}
