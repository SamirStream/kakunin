# Kakunin (確認)

**Verify that a "recruiter" really belongs to a Web3 project, using an ENSv2 team registry and signed attestations.** ETHGlobal Tokyo 2026.

> Testnet only (Sepolia). No mainnet funds are ever used.

## The problem

Impersonation is the #1 social-engineering vector in Web3. Scammers pose as recruiters or team members of real projects on Telegram, X and LinkedIn, then get victims to run malware or sign transactions. On 18 Sept 2026 Japan's National Police Agency, with the FBI and Australian/German agencies, published a joint advisory on **WaterPlum / "Contagious Interview"** (North Korea): 30,000+ devices infected in 100+ countries, 7,000+ wallets drained, about 1.7B JPY moved to the DPRK. Every infection started with a fake recruiter conversation.

Today the only defense is "be careful", and takedown tools chase an infinite list of fakes. **Kakunin certifies the real ones**: a finite, verifiable list that each project publishes on ENSv2.

## What it does

A check returns one of four answers:

| | Meaning |
|---|---|
| ✅ **Verified member** | Active subname in the org's team registry **and** a valid attestation signed by the org's own ENS name |
| 🕓 **Former member** | HR revoked the subname; the revocation date is derived from ENSv2 events |
| ⚠️ **Lookalike** | Handle / display name imitates a real member (NFKC, confusables, Levenshtein) |
| ❓ **Unknown** | The org publishes its team and this person is not in it |

Every failed check that claims an org raises an **impersonation alert** for that org (dashboard feed + Telegram).

Three sides:

- **Project (org):** owns `kakunin-demo.eth`; the team lives in its own registry `team.kakunin-demo.eth`. An **HR wallet** registers/revokes members through ENSv2 Enhanced Access Control **without controlling the root name**.
- **Member:** HR adds them, the app produces a one-time Telegram deep link, the member opens it from their own account; the bot captures the **numeric Telegram user ID** (never the mutable @username as identity) and the org attests it on ENS. No wallet needed for members.
- **Victim (free, public):** forward a suspicious message to the bot, or use the `/check` web page.

## Screenshots

Live against the Sepolia deployment (dark theme shown; the UI follows the system theme and is mobile-friendly).

| Live demo (4 real checks + alerts) | Org dashboard (team, EAC delegation, alerts) |
|---|---|
| ![Live demo](docs/screenshots/demo.png) | ![Org dashboard](docs/screenshots/dashboard.png) |

| Lookalike caught | Mobile |
|---|---|
| ![Lookalike](docs/screenshots/check-lookalike.png) | <img src="docs/screenshots/check-mobile.png" width="260" alt="Mobile check"> |

## How ENSv2 is used (central, not cosmetic)

| ENSv2 feature | Role in Kakunin | Code |
|---|---|---|
| **Hierarchical registries** (`UserRegistry` proxies via `VerifiableFactory`) | `kakunin-demo.eth` → `team.kakunin-demo.eth` → `alice.team.kakunin-demo.eth`; each level is its own registry | [`scripts/spike-ens.ts`](scripts/spike-ens.ts), [`packages/core/src/ens.ts`](packages/core/src/ens.ts) |
| **Enhanced Access Control** | HR gets `REGISTRAR｜UNREGISTER｜RENEW` on the **team registry root only** and `SET_TEXT` on the **team resolver only**. On-chain checks show HR cannot unregister `team`, change resolvers, or edit org records | [`/api/delegation`](apps/web/src/app/api/delegation/route.ts), dashboard panel |
| **Permissioned Resolver** (per-account, per-record roles) | A separate resolver for the team so HR's write permission never touches the org's own records | [`ens.ts`](packages/core/src/ens.ts) |
| **Universal Resolver V2** | All reads (`text`, `addr`) go through it, the way any ENSv2 client resolves | [`readText` / `readAddress`](packages/core/src/ens.ts) |
| **Registry events** (`LabelRegistered` / `LabelUnregistered`) | An unregistered name disappears from state, so "former member since …" comes from events and block timestamps | [`listMembers`](packages/core/src/ens.ts) |
| **Text records + draft ENSIP "Text Record Attestations"** ([PR #85](https://github.com/ensdomains/ensips/pull/85)) | The org's ENS name is the attester. Attestation lives at `attestations[org.telegram.id][kakunin-demo.eth]`; if the record, the owner or the attester key changes, it stops verifying | [`attestation.ts`](packages/core/src/attestation.ts) |

Attestation format: DAG-CBOR payload `{n,a,k,v,t}`, EIP-191 over `keccak256(payload)`, envelope `Tag(0x61747374)[version, t, sig]`. Our tests reproduce **byte for byte a real mainnet attestation** validated by the atst.me reference verifier (`jkm.eth`, attested by `atst.lighthousegov.eth`). We issue the draft-PR layout (v1) and verify both it and the deployed playground layout (v2). Details and the discrepancy we found are in [`specs/DECISIONS.md`](specs/DECISIONS.md).

### Deployed on Sepolia

See [`deployments/sepolia.json`](deployments/sepolia.json): `kakunin-demo.eth`, org registry, team registry, two resolvers (ENSv2 contract addresses are in `specs/DECISIONS.md`).

## Paid check for AI agents: x402 + Intercepta screening

Kakunin's check is also sold per call over **x402** (0.001 USDC, Base Sepolia). The buying agent **screens the destination with the live Intercepta API before it signs**, and the verdict decides what happens: pay, refuse, or ask a human.

| What | File |
|---|---|
| **Live Intercepta call** (`GET api.web3antivirus.io/api/public/v2/extension/account/{address}/quick-scan`, `x-api-key`) | [`apps/paid-api/src/screener.ts`](apps/paid-api/src/screener.ts) |
| Hook that screens `payTo` **before signing** (x402 `onBeforePaymentCreation`) and aborts on a bad verdict | [`apps/paid-api/src/agent.ts`](apps/paid-api/src/agent.ts) |
| Decision policy: refuse lookalike tokens, spending limits, refuse high-risk `payTo`, ask a human on medium/unknown, **fail closed** if screening errors | [`packages/core/src/screening.ts`](packages/core/src/screening.ts) |
| Paid API (seller) and a FAKE clone whose `payTo` is a flagged address | [`apps/paid-api/src/server.ts`](apps/paid-api/src/server.ts) |

Real run on 2026-09-26 (`pnpm --filter @kakunin/paid-api server` then `agent`):

```
=== http://localhost:4021/check?telegramId=100000001          (real Kakunin API)
  verdict  low, toxic score 0/100, no significant risk trait
  decision PAY, payTo 0x9140…1044 screened low; $0.001 within limits
  outcome  PAID  -> {"status":"verified","member":{"fqn":"alice.team.kakunin-demo.eth", ...}}
=== http://localhost:4022/check?telegramId=100000001          (fake clone)
  verdict  critical, toxic score 100/100; known_scammer; sanction_address; blacklist
  decision REFUSE
  outcome  BLOCKED, payment never signed
```

On-chain check afterwards: the agent went from 20 to 19.999 USDC and the org address received 0.001 USDC on Base Sepolia; nothing was sent to the clone. The payment runs on a testnet while the screened addresses are real mainnet addresses, as the prize asks.

**Feedback on the Intercepta API (5 lines)**
- Time to first call: about 2 minutes once the key arrived (the key itself took a few hours, we chased it in person/DM).
- Confusing: the API reference (`docs.web3antivirus.io`) sits behind a bot challenge, so scripts and AI tools get a 403; we found the host and path through a public search and confirmed them by calling. The response shape (`toxicScore` + `traits[]`) and its thresholds are not documented where we could read them, so the pay/refuse cut-offs in our policy are our own choice.
- Missing: quick-scan answers `404 "An Externally Owned Account with this address doesn't exist"` for contract addresses (e.g. Circle's USDC contract); many payees are contract wallets, so a contract-aware answer (or a clear "unsupported") would help agents.
- Nice: per-trait reasons (`sanction_address`, `known_scammer`, `blacklist`) are directly displayable to a person, and latency was about 1 second.
- Wish: a documented list of test addresses per risk class in the docs, not only in the chat channel.

## Architecture

```mermaid
flowchart LR
  subgraph Chain[ENSv2 · Sepolia]
    ORG[kakunin-demo.eth<br/>org registry]
    TEAM[team.kakunin-demo.eth<br/>team registry]
    RES[team resolver<br/>text + attestations]
    ORG --> TEAM --> RES
  end
  HR[HR wallet<br/>EAC: register / revoke only] -->|register, unregister, setText| TEAM
  OrgKey[Org key<br/>attester] -->|signs attestation| Bot
  Bot[Telegram bot<br/>grammY] -->|writes ID + attestation via HR| RES
  Victim((Victim)) -->|forward / @handle| Bot
  Victim -->|/check| Web[Next.js app]
  Web -->|Universal Resolver V2 + events| Chain
  Bot -->|Universal Resolver V2 + events| Chain
  Bot --> Store[(JSON store<br/>invites · directory · alerts)]
  Web --> Store
  Bot -->|impersonation alert| Admin((Org admins))
```

## Repo layout

```
packages/core   ENS read/write helpers (viem), attestations, lookalike detection, check engine, store, tests
apps/bot        Telegram bot (grammY)
apps/web        Next.js app: /check, /org/<name> dashboard (wallet), /demo
scripts         seed-demo, add-member, revoke-member, check, spike-ens (idempotent, --dry-run)
deployments     Sepolia addresses
specs           SPEC, DECISIONS (every decision and spike result, dated), PROMPTS
```

## Run it

Requirements: Node 22, pnpm.

```bash
pnpm install
cp .env.example .env            # then: pnpm spike:wallets  (generates throwaway testnet keys into .env)
# fund the printed ORG and HR addresses with Sepolia ETH (faucet)
pnpm test                       # 47 tests
pnpm rehearse                   # replays the whole demo against the live chain, with assertions
pnpm --filter @kakunin/scripts seed      # idempotent: attester address, members, attestations (add --dry-run to preview)
pnpm --filter @kakunin/web build && pnpm --filter @kakunin/web start   # http://localhost:3000
pnpm --filter @kakunin/bot dev           # needs TELEGRAM_BOT_TOKEN (BotFather) in .env
```

The 4-minute demo script and Q&A cheat sheet are in [`docs/DEMO.md`](docs/DEMO.md). Every on-chain script announces network, contract, function and arguments **before** sending. `KAKUNIN_DEMO_SIGNER=1` (localhost only) lets `/demo` revoke and reset with the throwaway keys.

## Status

- ✅ ENSv2 registry + EAC delegation + attestations + check engine: **verified live on Sepolia**
- ✅ Web app (`/check`, `/org` dashboard, `/demo`), tested against the live chain
- ✅ Telegram bot logic (onboarding, forwarded messages, alerts): unit-tested; live run needs a bot token
- ✅ x402 paid check + agent screened by the live Intercepta API (one payment approved, one blocked): tested on Base Sepolia
- ⏳ Curvegrid MultiBaas indexing: not done, see `specs/DECISIONS.md`

## AI attribution

This project is built by the team **with** AI assistance, as allowed by the event rules. Specs and prompts are in the repo ([`specs/`](specs/)).

- **Claude Code (Anthropic, Claude Sonnet 5)** wrote most of the code, tests and docs in this repository under the builder's direction: `packages/core`, `apps/bot`, `apps/web`, `scripts`, the specs and this README. Each commit carries a `Co-Authored-By: Claude` trailer.
- **Human contribution (the builder):** product concept and scope, all sponsor/prize strategy decisions, the decision to drop MTProto in favour of an own-registry username lookup, the EAC delegation design choices (org owns subnames; HR limited to the team registry), wallet funding and testnet operations, review and go/no-go on every on-chain action.
- ENSv2 contract facts were taken from docs.ens.domains and verified ABIs (Blockscout), not guessed; see `specs/DECISIONS.md`.

## Team

Samir: builder (GitHub [@SamirStream](https://github.com/SamirStream)).

## License

MIT
