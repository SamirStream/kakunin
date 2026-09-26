// Tiny in-memory sliding-window limiter (per key). Protects the public check endpoints / bot from spam: every failed check
// raises an alert for the org, so unlimited checks would mean unlimited alert spam and RPC cost.
export function createRateLimiter(max: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, number[]>()
  return {
    /** true if this call is allowed (and counted), false if the key is over its limit */
    take(key: string): boolean {
      const t = now()
      const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs)
      if (recent.length >= max) {
        hits.set(key, recent)
        return false
      }
      recent.push(t)
      hits.set(key, recent)
      if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((x) => t - x < windowMs)) hits.delete(k)
      return true
    },
  }
}
