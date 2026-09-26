# Kakunin: product spec (current state, 2026-09-26)

Kakunin (確認, "verification") tells anyone whether a "recruiter" or "team member" really belongs to a Web3 project. Projects publish their team on **ENSv2**; checks return a verdict with proof. This file is the living spec: what is built, what it guarantees, and what is out of scope. Decisions and spike results are dated in [`DECISIONS.md`](DECISIONS.md); the prompts given to the AI assistant are in [`PROMPTS.md`](PROMPTS.md).

## 1. Problem

Impersonation is the #1 social-engineering vector in Web3: fake recruiters lead developers to run malware or sign transactions (DPRK "Contagious Interview" / WaterPlum). Takedown tools chase an infinite list of fakes. Kakunin publishes a **finite, verifiable list of the real ones**.

## 2. Actors and flows

| Actor | Flow |
|---|---|
| **Org** | Owns `kakunin-demo.eth` and its registry `team.kakunin-demo.eth` (ENSv2, Sepolia). The org owns every member subname (members need no wallet). The org's ENS name is the **attester**. |
| **HR** | A separate wallet with ENSv2 EAC roles `REGISTRAR｜UNREGISTER｜RENEW` on the team registry root and `SET_TEXT` on the team resolver only. Registers/revokes members and edits their records. Cannot touch the root name, resolvers or subregistry pointers. |
| **Member** | HR adds them; the dashboard issues a one-time Telegram link (signed by the HR/ORG wallet). Opening it from the member's own Telegram binds their **numeric Telegram ID** (and current @username, off-chain); the org signs an attestation, written on the subname. |
| **Victim** (free, public) | Forwards a suspicious message to the bot, or uses `/check`. Gets one of four verdicts. |
| **Agent** (paid) | Buys checks over x402 (0.001 USDC, Base Sepolia). Before signing it screens the payee with Intercepta. |

## 3. Verdicts (the contract of `checkIdentity`)

1. ✅ **verified**: the numeric ID matches `org.telegram.id` of an ACTIVE subname **and** the attestation record verifies against live ENS data and the attester address that `kakunin-demo.eth` currently resolves to.
2. 🕓 **former**: the ID matches a subname that was registered and later unregistered; date = block timestamp of the `LabelUnregistered` event.
3. ⚠️ **lookalike**: no member match, but the @username or display name imitates a member (NFKC, case fold, confusables, `rn→m`, Levenshtein ≤ 2, ≤ 1 for short strings).
4. ❓ **unknown**: none of the above. Also returned when a record exists but its attestation does not verify (`invalid-attestation`), and for orgs that publish no team.

Every non-verified result raises an **alert** (dashboard feed and Telegram admin chats). Fail closed: anything unverifiable is never "verified".

## 4. On-chain design (ENSv2 Sepolia)

- Hierarchy: `kakunin-demo.eth` (ETHRegistry, registrant = org) → org `UserRegistry` → `team` → team `UserRegistry` → `<member>`. Registries are `UserRegistry` proxies deployed through the `VerifiableFactory`.
- Two `PermissionedResolver` proxies: one for the org root name (org-only), one for the team (HR gets `SET_TEXT`).
- Records on each member subname: `org.role`, `org.since`, `org.telegram.id`, and `attestations[org.telegram.id][kakunin-demo.eth]` (draft ENSIP "Text Record Attestations", PR #85: DAG-CBOR `{n,a,k,v,t}`, EIP-191 over keccak256, envelope `Tag(0x61747374)[1,t,sig]`, base64). The verifier also accepts the deployed atst.me layout (envelope v2, keys `p`/`h`).
- Reads go through **UniversalResolverV2**; history and membership timeline come from registry events (an unregistered name leaves state).
- Deployment record: [`deployments/sepolia.json`](../deployments/sepolia.json).

## 5. Components

| Path | Responsibility |
|---|---|
| `packages/core` | ENS read/write helpers, attestations, lookalike detection, check engine, message rendering, JSON store, invite auth, rate limiter, payment-screening policy. 52 tests. |
| `apps/bot` | Telegram bot (grammY): `/start <token>` onboarding, `/check`, forwarded messages (`forward_origin`; `hidden_user` asks for the @username), `/subscribe <ADMIN_SECRET>`, username refresh on every interaction. 11 tests. |
| `apps/web` | Next.js: `/`, `/check`, `/org/<name>` (wallet, members, add/revoke, invites, EAC delegation panel, alerts), `/demo` (scripted, live). |
| `apps/paid-api` | x402 seller (real + fake clone), buyer agent with pre-signature screening (live Intercepta API). 7 tests. |
| `scripts` | Idempotent `seed-demo`, `add-member`, `revoke-member`, `invite`, `check`, `rehearse` (full demo replay with assertions). |

## 6. Payment screening policy (agents)

Refuse a token that is not the canonical USDC for the network; refuse above a hard limit; refuse `payTo` scored high/critical; ask a human on medium/unknown; **fail closed** when the screener errors. Risk thresholds are ours (Intercepta publishes none): `sanction_address`/`known_scammer` ⇒ critical, score ≥ 75 critical, ≥ 50 high, ≥ 20 medium. Details: [`DECISIONS.md`](DECISIONS.md).

## 7. Non-goals

Mainnet, tokens/NFTs/governance, World ID, a browser extension (roadmap), multi-chain registries, X/LinkedIn account linking (stretch), Curvegrid MultiBaas indexing (not done: our own event scan is used; a real indexer is the production path).

## 8. Security

See [`docs/SECURITY.md`](../docs/SECURITY.md).
