'use client'
// Kakunin Telegram Mini App. Three screens: Check (anyone), My card (the member's verified ID) and Team (org admins).
// Inside Telegram every API call carries Telegram's signed initData, so the server knows WHICH account is speaking.
// Outside Telegram it runs in a preview mode with sample data (the Check tab still does real, public checks).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ResultCard, type ApiResult } from '@/components/ResultCard'
import { HankoMark } from '@/components/Logo'
import { Stamp } from '@/components/Stamp'
import { CopyButton } from '@/components/CopyButton'
import { PREVIEW_ADMIN, PREVIEW_ME, type AdminData, type Me } from './fixtures'

/* eslint-disable @typescript-eslint/no-explicit-any */
type WebApp = any
declare global { interface Window { Telegram?: { WebApp?: WebApp } } }

type Tab = 'check' | 'card' | 'admin'
type Mode = 'boot' | 'live' | 'preview'
const BOT = 'KakuninxyzBot'
const SITE = 'https://kakunin.xyz'

const haptic = (tg: WebApp | null, kind: 'success' | 'error' | 'warning' | 'tap') => {
  try { kind === 'tap' ? tg?.HapticFeedback?.impactOccurred('light') : tg?.HapticFeedback?.notificationOccurred(kind) } catch { /* not in Telegram */ }
}
const shareUrl = (tg: WebApp | null, url: string, text: string) => {
  const link = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
  if (tg?.openTelegramLink) tg.openTelegramLink(link); else window.open(link, '_blank', 'noopener')
}
const short = (n: number, s = 6) => (n > 9999999 ? String(n) : String(n)).slice(0, s)

const ICONS: Record<Tab, string> = {
  check: 'M11 4a7 7 0 1 0 4.2 12.6l4.6 4.6 1.4-1.4-4.6-4.6A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z',
  card: 'M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 2v10h16V7H4Zm3 2h5v2H7V9Zm0 4h10v2H7v-2Z',
  admin: 'M12 2 3 6v6c0 5 3.8 9.7 9 11 5.2-1.3 9-6 9-11V6l-9-4Zm-1 14-4-4 1.4-1.4L11 13.2l4.6-4.6L17 10l-6 6Z',
}

export function TgApp() {
  const [mode, setMode] = useState<Mode>('boot')
  const [tab, setTab] = useState<Tab>('check')
  const [me, setMe] = useState<Me | null>(null)
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'bad' | 'info' } | null>(null)
  const tgRef = useRef<WebApp | null>(null)
  const initRef = useRef('')
  const previewRole = useRef<'member' | 'admin' | 'guest'>('member')
  // ?embed=1: shown inside a page (the landing's phone), so the preview notice would be noise.
  const [embed, setEmbed] = useState(false)
  useEffect(() => { setEmbed(new URLSearchParams(window.location.search).has('embed')) }, [])

  const say = useCallback((text: string, tone: 'ok' | 'bad' | 'info' = 'info') => {
    setToast({ text, tone })
    haptic(tgRef.current, tone === 'ok' ? 'success' : tone === 'bad' ? 'error' : 'tap')
    setTimeout(() => setToast(null), 3200)
  }, [])

  /** One place for every server call: adds the signed initData; in preview mode returns sample data instead. */
  const call = useCallback(async <T,>(path: string, body?: object): Promise<T> => {
    if (mode === 'preview' || (mode === 'boot' && !initRef.current)) {
      if (path === '/api/tg/me') return PREVIEW_ME[previewRole.current] as T
      if (path === '/api/tg/admin') return PREVIEW_ADMIN as T
      if (path === '/api/tg/check') { // real public check: the preview is honest about the engine
        const w = String((body as { who?: string })?.who ?? '').replace(/^@/, '')
        const res = await fetch('/api/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(/^\d{5,}$/.test(w) ? { telegramId: w } : { username: w }) })
        return (await res.json()) as T
      }
      throw new Error('Preview mode: open this app inside Telegram to do this for real.')
    }
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-tg-init': initRef.current }, body: JSON.stringify(body ?? {}) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((data as { message?: string; error?: string }).message ?? (data as { error?: string }).error ?? `request failed (${res.status})`)
    return data as T
  }, [mode])

  // Boot: wait for Telegram's SDK (loaded by the page), then either go live or fall back to the preview.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const q = new URLSearchParams(window.location.search)
      for (let i = 0; i < 25 && !window.Telegram?.WebApp; i++) await new Promise((r) => setTimeout(r, 100))
      if (cancelled) return
      const tg = window.Telegram?.WebApp ?? null
      if (tg?.initData) {
        tgRef.current = tg
        initRef.current = tg.initData
        tg.ready(); tg.expand()
        try { tg.setHeaderColor?.('secondary_bg_color') } catch { /* older clients */ }
        document.documentElement.setAttribute('data-theme', tg.colorScheme === 'dark' ? 'dark' : 'light')
        setMode('live')
      } else {
        const p = q.get('preview')
        previewRole.current = p === 'admin' ? 'admin' : p === 'guest' ? 'guest' : 'member'
        setMode('preview')
      }
    })()
    return () => { cancelled = true }
  }, [])

  const loadMe = useCallback(async () => {
    try {
      const data = await call<Me>('/api/tg/me')
      setMe(data)
      return data
    } catch (e) { say((e as Error).message, 'bad'); return null }
  }, [call, say])

  useEffect(() => {
    if (mode === 'boot') return
    void loadMe().then((m) => {
      const t = new URLSearchParams(window.location.search).get('tab') // deep link to a screen (also used for screenshots)
      if (m && (t === 'card' || t === 'check' || (t === 'admin' && m.admin))) setTab(t)
    })
  }, [mode, loadMe])

  // A pending invite arrives as ?invite=<token> (bot button) or as the Mini App start parameter.
  const inviteToken = useMemo(() => {
    if (typeof window === 'undefined') return null
    const t = new URLSearchParams(window.location.search).get('invite') ?? me?.startParam ?? null
    return t && /^[A-Za-z0-9_-]{8,40}$/.test(t) ? t : null
  }, [me?.startParam])

  useEffect(() => { if (inviteToken && me && me.result.status !== 'verified') setTab('card') }, [inviteToken, me])

  const tabs: Tab[] = me?.admin ? ['check', 'card', 'admin'] : ['check', 'card']
  const tg = tgRef.current

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
      <header className="flex items-center gap-2.5 border-b px-4 py-3" style={{ borderColor: 'var(--line)', paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <HankoMark size={30} />
        <div className="min-w-0 leading-tight">
          <div className="font-bold">Kakunin <span className="font-jp text-sm" style={{ color: 'var(--muted)' }}>確認</span></div>
          <div className="mono truncate" style={{ color: 'var(--muted)' }}>kakunin-demo.eth</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {mode === 'preview' && !embed && <span className="pill pill-warn">Preview</span>}
          {me?.admin && <span className="pill pill-info">Admin</span>}
        </div>
      </header>

      {mode === 'preview' && !embed && (
        <div className="border-b px-4 py-2 text-xs" style={{ borderColor: 'var(--line)', background: 'var(--warn-bg)', color: 'var(--warn)' }}>
          Preview with sample data. Open <a className="font-semibold underline" href={`https://t.me/${BOT}`}>@{BOT}</a> in Telegram for the real thing.
          {' '}<a className="underline" href="?preview=member">member</a> · <a className="underline" href="?preview=admin">admin</a> · <a className="underline" href="?preview=guest">guest</a>
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-4 pb-28 pt-4">
        <div className="mx-auto max-w-md space-y-4">
          {mode === 'boot' && <div className="h-40 animate-pulse rounded-2xl" style={{ background: 'var(--info-bg)' }} aria-busy />}
          {mode !== 'boot' && tab === 'check' && <CheckTab call={call} tg={tg} say={say} live={mode === 'live'} />}
          {mode !== 'boot' && tab === 'card' && <CardTab me={me} call={call} tg={tg} say={say} reload={loadMe} inviteToken={inviteToken} />}
          {mode !== 'boot' && tab === 'admin' && me?.admin && <AdminTab call={call} tg={tg} say={say} />}
          <p className="pt-3 text-center text-[11px]" style={{ color: 'var(--muted)' }}>
            By Samir Touinssi, CEO of{' '}
            <a className="font-semibold underline" href="https://thearch.consulting" onClick={(e) => { if (tg?.openLink) { e.preventDefault(); tg.openLink('https://thearch.consulting') } }} target="_blank" rel="noopener noreferrer">The Arch</a>
          </p>
        </div>
      </main>

      {toast && (
        <div className="pop fixed left-1/2 top-20 z-[110] max-w-[90vw] -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg" role="status"
          style={{ background: toast.tone === 'ok' ? 'var(--ok)' : toast.tone === 'bad' ? 'var(--bad)' : 'var(--primary)', color: toast.tone === 'info' ? 'var(--on-primary)' : '#fff' }}>
          {toast.text}
        </div>
      )}

      <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-[105] border-t" style={{ borderColor: 'var(--line)', background: 'var(--panel)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex max-w-md">
          {tabs.map((t) => (
            <button key={t} onClick={() => { haptic(tg, 'tap'); setTab(t) }} aria-current={tab === t ? 'page' : undefined}
              className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold" style={{ color: tab === t ? 'var(--brand)' : 'var(--muted)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d={ICONS[t]} /></svg>
              {t === 'check' ? 'Check' : t === 'card' ? 'My card' : 'Team'}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

type Common = { call: <T>(p: string, b?: object) => Promise<T>; tg: WebApp | null; say: (t: string, tone?: 'ok' | 'bad' | 'info') => void }

/* ---------------------------------------------------------------------------------------------- Check */
function CheckTab({ call, tg, say, live }: Common & { live: boolean }) {
  const [who, setWho] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ApiResult | null>(null)
  const [recent, setRecent] = useState<{ who: string; status: string }[]>([])
  useEffect(() => { try { setRecent(JSON.parse(sessionStorage.getItem('kk-recent') ?? '[]')) } catch { /* ignore */ } }, [])
  useEffect(() => { const w = new URLSearchParams(window.location.search).get('who'); if (w) void run(w) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function run(value: string) {
    const w = value.trim()
    if (!w) return
    setWho(w); setBusy(true); setResult(null)
    try {
      const r = await call<ApiResult>('/api/tg/check', { who: w })
      setResult(r)
      haptic(tg, r.status === 'verified' ? 'success' : r.status === 'unknown' ? 'warning' : 'error')
      const next = [{ who: w, status: r.status }, ...recent.filter((x) => x.who !== w)].slice(0, 5)
      setRecent(next)
      try { sessionStorage.setItem('kk-recent', JSON.stringify(next)) } catch { /* ignore */ }
    } catch (e) { say((e as Error).message, 'bad') } finally { setBusy(false) }
  }

  const EMOJI: Record<string, string> = { verified: '✅', former: '🕓', lookalike: '⚠️', unknown: '❓' }
  return (
    <>
      <div>
        <h1 className="text-2xl font-extrabold leading-tight">Is this person really from that project?</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>Paste their @username or numeric Telegram ID, or pick them from your chats.</p>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void run(who) }} className="space-y-2">
        <input className="input" value={who} onChange={(e) => setWho(e.target.value)} placeholder="@username or Telegram ID" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label="@username or Telegram ID" />
        <div className="flex gap-2">
          <button className="btn btn-primary flex-1 !py-3" disabled={busy || !who.trim()}>{busy ? 'Checking on ENS…' : 'Check'}</button>
          {live && (
            <button type="button" className="btn !py-3" onClick={() => { haptic(tg, 'tap'); tg?.openTelegramLink?.(`https://t.me/${BOT}?start=pick`) }}>Pick a contact</button>
          )}
        </div>
      </form>
      {busy && <div className="h-28 animate-pulse rounded-2xl" style={{ background: 'var(--info-bg)' }} aria-hidden />}
      {result && <ResultCard result={result} />}
      {!result && !busy && (
        <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
          Try:
          {['@alice_kakunn', '100000001', '@satoshi_recruiter'].map((x) => (
            <button key={x} type="button" className="pill pill-info" onClick={() => void run(x)}><span className="mono">{x}</span></button>
          ))}
        </div>
      )}
      {recent.length > 0 && (
        <section aria-label="Recent checks" className="space-y-1.5">
          <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Recent</h2>
          {recent.map((r) => (
            <button key={r.who} onClick={() => void run(r.who)} className="card flex w-full items-center gap-3 px-3 py-2 text-left text-sm">
              <span aria-hidden>{EMOJI[r.status] ?? '•'}</span><span className="mono truncate">{r.who}</span><span className="ml-auto text-xs" style={{ color: 'var(--muted)' }}>{r.status}</span>
            </button>
          ))}
        </section>
      )}
      <p className="text-xs" style={{ color: 'var(--muted)' }}>Tip: forward any suspicious message to the bot and it checks the sender for you.</p>
    </>
  )
}

/* ------------------------------------------------------------------------------------------- My card */
function CardTab({ me, call, tg, say, reload, inviteToken }: Common & { me: Me | null; reload: () => Promise<Me | null>; inviteToken: string | null }) {
  const [showProof, setShowProof] = useState(false)
  if (!me) return <div className="h-40 animate-pulse rounded-2xl" style={{ background: 'var(--info-bg)' }} aria-busy />
  const r = me.result
  const label = r.status === 'verified' || r.status === 'former' ? r.member.label : null
  const profile = label ? `${SITE}/v/${label}` : null

  return (
    <>
      <div className="flex items-center gap-3">
        {me.user.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.user.photo} alt="" className="h-12 w-12 rounded-full" />
        ) : <div className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold" style={{ background: 'var(--info-bg)' }} aria-hidden>{me.user.name.slice(0, 1)}</div>}
        <div className="min-w-0"><div className="truncate font-bold">{me.user.name}</div><div className="mono truncate" style={{ color: 'var(--muted)' }}>ID {me.user.id}{me.user.username ? ` · @${me.user.username}` : ''}</div></div>
      </div>

      {inviteToken && r.status !== 'verified' && <Onboard token={inviteToken} call={call} tg={tg} say={say} done={reload} />}

      {r.status === 'verified' && (
        <>
          <div className="paper paper-lift relative overflow-hidden p-5">
            <div className="absolute right-3 top-3"><Stamp status="verified" size={84} animate /></div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ok)' }}>Verified member</p>
            <div className="display mt-3 pr-24 text-[2.4rem] font-extrabold leading-none tracking-tight">{r.member.label}</div>
            <div className="mono mt-1 break-all pr-16" style={{ color: 'var(--muted)' }}>{r.member.fqn}</div>
            <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 pt-4 text-sm" style={{ borderTop: '1px solid var(--line)' }}>
              <div><dt className="text-xs" style={{ color: 'var(--muted)' }}>Role</dt><dd className="font-semibold">{r.member.role ?? '—'}</dd></div>
              <div><dt className="text-xs" style={{ color: 'var(--muted)' }}>Since</dt><dd className="font-semibold">{r.member.since ?? '—'}</dd></div>
              <div className="col-span-2"><dt className="text-xs" style={{ color: 'var(--muted)' }}>Signed by</dt><dd className="mono font-semibold">{r.org}</dd></div>
            </dl>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-primary !py-3" onClick={() => { haptic(tg, 'tap'); shareUrl(tg, profile!, `I'm a verified member of ${r.org} on Kakunin. Check me before you trust anyone claiming to be me:`) }}>Share my proof</button>
            <CopyButton text={profile!} label="Copy link" />
          </div>
          <button className="btn w-full" onClick={() => setShowProof((s) => !s)}>{showProof ? 'Hide proof' : 'Show on-chain proof'}</button>
          {showProof && <ResultCard result={r} />}
          <p className="rounded-xl p-3 text-xs" style={{ background: 'var(--info-bg)', color: 'var(--info)' }}>
            Your card proves <b>you</b> to the account with ID <span className="mono">{me.user.id}</span>. A shared link alone cannot: people should confirm the numeric ID of whoever writes to them.
          </p>
        </>
      )}

      {r.status === 'former' && (
        <div className="card space-y-2 p-5"><span className="pill pill-warn w-fit">🕓 Former member</span><p className="text-sm">Your access to <span className="mono">{r.org}</span> was revoked. People checking you will see that.</p></div>
      )}

      {r.status !== 'verified' && r.status !== 'former' && !inviteToken && (
        <div className="card space-y-3 p-5">
          <span className="pill pill-info w-fit">Not on a team yet</span>
          <h2 className="text-lg font-bold">Get your verified card</h2>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Your project’s HR sends you a one-time link. Opening it binds this Telegram account to your ENS name in one tap. No wallet needed.</p>
          <a className="btn" href={`${SITE}/docs`} target="_blank" rel="noopener noreferrer">How it works</a>
        </div>
      )}
    </>
  )
}

function Onboard({ token, call, tg, say, done }: Common & { token: string; done: () => Promise<Me | null> }) {
  const [inv, setInv] = useState<{ label: string; fqn: string; org: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0) // 0 idle, 1 signing, 2 writing, 3 done
  useEffect(() => { call<{ label: string; fqn: string; org: string }>('/api/tg/invite', { token }).then(setInv, (e) => setErr((e as Error).message)) }, [call, token])
  async function go() {
    setStep(1); haptic(tg, 'tap')
    const t = setTimeout(() => setStep(2), 4000) // the two on-chain writes take about 25 s
    try {
      await call('/api/tg/onboard', { token })
      clearTimeout(t); setStep(3); say('You are verified', 'ok')
      await done()
    } catch (e) { clearTimeout(t); setStep(0); setErr((e as Error).message); say((e as Error).message, 'bad') }
  }
  if (err && !inv) return <div className="card p-4 text-sm" role="alert"><span className="pill pill-bad mb-2">Invite problem</span><p>{err}</p></div>
  if (!inv) return <div className="h-24 animate-pulse rounded-2xl" style={{ background: 'var(--info-bg)' }} aria-busy />
  const steps = ['Confirm', 'Org signs the attestation', 'Writing records on ENS']
  return (
    <div className="card space-y-3 p-5">
      <span className="pill pill-info w-fit">Invitation</span>
      <h2 className="text-lg font-bold">Join {inv.org} as <span style={{ color: 'var(--brand)' }}>{inv.label}</span></h2>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>Your Telegram account will be attested on ENS as <span className="mono">{inv.fqn}</span>.</p>
      {step > 0 && (
        <ol className="space-y-1.5 text-sm" aria-live="polite">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-2" style={{ color: step > i ? 'var(--ink)' : 'var(--muted)' }}>
              <span aria-hidden>{step > i + 1 || step === 3 ? '✓' : step === i + 1 ? '…' : '·'}</span>{s}
            </li>
          ))}
        </ol>
      )}
      {err && <p className="text-xs" style={{ color: 'var(--bad)' }} role="alert">{err}</p>}
      <button className="btn btn-primary w-full !py-3" onClick={go} disabled={step > 0 && step < 3}>{step === 0 ? 'Verify me' : step < 3 ? 'Working… (about 25 s)' : 'Done'}</button>
    </div>
  )
}

/* ------------------------------------------------------------------------------------------- Team (admin) */
function AdminTab({ call, tg, say }: Common) {
  const [data, setData] = useState<AdminData | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [form, setForm] = useState({ label: '', role: '' })
  const [invite, setInvite] = useState<{ label: string; url: string } | null>(null)
  const load = useCallback(async () => { try { setData(await call<AdminData>('/api/tg/admin')) } catch (e) { say((e as Error).message, 'bad') } }, [call, say])
  useEffect(() => { void load(); const t = setInterval(load, 8000); return () => clearInterval(t) }, [load])

  async function confirmAsk(text: string): Promise<boolean> {
    if (tg?.showConfirm) return new Promise((res) => tg.showConfirm(text, (ok: boolean) => res(!!ok)))
    return window.confirm(text)
  }
  async function revoke(label: string) {
    if (!(await confirmAsk(`Revoke ${label}? They will show as a former member within seconds.`))) return
    setBusy(`rev-${label}`)
    try { await call('/api/tg/admin/revoke', { label }); say(`${label} revoked on-chain`, 'ok'); await load() } catch (e) { say((e as Error).message, 'bad') } finally { setBusy(null) }
  }
  async function mint(label: string, role?: string) {
    setBusy(`inv-${label}`)
    try {
      const r = await call<{ url: string }>('/api/tg/admin/add', { label, role })
      setInvite({ label, url: r.url }); say('Invite ready', 'ok'); await load()
    } catch (e) { say((e as Error).message, 'bad') } finally { setBusy(null) }
  }

  if (!data) return <div className="h-40 animate-pulse rounded-2xl" style={{ background: 'var(--info-bg)' }} aria-busy />
  const KIND: Record<string, string> = { lookalike: 'pill-bad', former: 'pill-warn', unknown: 'pill-info' }
  return (
    <>
      <div className="grid grid-cols-4 gap-2 text-center">
        {[['Active', data.stats.active, 'var(--ok)'], ['Attested', `${data.stats.attested}/${data.stats.active}`, 'var(--ink)'], ['Revoked', data.stats.revoked, 'var(--warn)'], ['Alerts 24h', data.stats.alerts24h, data.stats.alerts24h ? 'var(--bad)' : 'var(--ink)']].map(([l, v, c]) => (
          <div key={String(l)} className="card px-1 py-2.5"><div className="text-xl font-extrabold tabular-nums" style={{ color: String(c) }}>{v}</div><div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{l}</div></div>
        ))}
      </div>

      {data.alerts.length > 0 && (
        <section className="space-y-1.5" aria-label="Impersonation alerts">
          <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Impersonation alerts</h2>
          {data.alerts.slice(0, 4).map((a) => (
            <div key={a.id} className="card flex items-center gap-2 px-3 py-2 text-sm"><span className={`pill ${KIND[a.kind] ?? 'pill-info'}`}>{a.kind}</span><span className="mono truncate">{a.detail}</span></div>
          ))}
        </section>
      )}

      <section className="space-y-2" aria-label="Team">
        <div className="flex items-center justify-between"><h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Team</h2>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>live from ENSv2</span></div>
        {data.members.map((m) => (
          <div key={m.label} className="card space-y-2 p-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1"><div className="truncate font-semibold">{m.label} <span className="text-xs font-normal" style={{ color: 'var(--muted)' }}>{m.role ?? ''}</span></div>
                <div className="mono truncate" style={{ color: 'var(--muted)' }}>{m.telegramId ? `ID ${m.telegramId}` : 'not onboarded'}</div></div>
              <span className={`pill ${m.status === 'active' ? 'pill-ok' : 'pill-warn'}`}>{m.status === 'active' ? 'active' : 'revoked'}</span>
            </div>
            {m.status === 'active' && (
              <div className="grid grid-cols-2 gap-2">
                <button className="btn !py-2 !text-xs" disabled={busy !== null} onClick={() => mint(m.label)}>{busy === `inv-${m.label}` ? 'Creating…' : 'Invite link'}</button>
                <button className="btn btn-danger !py-2 !text-xs" disabled={busy !== null} onClick={() => revoke(m.label)}>{busy === `rev-${m.label}` ? 'Revoking… (~15 s)' : 'Revoke'}</button>
              </div>
            )}
          </div>
        ))}
      </section>

      {invite && (
        <div className="pop card space-y-2 p-4"><div className="font-semibold">One-time link for {invite.label}</div>
          <p className="mono break-all rounded-lg p-2 text-xs" style={{ background: 'var(--info-bg)' }}>{invite.url}</p>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-primary !py-2.5" onClick={() => shareUrl(tg, invite.url, `Your Kakunin invite (${invite.label}). Open it from your own Telegram:`)}>Send via Telegram</button>
            <CopyButton text={invite.url} label="Copy" />
          </div></div>
      )}

      <form className="card space-y-2 p-4" onSubmit={async (e) => { e.preventDefault(); const l = form.label.trim().toLowerCase(); if (!l) return; await mint(l, form.role.trim() || 'Member'); setForm({ label: '', role: '' }) }}>
        <h2 className="font-bold">Add a member</h2>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>Registers <span className="mono">label.team.kakunin-demo.eth</span> on-chain with the HR wallet, then creates the invite.</p>
        <div className="grid grid-cols-2 gap-2">
          <input className="input" placeholder="label (carol)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} autoCapitalize="none" aria-label="Member label" />
          <input className="input" placeholder="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} aria-label="Role" />
        </div>
        <button className="btn btn-primary w-full !py-3" disabled={busy !== null || !form.label.trim()}>{busy?.startsWith('inv-') ? 'Sending transactions… (~25 s)' : 'Add and create invite'}</button>
      </form>
    </>
  )
}
