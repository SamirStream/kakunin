# Security review (2026-09-26)

Scope: whole repo, reviewed by the AI assistant under the builder's direction, plus live attack tests against the running app. Testnet only (Sepolia, Base Sepolia); all keys are throwaway.

## Findings and fixes

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | `POST /api/invite` had **no authentication**: anyone could request an invite for an existing member (e.g. `alice`); opening it from their own Telegram would have bound THEIR numeric ID to Alice's subname and produced a valid attestation, i.e. they would show as "verified Alice". | **Critical** | **Fixed.** Invites now require a fresh (5 min) EIP-191 signature from the HR or ORG wallet over `org + member + timestamp` ([`packages/core/src/auth.ts`](../packages/core/src/auth.ts)); the dashboard signs with the connected wallet. Tested: no signature, attacker signature, signature replayed for another member, stale signature are all refused (unit tests + live requests). |
| 2 | `/api/demo` and `/api/agent` can sign/spend with server-side throwaway keys; the localhost check alone could be spoofed through a proxy/tunnel. | High if ever exposed | **Fixed.** Off unless `KAKUNIN_DEMO_SIGNER=1`, refused when any forwarded header is present, and the web app binds to `127.0.0.1` only. `.env.example` ships it disabled. |
| 3 | No rate limiting: every failed check raises an alert for the org and costs RPC calls, so spam = alert flood. | Medium | **Fixed.** Sliding-window limiter: 30 checks/min and 10 invites/min per client on the web, 12 messages/min per conversation on the bot. |
| 4 | 4 advisories in `postcss` (2 high, 2 moderate), pulled in by Next.js; only relevant when processing untrusted CSS (we do not). | Low in practice | **Fixed** with a pinned override (8.5.28). `pnpm audit --prod`: no known vulnerabilities. |
| 5 | Secrets in git. | - | **Clean.** Every secret in `.env` (3 wallet keys, bot token, admin secret, Intercepta key) was searched across ALL commits: none found. `.env`, `data/`, `scripts/state.sepolia.json` are ignored. |

| 6 | Cloud mode adds public attack surface: a Telegram webhook, server-side demo actions and the agent demo on a public host. | Medium | **Mitigated.** Webhook requires the secret header (); revoke/reset need  plus a constant-time-compared admin token (proxied "localhost" requests get no free pass); the public agent demo is rate limited (3 / 10 min per client, 150 / day); single-use invites are consumed atomically (). Unit-tested in . |

## Design properties worth keeping

- **Fail closed everywhere**: screening errors never auto-pay (`ask-human`); an attestation that does not verify never yields "verified"; unknown/failed inputs yield "unknown".
- **Identity = numeric Telegram ID**, never the mutable @username; usernames only select which ID to check.
- **Least privilege on-chain (ENSv2 EAC)**: HR can register/revoke members and edit member records only; it cannot touch the org root name, resolvers or subregistry pointers (checked live by the dashboard's delegation panel).
- **Every on-chain script announces** network, contract, function and args before sending; dry-run mode exists.
- Bot replies are plain text (no parse mode), the web renders values through React (escaped).

## Known limitations (accepted for a hackathon)

- The off-chain directory (`data/store.json`) is a local JSON file; a production deployment needs a real database and authenticated org admin sessions instead of a wallet signature per action.
- Lookalike detection is heuristic (NFKC, confusables map, Levenshtein): it can miss creative spoofs and can flag unrelated short names (mitigated by stricter thresholds for short strings).
- Intercepta quick-scan covers EOAs only; contract payees are treated as "unknown" and need a human.
- Rate limiters are in-memory (per process/instance); on serverless the daily agent cap is per instance.
- In the cloud the throwaway testnet keys live in the Vercel environment (readable by project members).
- The Intercepta sandbox key was shared in a chat session by the builder; it is a free 1,000-request key kept only in `.env`, rotate it if in doubt.
