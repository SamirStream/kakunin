# Submission pack (paste-ready) — Kakunin, ETHGlobal Tokyo 2026

Everything below is written to be pasted into the submission form. Facts were checked against the repo and the live site on 2026-09-27. Edit anything that is not true for you.

## Links

- Live: https://kakunin.xyz  ·  Telegram Mini App: https://t.me/KakuninxyzBot/app  ·  Bot: https://t.me/KakuninxyzBot
- Repo: https://github.com/SamirStream/kakunin (public, MIT, 44 commits since 2026-09-26)
- API docs: https://kakunin.xyz/docs  ·  OpenAPI: https://kakunin.xyz/api/v1/openapi.json
- Demo video: `[ADD LINK AFTER RECORDING]`

## Project name

Kakunin (確認)

## Tagline (under 80 characters)

Is this recruiter really from that project? Proof from ENSv2.

## Short description (about 200 characters)

Projects publish their team on ENSv2. Anyone, including AI agents, checks in one second whether a person is a real member, a former one, a lookalike or unknown, with a proof they can verify themselves.

## Description

Fake recruiters are how crypto teams get hacked: someone poses as a project member on Telegram, X or LinkedIn and gets a developer to run malware or sign a transaction. Takedown tools chase an endless list of fakes. Kakunin certifies the real ones instead, a short list each project publishes on ENSv2.

**Project side.** A project owns an ENS name (`kakunin-demo.eth`) with its own team registry (`team.kakunin-demo.eth`, an ENSv2 UserRegistry). Every member is a subname. An HR wallet manages the team through ENSv2 Enhanced Access Control (it can register, revoke and edit member records, and cannot touch the project's root name, resolvers or subregistry pointers). The project's own ENS name is the attester.

**Member side.** HR sends a one-time Telegram link (or QR). The member opens it from their own account, and the numeric Telegram ID (never the mutable @username) is attested on ENS. No wallet needed.

**Everyone else.** Forward a suspicious message to the bot, use the web check, open the Telegram Mini App, or call the public API. Answers: **verified** (with a proof anyone can re-check), **former** (revocation date read from ENSv2 events), **lookalike** (homoglyphs, typos) or **unknown**. Every failed check alerts the impersonated project. When HR revokes someone on-chain, every answer changes within seconds.

**AI agents.** The same check is sold per call over x402. The buying agent screens the destination with the live Intercepta API before it signs: a clean address is paid, a flagged one is refused, with the reason on record.

## How it's made

- **ENSv2 (Sepolia), central to the product.** `kakunin-demo.eth` registered through the ETHRegistrar (commit-reveal, MockUSDC). Org and team registries are `UserRegistry` proxies deployed through the `VerifiableFactory`. HR gets `ROLE_REGISTRAR | ROLE_UNREGISTER | ROLE_RENEW` on the team registry root and `ROLE_SET_TEXT` on a separate team `PermissionedResolver` only; the dashboard reads the role bitmaps live to prove what HR cannot do. Reads go through `UniversalResolverV2`. An unregistered name leaves registry state, so "former member since …" is rebuilt from `LabelRegistered` / `LabelUnregistered` events and block timestamps.
- **Attestations.** Implemented from the draft ENSIP "Text Record Attestations" (PR #85): DAG-CBOR payload, EIP-191 over keccak256, envelope `Tag(0x61747374)`, stored as `attestations[org.telegram.id][kakunin-demo.eth]`. The verifier also accepts the deployed atst.me layout; a test reproduces a real mainnet attestation byte for byte. Any change to the record, the owner or the attester key invalidates it.
- **Telegram.** grammY bot (cloud webhook), and a Mini App whose server validates Telegram's signed `initData` (HMAC-SHA256, replay window) on every request, so the account opening the app is authenticated. Admin actions are limited to accounts that ran `/subscribe`.
- **x402 + Intercepta.** `@x402/next` seller (real endpoint and a fake clone whose `payTo` is flagged), `@x402/fetch` buyer with an `onBeforePaymentCreation` hook calling the live Intercepta quick-scan API; policy refuses lookalike tokens, enforces limits and fails closed.
- **Stack.** TypeScript monorepo (pnpm), viem, Next.js 15 on Vercel, Upstash Redis, 100 unit tests, a security review with live attack tests (`docs/SECURITY.md`), and a one-command production check (`pnpm cloud:check`).
- **Design.** A verdict is a hanko stamped on a document; the kanji carries the meaning (確 元 偽 未) so the answer never depends on colour alone.

## Prize 1: ENS — Best Use of ENSv2

ENSv2 is the product, not decoration: hierarchical registries (`kakunin-demo.eth` → `team.kakunin-demo.eth` → member), Enhanced Access Control delegation to an HR wallet, a per-team Permissioned Resolver, Universal Resolver V2 reads, registry events for history, and text-record attestations signed by the org's ENS name. Nothing is hardcoded: every answer is read from Sepolia at request time (try the live demo). Files: `packages/core/src/ens.ts`, `packages/core/src/attestation.ts`, `packages/core/src/check.ts`, `scripts/seed-demo.ts`, dashboard panel `apps/web/src/app/api/delegation/route.ts`. Deployed addresses: `deployments/sepolia.json`.

**ENSv2 feedback.** The docs (llms-full.txt, the permissioned-registry and verifiable-factory pages) were accurate enough to build against and the deployed ABIs matched them. Friction: no single "create an org with delegated HR" example (we assembled it from four pages); text records survive `unregister` while the name stops resolving through the Universal Resolver, which is right but surprising, so readers must go through the resolver directly for history; and a canonical event for "roles granted" per name would make delegation audits easier.

## Prize 2: Intercepta — Safe Agent-to-Agent Payments with x402

A live Intercepta call runs before the agent signs and decides what happens next. Flow, one approved and one blocked payment with reasons visible: https://kakunin.xyz/demo (section 5) or `pnpm agent`. Files: `apps/paid-api/src/screener.ts` (the API call), `apps/paid-api/src/agent.ts` (hook before signing), `packages/core/src/screening.ts` (pay / refuse / ask a human, fail closed), `apps/web/src/app/api/paid/*` (seller and fake clone). Payments run on Base Sepolia; screened addresses are real mainnet addresses.

**Intercepta API feedback (5 lines).** About 2 minutes from key to first call. The reference site sits behind a bot challenge, so scripts and AI tools get a 403; we found the host and path by search and confirmed by calling. `toxicScore` plus `traits[]` is not documented where we could read it, so our pay/refuse thresholds are our own. Quick-scan answers 404 for contract addresses (e.g. Circle's USDC); many payees are contract wallets, so a clear "unsupported" or contract-aware answer would help. Per-trait reasons (`sanction_address`, `known_scammer`) are directly displayable, and latency was about 1 s.

## AI use and human contribution (be precise, and edit to match reality)

Kakunin was built with Claude Code (Anthropic) writing most of the code, tests and docs, under the builder's direction; each commit carries a `Co-Authored-By` trailer, and `specs/SPEC.md`, `specs/DECISIONS.md` and `specs/PROMPTS.md` document the spec, every decision and the main prompts. The builder's own contribution: the product concept and scope, the ENSv2 delegation design (org owns members, HR limited to the team registry), the decision to drop MTProto for an own-registry username lookup, the sponsor strategy (ENS and Intercepta, not Curvegrid or World), the brand direction and logo concepts, wallet funding and all testnet operations, obtaining the API keys, real-device testing on Telegram, and go/no-go on every on-chain action. ENSv2 contract facts came from the official docs and verified ABIs, not from guesses.

## Team

Samir Touinssi, CEO of The Arch (thearch.consulting). Solo.

## Hard questions, ready answers

1. **Why ENSv2 and not a database?** Because the list must be verifiable by a stranger without trusting us: the registry, roles and signature are on-chain; our API adds convenience, not authority.
2. **Can a scammer forward a real member's link?** Yes, so the profile page says it proves the member exists, not who is writing. The proof is the numeric Telegram ID: the bot and Mini App compare it.
3. **What if an @username changes?** The identity is the numeric ID; usernames are refreshed on every interaction and only used to find lookalikes.
4. **What stops HR abusing power?** EAC: HR cannot change the root name, resolvers or subregistries; the dashboard reads the role bitmaps live. Revocations are public events.
5. **How does a new project join?** Today a script provisions the ENS name, the two registries and the HR grant (`scripts/spike-ens.ts` is the reference flow); a self-serve creation flow is the next milestone, and the check side already works for any registry.
6. **Business model?** Free for people. Projects pay for alerts, analytics and managed onboarding. Agents pay per check over x402.
7. **Is Telegram the only channel?** It is where the attack happens first. The attestation format is channel-agnostic (X and LinkedIn keys are the same mechanism).
8. **Why testnet only?** ENSv2 is in beta on Sepolia; the design is chain-agnostic and mainnet-ready once ENSv2 ships.
9. **What is real and what is sample data?** Registries, roles, records, attestations, verdicts and payments are real on Sepolia. Two demo members use placeholder Telegram IDs; the builder's own account is a real onboarded member.
10. **Did AI write it?** Mostly, under direction, and we say so: see the section above and `specs/`.

## Demo video storyboard (2 to 4 minutes, 720p or more, edit out waiting)

| Time | Show | Say |
|---|---|---|
| 0:00 | kakunin.xyz hero, stamp lands on the fake recruiter's message | "Fake recruiters are how crypto teams get hacked. Kakunin certifies the real ones." |
| 0:20 | Type `@alice_kakunn` (lookalike), then `100000001` (verified), open the proof panel | "Every answer is a stamp with a reason, and a proof anyone can check." |
| 0:55 | Org dashboard: team, EAC delegation panel (HR allowed on team, denied on root) | "ENSv2: HR manages the team but can never touch the project's root name." |
| 1:30 | Revoke Bob live (Mini App admin tab, or demo button), re-check Bob | "Revoked on-chain, and every answer flips to former member with the date." |
| 2:10 | Telegram on the phone: forward a message, open the Mini App card | "Where the attack happens: Telegram signs who you are, so a card can't be requested by anyone else." |
| 2:50 | Demo section 5: agent pays the real API, refuses the clone with Intercepta's reasons | "Agents pay per check over x402, and never pay a scammer." |
| 3:30 | Repo, README, `pnpm cloud:check` all green | "Open source, tested, and running live." |

Recording checklist: 1280x720 or larger, no waiting (cut it), show the live URL in the address bar, keep the cursor calm, no secrets on screen (the `.env` file, the admin token field, the Vercel dashboard).

## Before you press Submit

- [ ] Video uploaded, 2 to 4 minutes, at least 720p, link added above
- [ ] Repo is public, README first screen states the one-sentence summary, AI attribution section is accurate
- [ ] Prizes selected: ENS and Intercepta (up to 3 allowed; each needs the explanation and feedback above)
- [ ] `pnpm cloud:check https://kakunin.xyz --agent` is green within the last hour
- [ ] Mini App opened on a real phone: My card shows "samir", Team tab visible, Check works
- [ ] Alert feed on the dashboard looks intentional (run a couple of clean checks before the judges arrive)
