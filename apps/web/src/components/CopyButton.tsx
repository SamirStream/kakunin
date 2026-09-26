'use client'
import { useState } from 'react'

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button" className="btn !px-2.5 !py-1 !text-xs"
      onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) } catch { /* clipboard blocked */ } }}
    >{done ? 'Copied ✓' : label}</button>
  )
}
