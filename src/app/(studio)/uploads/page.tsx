export default function UploadsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">업로드영상</h1>
        <p className="text-sm text-muted-foreground mt-1">YouTube 업로드 이력</p>
      </div>
      <div className="text-center py-16 text-muted-foreground">
        <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p>업로드 목록 기능은 준비 중입니다.</p>
      </div>
    </div>
  )
}
