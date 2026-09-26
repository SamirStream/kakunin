'use client'
// The presenter's demo admin token lives only in this tab (sessionStorage) and is sent as x-demo-token on server-side demo actions.
const KEY = 'kakunin-demo-token'
export const getDemoToken = (): string => { try { return sessionStorage.getItem(KEY) ?? '' } catch { return '' } }
export const setDemoToken = (v: string) => { try { sessionStorage.setItem(KEY, v) } catch { /* private mode */ } }
export const demoHeaders = (): Record<string, string> => { const t = getDemoToken(); return t ? { 'x-demo-token': t } : {} }
