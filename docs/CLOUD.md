# Running everything on the cloud (Vercel)

The web app, the Telegram bot (webhook), the x402 paid API and its fake clone, the agent demo and the persistent store all run inside the one Vercel project. Nothing needs to stay running on a laptop.

| Piece | Local | Cloud |
|---|---|---|
| Web app, `/api/*` | `pnpm web` | Vercel, root directory `apps/web` |
| Store (alerts, invites, Telegram directory) | `data/store.json` | **Upstash Redis** (REST), picked automatically when `KV_REST_API_URL` / `KV_REST_API_TOKEN` exist |
| Telegram bot | `pnpm bot` (long polling) | **Webhook** `POST /api/telegram` (secret header checked) |
| x402 paid API + fake clone | same app: `/api/paid/real`, `/api/paid/clone` | same routes, same code |
| Agent demo | `/demo` section 5 | same, open to everyone but rate limited (3 runs / 10 min per client, 150 / day) |
| HR revoke / reset buttons | `/demo` | same, **presenter only**: they need the demo admin token (`x-demo-token`) |

Telegram allows either a webhook or polling, never both: while the webhook is set, `pnpm bot` refuses to start.

## One-time setup (about 10 minutes)

1. **Environment variables.** Run `pnpm vercel:env`: it writes `.env.vercel` (gitignored) from your local `.env` and prints variable NAMES only. In Vercel: Project → Settings → Environment Variables → **Import .env**, paste the file, save. Delete `.env.vercel` afterwards.
2. **Persistent store.** Vercel → Storage (or Marketplace) → **Upstash Redis** → create → connect to this project (it adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically).
3. **Redeploy** the latest commit (Deployments → ⋯ → Redeploy).
4. **Move the bot to the cloud.** Stop the local bot, then `pnpm webhook:set https://kakunin.xyz`.
5. **Verify.** `pnpm cloud:check https://kakunin.xyz` (add `--agent` to also run one approved + one blocked payment: 0.001 USDC, 4 Intercepta calls). It prints what is configured and what is still missing.

Go back to local polling at any time: `pnpm webhook:delete`, then `pnpm bot`.

## Variables (names; values come from your `.env`)

| Variable | Role | Secret |
|---|---|---|
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_SECRET` | bot + webhook auth + `/subscribe` | yes (username no) |
| `ORG_PRIVATE_KEY`, `HR_PRIVATE_KEY` | the bot signs the attestation (ORG) and writes the records (HR) | yes: throwaway testnet keys |
| `AGENT_PRIVATE_KEY`, `INTERCEPTA_API_KEY` | demo agent wallet and live screening | yes |
| `DEMO_ADMIN_TOKEN`, `KAKUNIN_DEMO_SIGNER=1` | enables presenter-only revoke/reset | token: yes |
| `KAKUNIN_AGENT_PUBLIC=1` | lets anyone run the agent demo (rate limited) | no |
| `SEPOLIA_RPC_URL` | Sepolia RPC (an Alchemy URL is more reliable than the public node) | URL may embed a key |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash, added by the integration | yes |

## What to know

- The keys are **throwaway testnet keys**; anyone with Vercel project access can read them. Never reuse wallets that hold real funds.
- Without the admin token, the revoke/reset endpoints answer 403; the agent endpoint is public by design but capped.
- Onboarding a member takes about 25 s (two Sepolia transactions); the webhook function is allowed 60 s.
- In serverless, rate limiters and the tiny members cache are per instance. That is enough for a demo, not for production.
