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

| 6 | Cloud mode adds public attack surface: a Telegram webhook, server-side demo actions and the agent demo on a public host. | Medium | **Mitigated.** Webhook requires the secret header (`TELEGRAM_WEBHOOK_SECRET`); revoke/reset need `KAKUNIN_DEMO_SIGNER=1` plus a constant-time-compared admin token (proxied "localhost" requests get no free pass); the public agent demo is rate limited (3 / 10 min per client, 150 / day); single-use invites are consumed atomically (`GETDEL`). Unit-tested in `packages/core/test/access.test.ts`. |

| 7 | Telegram Mini App: a page inside Telegram could try to claim another user's identity or call admin actions. | High if unauthenticated | **Mitigated.** Every `/api/tg/*` call must carry Telegram's signed `initData`; the HMAC-SHA256 signature is verified with the bot token (constant-time), replay window 24 h, future-dated data refused. Admin routes additionally require the caller's Telegram ID to be an org admin (ran `/subscribe`). The ID attested at onboarding is the signed one, never a page-supplied value. Per-user rate limit (60/min). Tested: forged user ID, wrong bot token, swapped/missing hash, expired data (`packages/core/test/telegram.test.ts`) and live against the running API. |

| 8 | Self-serve organisations (2026-09-27): anyone can create an organisation, and Kakunin holds one **operator key per organisation** so members can be added and attested without the owner paying gas. | High if mishandled | **Mitigated.** (a) The ENS name is registered to the OWNER's wallet, which holds every EAC role; the operator gets only `REGISTRAR｜UNREGISTER｜RENEW` on the team registry, `SET_TEXT` on the team resolver and `SET_ADDRESS` on the org resolver, and drops its setup rights on the org root in the last provisioning step (verified live: the dashboard reads the bitmaps; org-root rows are all "denied"). The owner can revoke the operator on-chain at any time. (b) Operator keys are stored AES-256-GCM sealed (`KAKUNIN_KEY_SECRET`), so a database leak alone reveals nothing (`packages/core/src/crypto.ts`, tested incl. tampering). (c) Admin actions need an EIP-191 signature from the owner wallet naming org, action and exact target, valid 5 minutes (a read-only session signature lasts 1 hour); wrong signer, wrong action, wrong target, wrong org and stale signatures are refused (`packages/core/test/auth.test.ts`, live in `scripts/e2e-http.ts`). (d) Sponsored testnet ETH is protected by name validation against ENSv2, a per-client creation limit (3 / hour), a global cap of 30 organisations and a sponsor reserve floor. (e) Per-organisation data (directory, alerts, admins, invites) is scoped by organisation; a Telegram admin of one organisation is refused on another (tested). Alerts of self-serve organisations are private to their owner wallet; @usernames are only shown to signed-in admins. |

| 9 | Reporting (2026-09-27): a public button that writes to an organisation's queue could be used to smear a real person, to flood admins, or to publish a false "compromised" claim. | Medium | **Mitigated by design.** A report is only a queue entry: nothing public changes until an admin's signed decision (`confirm-report`, `dismiss-report`, `mark-compromised`; wrong signer, wrong action, wrong target and stale signatures are refused). Reports are merged per account and rate limited (5 per hour, 20 per day per client), a verified member cannot be reported as an impersonator, only a verified member can be reported as compromised, notes are capped at 280 characters and rendered as text. A confirmation can be retracted. Impersonators are stored per organisation only, so one organisation cannot flag accounts for another. |

## Design properties worth keeping

- **Fail closed everywhere**: screening errors never auto-pay (`ask-human`); an attestation that does not verify never yields "verified"; unknown/failed inputs yield "unknown".
- **Identity = numeric Telegram ID**, never the mutable @username; usernames only select which ID to check.
- **Least privilege on-chain (ENSv2 EAC)**: HR can register/revoke members and edit member records only; it cannot touch the org root name, resolvers or subregistry pointers (checked live by the dashboard's delegation panel).
- **Every on-chain script announces** network, contract, function and args before sending; dry-run mode exists.
- Bot replies are plain text (no parse mode), the web renders values through React (escaped).

## Known limitations (accepted for a hackathon)

- The off-chain directory is Upstash Redis in the cloud (JSON file locally). A production deployment would add backups, per-organisation encryption of Telegram usernames and audit logs; admin actions already need a wallet signature per action.
- The operator key is custodial by design (that is what lets admins pay no gas). It is a testnet key with least-privilege roles; a mainnet version would move to per-organisation smart-account session keys or a KMS/HSM.
- Lookalike detection is heuristic (NFKC, confusables map, Levenshtein): it can miss creative spoofs and can flag unrelated short names (mitigated by stricter thresholds for short strings).
- Intercepta quick-scan covers EOAs only; contract payees are treated as "unknown" and need a human.
- Rate limiters are in-memory (per process/instance); on serverless the daily agent cap is per instance.
- The Mini App admin console signs HR actions server-side with the throwaway HR key (a custodial-HR design for Telegram-first orgs); authorization is the admin Telegram ID, not a wallet.
- In the cloud the throwaway testnet keys live in the Vercel environment (readable by project members).
- The Intercepta sandbox key was shared in a chat session by the builder; it is a free 1,000-request key kept only in `.env`, rotate it if in doubt.
