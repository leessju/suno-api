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
    : options

  const isFavorite = favorites.includes(value)

  function toggleFavorite() {
    if (!onSaveFavorites || !value) return
    if (isFavorite) {
      onSaveFavorites(favorites.filter(f => f !== value))
    } else {
      onSaveFavorites([...favorites, value])
    }
  }

  function select(opt: string) {
    onChange(opt)
    setInputValue(opt)
    setOpen(false)
  }

  const showFavorites = favorites.length > 0 && !inputValue

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={inputValue}
          onChange={e => { setInputValue(e.target.value); onChange(e.target.value) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="flex-1 h-7 px-2 text-xs rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {onSaveFavorites && (
          <button
            type="button"
            onClick={toggleFavorite}
            title={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
            className="flex-shrink-0 p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className={`w-3.5 h-3.5 ${isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
          </button>
        )}
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

      {open && (filtered.length > 0 || showFavorites) && (
        <div className="absolute z-50 top-full mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-border bg-background shadow-md">
          {showFavorites && (
            <>
              <p className="px-2 pt-1.5 pb-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">즐겨찾기</p>
              {favorites.map(f => (
                <button key={`fav-${f}`} type="button" onClick={() => select(f)}
                  className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent transition-colors truncate text-amber-600 dark:text-amber-400">
                  ★ {f}
                </button>
              ))}
              {filtered.length > 0 && <div className="border-t border-border my-0.5" />}
            </>
          )}
          {filtered.map(opt => (
            <button key={opt} type="button" onClick={() => select(opt)}
              className={`w-full text-left px-2 py-1.5 text-xs hover:bg-accent transition-colors truncate ${opt === value ? 'bg-accent/60 font-medium' : ''}`}>
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
