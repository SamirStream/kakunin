import { apiJson, preflight } from '@/lib/api'

export const dynamic = 'force-static'
export const OPTIONS = () => preflight()

const statusEnum = ['verified', 'former', 'lookalike', 'unknown']

// OpenAPI 3.1 description of the public API (served at /api/v1/openapi.json, rendered by /docs).
export function GET() {
  return apiJson({
    openapi: '3.1.0',
    info: { title: 'Kakunin API', version: '1.0.0', description: 'Is this person really a member of that project? Answers come from an ENSv2 team registry and signed attestations on Sepolia.' },
    servers: [{ url: 'https://kakunin.xyz' }],
    paths: {
      '/api/v1/check': {
        get: {
          summary: 'Check a person', operationId: 'check',
          parameters: [
            { name: 'telegramId', in: 'query', schema: { type: 'string' }, description: 'Numeric Telegram user ID (the identity that is attested).' },
            { name: 'username', in: 'query', schema: { type: 'string' }, description: 'Telegram @username (mutable; resolved to an ID through the directory, also used for lookalike detection).' },
            { name: 'displayName', in: 'query', schema: { type: 'string' } },
            { name: 'org', in: 'query', schema: { type: 'string', default: 'kakunin-demo.eth' } },
          ],
          responses: { '200': { description: 'A verdict', content: { 'application/json': { schema: { $ref: '#/components/schemas/CheckResponse' } } } }, '400': { description: 'Missing identifier' }, '429': { description: 'Rate limited (60/min)' } },
        },
      },
      '/api/v1/org/{name}': {
        get: { summary: 'The team an org publishes', parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string', example: 'kakunin-demo.eth' } }], responses: { '200': { description: 'Members with status, role and dates' }, '404': { description: 'Org not registered' } } },
      },
      '/api/badge/{label}': {
        get: { summary: 'SVG status badge for a team member', parameters: [{ name: 'label', in: 'path', required: true, schema: { type: 'string', example: 'alice' } }], responses: { '200': { description: 'image/svg+xml' } } },
      },
      '/api/paid/real': {
        get: { summary: 'Same check, paid per call over x402 (0.001 USDC, Base Sepolia)', description: 'Returns 402 with payment requirements. Use an x402 client; screen payTo before signing.', responses: { '200': { description: 'Verdict after payment' }, '402': { description: 'Payment required' } } },
      },
    },
    components: {
      schemas: {
        CheckResponse: {
          type: 'object',
          required: ['ok', 'result'],
          properties: {
            ok: { type: 'boolean' }, api: { type: 'string' }, checkedAt: { type: 'string', format: 'date-time' },
            result: { type: 'object', required: ['status', 'org'], properties: { status: { type: 'string', enum: statusEnum }, org: { type: 'string' }, member: { type: 'object' }, proof: { type: 'object', description: 'Only for verified: enough to re-check the attestation without trusting Kakunin.' } } },
          },
        },
      },
    },
  })
}
