'use client'
import { useEffect, useState } from 'react'

type Theme = 'system' | 'light' | 'dark'
const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
const ICON: Record<Theme, string> = { system: '◐', light: '☀', dark: '☾' }

// Applies data-theme on <html> (the CSS reads it) and remembers the choice; an inline script in the layout applies it before paint.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system')
  useEffect(() => { try { setTheme((localStorage.getItem('kk-theme') as Theme) || 'system') } catch { /* private mode */ } }, [])
  function cycle() {
    const t = NEXT[theme]
    setTheme(t)
    try { localStorage.setItem('kk-theme', t) } catch { /* ignore */ }
    if (t === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', t)
  }
  return (
    <button className="btn !px-2.5 !py-1.5" onClick={cycle} aria-label={`Theme: ${theme}. Click to change`} title={`Theme: ${theme}`}>
      <span aria-hidden>{ICON[theme]}</span>
    </button>
  )
}
