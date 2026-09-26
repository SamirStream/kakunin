import Link from 'next/link'
import { HankoMark } from '@/components/Logo'

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <HankoMark size={72} title="Kakunin" />
      <h1 className="text-3xl font-extrabold">Nothing to verify here</h1>
      <p style={{ color: 'var(--muted)' }}>This page does not exist. If someone sent you this link claiming to be from a project, treat that with suspicion.</p>
      <div className="flex gap-3">
        <Link href="/" className="btn btn-primary">Home</Link>
        <Link href="/check" className="btn">Check a person</Link>
      </div>
    </div>
  )
}
