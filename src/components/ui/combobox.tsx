'use client'

import { useState, useRef, useEffect } from 'react'

interface ComboboxProps {
  options: string[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  favorites?: string[]
  onSaveFavorites?: (favorites: string[]) => void
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = '선택 또는 입력',
  favorites = [],
  onSaveFavorites,
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState(value)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setInputValue(value) }, [value])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = inputValue
    ? options.filter(o => o.toLowerCase().includes(inputValue.toLowerCase()))
    : options.filter(o => !favorites.includes(o))

  const isFavorite = (opt: string) => favorites.includes(opt)
  const selectedCount = value ? 1 : 0

  function toggleFavorite(e: React.MouseEvent, opt: string) {
    e.stopPropagation()
    if (!onSaveFavorites) return
    onSaveFavorites(isFavorite(opt)
      ? favorites.filter(f => f !== opt)
      : [...favorites, opt]
    )
  }

  // 체크박스 클릭: 선택/해제만, 드롭다운 유지
  function toggleSelect(e: React.MouseEvent, opt: string) {
    e.stopPropagation()
    if (opt === value) {
      onChange('')
      setInputValue('')
    } else {
      onChange(opt)
      setInputValue(opt)
    }
  }

  // 행 텍스트 클릭: 선택 후 닫기
  function select(opt: string) {
    if (opt === value) {
      onChange('')
      setInputValue('')
    } else {
      onChange(opt)
      setInputValue(opt)
    }
    setOpen(false)
  }

  const showFavorites = favorites.length > 0 && !inputValue

  return (
    <div ref={containerRef} className="relative w-full">
      {/* 입력창 */}
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={inputValue}
          onChange={e => { setInputValue(e.target.value); onChange(e.target.value) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="flex-1 h-7 px-2 text-xs rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex-shrink-0 p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* 드롭다운 */}
      {open && (filtered.length > 0 || showFavorites) && (
        <div className="absolute z-50 top-full mt-1 w-full rounded-md border border-border bg-background shadow-md flex flex-col">
          {/* 옵션 목록 */}
          <div className="max-h-44 overflow-y-auto">
            {showFavorites && (
              <>
                <p className="px-2 pt-1.5 pb-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">즐겨찾기</p>
                {favorites.map(f => (
                  <div key={`fav-${f}`}
                    onClick={() => select(f)}
                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent cursor-pointer transition-colors">
                    <span
                      onClick={e => toggleSelect(e, f)}
                      className={`flex-shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center ${f === value ? 'bg-primary border-primary' : 'border-border'}`}>
                      {f === value && (
                        <svg className="w-2.5 h-2.5 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className="flex-1 text-xs truncate text-amber-600 dark:text-amber-400">★ {f}</span>
                  </div>
                ))}
                {filtered.length > 0 && <div className="border-t border-border my-0.5" />}
              </>
            )}
            {filtered.map(opt => (
              <div key={opt}
                onClick={() => select(opt)}
                className="flex items-center gap-2 px-2 py-1.5 hover:bg-accent cursor-pointer transition-colors">
                <span
                  onClick={e => toggleSelect(e, opt)}
                  className={`flex-shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center ${opt === value ? 'bg-primary border-primary' : 'border-border'}`}>
                  {opt === value && (
                    <svg className="w-2.5 h-2.5 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className={`flex-1 text-xs truncate ${opt === value ? 'font-medium text-foreground' : 'text-foreground/80'}`}>{opt}</span>
              </div>
            ))}
          </div>

          {/* 하단 바: 선택됨 + 좋아요 */}
          {onSaveFavorites && (
            <div className="flex items-center justify-between px-2 py-1.5 border-t border-border bg-muted/30">
              <span className="text-[10px] text-muted-foreground">
                {selectedCount > 0 ? `${selectedCount}개 선택됨` : '미선택'}
              </span>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={e => value && toggleFavorite(e, value)}
                disabled={!value}
                title={value ? (isFavorite(value) ? '즐겨찾기 해제' : '즐겨찾기 추가') : '먼저 항목을 선택하세요'}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground hover:text-amber-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <svg
                  className={`w-3.5 h-3.5 ${value && isFavorite(value) ? 'fill-amber-400 text-amber-400' : ''}`}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
                좋아요
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
