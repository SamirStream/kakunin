# Submission pack (paste-ready) — Kakunin, ETHGlobal Tokyo 2026

Everything below is written to be pasted into the submission form. Facts were checked against the repo and the live site on 2026-09-27. Edit anything that is not true for you.

## Links

- Live: https://kakunin.xyz  ·  Telegram Mini App: https://t.me/KakuninxyzBot/app  ·  Bot: https://t.me/KakuninxyzBot
- Repo: https://github.com/SamirStream/kakunin (public, MIT, full git history since the first commit)
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

**Project side, self-serve.** Any project creates its organisation at kakunin.xyz/create in about two and a half minutes (137 to 155 s in our runs): it picks an ENS name and the wallet that will own it, and Kakunin registers `<name>.eth` to that wallet through the ENS registrar, deploys its org and team registries (ENSv2 `UserRegistry` proxies) and resolvers, and gives a limited operator key just enough Enhanced Access Control roles to run the team. The owner signs in with a wallet signature (no gas) to add and revoke members, connect Telegram alerts and see private alerts. A sample organisation (`kakunin-demo.eth`) is there to explore. Each organisation has a team registry (`team.<name>.eth`). Every member is a subname. An HR wallet manages the team through ENSv2 Enhanced Access Control (it can register, revoke and edit member records, and cannot touch the project's root name, resolvers or subregistry pointers). The project's own ENS name is the attester.

**Member side.** HR sends a one-time Telegram link (or QR). The member opens it from their own account, and the numeric Telegram ID (never the mutable @username) is attested on ENS. No wallet needed.

**Everyone else.** Forward a suspicious message to the bot, use the web check, open the Telegram Mini App, or call the public API. Answers: **verified** (with a proof anyone can re-check), **former** (revocation date read from ENSv2 events), **lookalike** (homoglyphs, typos) or **unknown**. Every failed check alerts the impersonated project. When HR revokes someone on-chain, every answer changes within seconds.

**AI agents.** The same check is sold per call over x402. The buying agent is policy-aware: before it signs it checks the token (only the canonical USDC), the amount (spending limits) and the destination (live Intercepta screening), then pays, refuses or asks a human, failing closed. A clean address is paid, a flagged one is refused, with the reason on record.

## How it's made

- **ENSv2 (Sepolia), central to the product.** `kakunin-demo.eth` registered through the ETHRegistrar (commit-reveal, MockUSDC). Org and team registries are `UserRegistry` proxies deployed through the `VerifiableFactory`. HR (for organisations created on the site, a limited operator key) gets `ROLE_REGISTRAR | ROLE_UNREGISTER | ROLE_RENEW` on the team registry root and `ROLE_SET_TEXT` on a separate team `PermissionedResolver` only; the dashboard reads the role bitmaps live to prove what HR cannot do. Reads go through `UniversalResolverV2`. An unregistered name leaves registry state, so "former member since …" is rebuilt from `LabelRegistered` / `LabelUnregistered` events and block timestamps.
- **Attestations.** Implemented from the draft ENSIP "Text Record Attestations" (PR #85): DAG-CBOR payload, EIP-191 over keccak256, envelope `Tag(0x61747374)`, stored as `attestations[org.telegram.id][kakunin-demo.eth]`. The verifier also accepts the deployed atst.me layout; a test reproduces a real mainnet attestation byte for byte. Any change to the record, the owner or the attester key invalidates it.
- **Multi-organisation.** Per-organisation directory, alerts, admins and invites; a shared org resolver used by the web app and the bot; provisioning is a resumable 7-task state machine (`packages/core/src/provision.ts`) advanced by the browser one bounded step at a time (fits serverless limits, hashes saved before waiting so retries never double-send). Operator keys are sealed with AES-256-GCM. Verified live on kakunin.xyz: an organisation created through the public API in 155 s, then 24 end-to-end checks (`scripts/e2e-http.ts`) including a real attestation written from a signed Telegram initData.
- **Telegram.** grammY bot (cloud webhook), and a Mini App whose server validates Telegram's signed `initData` (HMAC-SHA256, replay window) on every request, so the account opening the app is authenticated. Admin actions are limited, per organisation, to the Telegram accounts that opened the admin link from that organisation's dashboard (the sample organisation also accepts `/subscribe`); an admin of one organisation is refused on another.
- **x402 + Intercepta.** `@x402/next` seller (real endpoint and a fake clone whose `payTo` is flagged), `@x402/fetch` buyer with an `onBeforePaymentCreation` hook calling the live Intercepta quick-scan API on the payee (and Scan Token on the payment token where the API covers the network, which excludes testnets); a written policy refuses lookalike tokens, enforces spending limits ($0.05 hard stop, human approval above $0.01) and fails closed.
- **Stack.** TypeScript monorepo (pnpm), viem, Next.js 15 on Vercel, Upstash Redis, 133 tests (core 105, bot 15, paid-api 13), a security review with live attack tests (`docs/SECURITY.md`), and a one-command production check (`pnpm cloud:check`).
- **Design.** A verdict is a hanko stamped on a document; the kanji carries the meaning (確 元 偽 未) so the answer never depends on colour alone.

## Prize 1: ENS — Best Use of ENSv2

**Why this project fits.** ENSv2 is the product, not decoration: without the registry, the roles and the signed records there is nothing to check.
- *Built on ENSv2 Sepolia.* `kakunin-demo.eth` and every organisation created on the site are registered through the ETHRegistrar, with their registries and resolvers deployed through the VerifiableFactory: `packages/core/src/provision.ts` (`startProvision` line 109, `advanceProvision` line 132), addresses in `deployments/sepolia.json`.
- *Central.* A verdict is computed from the chain: the team registry state and events (`packages/core/src/ens.ts:90` `listMembers`, reads through the Universal Resolver at `ens.ts:61`), the member's records and the attestation signed by the organisation's own ENS name (`packages/core/src/check.ts:93` `checkIdentity`, `packages/core/src/attestation.ts:102` `verifyAttestation`).
- *Enhanced Access Control is the trust model.* The owner wallet owns the name and holds every role; the operator gets only REGISTRAR, UNREGISTER, RENEW on the team registry and SET_TEXT on the team resolver, and drops its setup rights on the organisation root in the last provisioning step (`provision.ts:248` `tighten`). The dashboard reads the role bitmaps live (`apps/web/src/app/api/delegation/route.ts`).
- *Functional, not hard-coded.* Registry state, roles, records, attestations and verdicts are read from Sepolia at request time, and organisations are created live from `/create`. The honest caveats: the two sample members of `kakunin-demo.eth` use placeholder Telegram IDs (`packages/core/src/demo.ts:6`), and the @username to numeric-ID mapping used for lookalike detection lives off-chain in the store.
- *Live demo and open source.* https://kakunin.xyz and https://github.com/SamirStream/kakunin (MIT).
- *Bonus, agents as namespaces:* not built. The paying agent has its own wallet but no ENS identity (see "What is not done" in the notes to the builder).

**ENSv2 feedback.** The docs (llms-full.txt, the permissioned-registry and verifiable-factory pages) were accurate enough to build against and the deployed ABIs matched them. Friction: no single "create an org with delegated HR" example (we assembled it from four pages); text records survive `unregister` while the name stops resolving through the Universal Resolver, which is right but surprising, so readers must go through the resolver directly for history; a role can only be self-revoked by an account that also holds its admin bit (we found this by a reverted simulation), which the docs could state; and a canonical event for "roles granted" per name would make delegation audits easier.

## Prize 2: Intercepta — Safe Agent-to-Agent Payments with x402

**Why this project fits.**
- *Working x402 flow, testnet.* Seller and fake clone (`apps/paid-api/src/server.ts`, and inside the web app `apps/web/src/app/api/paid/*`), buyer agent (`apps/paid-api/src/agent.ts`), payments on Base Sepolia.
- *A live Intercepta call runs before signing and decides what happens.* The API call is `apps/paid-api/src/screener.ts` (`rawScan`, `GET /api/public/v2/extension/account/{address}/quick-scan` with `x-api-key`, no mock). It is invoked from the x402 hook `onBeforePaymentCreation` (`apps/paid-api/src/agent.ts:47-61`), and `decidePayment` (`packages/core/src/screening.ts`) turns the verdict into pay, refuse or ask a human, failing closed. A second live call, Intercepta Scan Token (`screener.ts` `rawTokenScan`), screens the payment token where the API covers the network; it does not cover testnets, so on Base Sepolia (our demo) the allowlist decides alone, which the README states.
- *Real mainnet addresses are screened.* The payee of the real endpoint is our organisation wallet and the clone's payee is the Ronin bridge exploiter address (`apps/web/src/lib/x402.ts:12-13`); both are mainnet addresses, while the payment itself is on a testnet.
- *One payment goes through, one is blocked, with the reason visible.* https://kakunin.xyz/demo (section 5, button "Run agent purchases") or `pnpm paid` then `pnpm agent`; the run log with the reasons (`sanction_address`, `known_scammer`) is in the README.
- *README points to the files and has the feedback.* See the README section "Paid check for AI agents".

**Intercepta API feedback (5 lines).**
- Time to first call: about 2 minutes once the key arrived (the key itself arrives by email after the request, so it is not instant during a 36h event).
- Confusing: the API reference (docs.web3antivirus.io) sits behind a bot challenge, so scripts and AI tools get a 403; we found the host and path through a public search and confirmed them by calling. The response shape (`toxicScore` + `traits[]`) and its thresholds are not documented where we could read them, so the pay/refuse cut-offs in our policy are our own choice.
- Missing: quick-scan answers 404 for contract addresses (e.g. Circle's USDC contract); many payees are contract wallets, so a contract-aware answer (or a clear "unsupported") would help agents.
- Nice: per-trait reasons (`sanction_address`, `known_scammer`, `blacklist`) are directly displayable to a person, and latency was about 1 second.
- Wish: a documented list of test addresses per risk class in the docs, not only in the chat channel.

## Prize 3: Curvegrid — Best AI Agent Project

**Why this project fits.** The x402 buying agent is a policy-aware transaction agent for agent-to-agent payments. Before signing it checks the token (only the canonical USDC per network, so a lookalike token is refused: `packages/core/src/screening.ts:67`, `apps/paid-api/src/agent.ts:15-24`), the amount (hard stop $0.05, human approval above $0.01), and the counterparty (live Intercepta screening), then pays, refuses or asks a human; a screening error never pays, and an unattended agent treats "ask a human" as a refusal (`agent.ts:59`). It is exercised by tests (`packages/core/test/screening.test.ts`, `apps/paid-api/test/screener.test.ts`) and by the live demo. **MultiBaas was not used**; the track is judged on idea and execution, and the README says so. README items: one-sentence summary, team with handles, and setup and testing instructions are all in `README.md` (section "Curvegrid: Best AI Agent Project" and "Run it").

## AI use and human contribution (be precise, and edit to match reality)

Kakunin was built with Claude Code (Anthropic) writing most of the code, tests and docs, under the builder's direction; each commit carries a `Co-Authored-By` trailer, and `specs/SPEC.md`, `specs/DECISIONS.md` and `specs/PROMPTS.md` document the spec, every decision and the main prompts. The builder's own contribution: the product concept and scope, the ENSv2 delegation design (org owns members, HR limited to the team registry), the decision to drop MTProto for an own-registry username lookup, the sponsor strategy (ENS, Intercepta and Curvegrid; not World), the brand direction and logo concepts, wallet funding and all testnet operations, obtaining the API keys, real-device testing on Telegram, and go/no-go on every on-chain action. ENSv2 contract facts came from the official docs and verified ABIs, not from guesses.

## Team

**Samir Touinssi**, CEO of [The Arch](https://thearch.consulting). Solo builder.

- X: <https://x.com/SamirTouin>
- LinkedIn: <https://www.linkedin.com/in/tsamir/>
- Telegram: [@SamirTouin](https://t.me/SamirTouin)
- GitHub: <https://github.com/SamirStream>
- All links: <https://linktr.ee/SamirTouin>

## Hard questions, ready answers

1. **Why ENSv2 and not a database?** Because the list must be verifiable by a stranger without trusting us: the registry, roles and signature are on-chain; our API adds convenience, not authority.
2. **Can a scammer forward a real member's link?** Yes, so the profile page says it proves the member exists, not who is writing. The proof is the numeric Telegram ID: the bot and Mini App compare it.
3. **What if an @username changes?** The identity is the numeric ID; usernames are refreshed on every interaction and only used to find lookalikes.
4. **What stops HR abusing power?** EAC: HR cannot change the root name, resolvers or subregistries; the dashboard reads the role bitmaps live. Revocations are public events.
5. **How does a new project join?** Self-serve at kakunin.xyz/create: name plus owner wallet, about 2.5 minutes, 12 Sepolia transactions, gas sponsored on testnet. The name is registered to the owner's wallet, not to Kakunin, and the owner can remove the operator on-chain at any time.
6. **Business model?** Free for people. Projects pay for alerts, analytics and managed onboarding. Agents pay per check over x402.
7. **Is Telegram the only channel?** It is where the attack happens first. The attestation format is channel-agnostic (X and LinkedIn keys are the same mechanism).
8. **Why testnet only?** ENSv2 is in beta on Sepolia; the design is chain-agnostic and mainnet-ready once ENSv2 ships.
9. **What is real and what is sample data?** Registries, roles, records, attestations, verdicts and payments are real on Sepolia, and organisations created on the site are real registries. Only the two sample members of `kakunin-demo.eth` use placeholder Telegram IDs; a judge can create their own organisation and onboard their own Telegram account live.
10. **Did AI write it?** Mostly, under direction, and we say so: see the section above and `specs/`.
11. **Did you use MultiBaas?** No, and we say so in the README. We apply to the Curvegrid track on the strength of the agent: token, amount and counterparty policy before signing, fail closed.
12. **How does the agent avoid a lookalike token?** It only accepts the canonical USDC address per network (`POLICY.trustedAssets`), whatever the server advertises. On networks the Intercepta Scan Token API covers (mainnets, not testnets), it also asks that API and refuses or holds a risky token; a scan error fails closed.
13. **Are agents ENS namespaces?** Not yet: the agent has its own wallet only. Giving it a subname with delegated roles is the natural next step.

## Demo video storyboard (about 3:50, 720p or more, edit out waiting)

Same timeline as `docs/VIDEO_SCRIPT.md`, which has the word-for-word narration.

| Time | Show | Say (short) |
|---|---|---|
| 0:00 | kakunin.xyz hero, stamp lands on the fake recruiter's message | "Fake recruiters are how crypto teams get hacked. Kakunin certifies the real ones, on ENSv2." |
| 0:20 | `/demo`: `@alice_kakunn` (lookalike, alert), then Alice (verified), proof panel | "Every answer is a stamp with a reason, and a proof anyone can re-check." |
| 0:50 | `/create`: name plus owner wallet, the progress checklist (wait cut in editing) | "Any project can create its own organisation: the name goes to its wallet, a limited operator runs the team." |
| 1:35 | New dashboard: sign in with the wallet, Delegation panel (operator allowed on the team, denied on the root) | "The roles are read live from the chain, and the owner can remove the operator on-chain." |
| 2:05 | Add a member, then revoke it (waits cut) | "One signature to add or revoke; every answer flips to former member with the date." |
| 2:35 | Telegram on the phone: Mini App card, contact picker, check across all projects | "Where the attack happens; Telegram signs who you are, and identity is the numeric ID." |
| 3:05 | `/demo` section 5: agent pays the real API, refuses the clone with Intercepta's reasons | "A policy-aware agent: token, amount and counterparty checked before it signs; it fails closed." |
| 3:35 | Landing | "Open source and live at kakunin.xyz." |

Recording checklist: 1280x720 or larger, no waiting (cut it), show the live URL in the address bar, keep the cursor calm, no secrets on screen (the `.env` file, the admin token field, the Vercel dashboard).

## Before you press Submit

- [ ] Video uploaded, 2 to 4 minutes, at least 720p, link added above
- [ ] Repo is public, README first screen states the one-sentence summary, AI attribution section is accurate
- [ ] Prizes (your choice in the form): ENS, Intercepta and Curvegrid; each needs the explanation above, and ENS and Intercepta need their feedback
- [ ] `pnpm cloud:check https://kakunin.xyz --agent` is green within the last hour (it spends 0.002 testnet USDC)
- [ ] Mini App opened on a real phone: My card shows your own name, Team tab visible, Check works
- [ ] Alert feed on the dashboard looks intentional (run a couple of clean checks before the judges arrive)
- [ ] Demo video link and the Team handles above are correct
