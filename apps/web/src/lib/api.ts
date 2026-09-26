// Helpers for the public, CORS-enabled v1 API.
export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
} as const

/** JSON response with CORS headers so browsers, extensions and other sites can call the API directly. */
export const apiJson = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  Response.json(data, { status, headers: { ...CORS, 'cache-control': 'no-store', ...extra } })

export const preflight = () => new Response(null, { status: 204, headers: CORS })
