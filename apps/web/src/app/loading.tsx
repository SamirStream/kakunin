// Shown while a page reads ENSv2: a calm skeleton instead of a blank screen.
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-8 w-56 animate-pulse rounded-lg" style={{ background: 'var(--info-bg)' }} />
      <div className="h-28 animate-pulse rounded-2xl" style={{ background: 'var(--info-bg)' }} />
      <div className="h-40 animate-pulse rounded-2xl" style={{ background: 'var(--info-bg)' }} />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
