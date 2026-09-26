'use client'
import { HankoMark } from '@/components/Logo'

// Route-level error boundary: a chain or network hiccup should never leave a blank page during a demo.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center" role="alert">
      <HankoMark size={72} title="Kakunin" />
      <h1 className="text-3xl font-extrabold">Something went wrong</h1>
      <p style={{ color: 'var(--muted)' }}>The chain or the network did not answer in time. Nothing was changed. Try again in a moment.</p>
      <button className="btn btn-primary" onClick={() => reset()}>Try again</button>
    </div>
  )
}
