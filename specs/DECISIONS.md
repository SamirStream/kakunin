# Decisions & spike log

## 2026-09-26 — Prize page re-read
- ENS: "Best Use of ENSv2" $3k/2k/1k. ENSv2 must be central; needs functional demo (no hardcoded values), live demo link, open-source repo.
- Curvegrid: the prize is NOT a generic "MultiBaas" track. Three tracks: Best RWA Tokenization, Best Digital Asset Dashboard, Best AI Agent Project ($1k each). README must include one-sentence summary, MultiBaas usage, team intro, setup/testing, MultiBaas feedback. Best fit for Kakunin: **Digital Asset Dashboard** (org dashboard over indexed registry events). [BUILDER DECIDES if worth pursuing]
- Intercepta: $1250/$750. Live API call before payment signing, one approved + one blocked payment with visible reasons, README with 3-5 lines API feedback.

## 2026-09-26 — ENSv2 Sepolia facts (from docs.ens.domains, not guessed)
- Deployments: https://docs.ens.domains/learn/deployments#sepolia-ensv2-beta
- ETHRegistrar 0xabe76f6c8dfced81aa5a2bb8034202a7136b94ca, ETHRegistry 0x657ea849311d3d5823348dded7c2aaafb3ede09e, RootRegistry 0x9703dbd26dab89504490994138cf2c575251a9ce
- UserRegistryImpl 0xa80338aaa8d23831cea25e858d1774534abb0263, PermissionedResolverImpl 0x14f09fd05d4585759e54844dc9b00147131cf243, VerifiableFactory 0x9e726eb570beb6bceb495ab8cda7df517d4e841c
- MockUSDC 0x16f95d91dba7da3aca778ec053df0ff6c6a8aa8e (free mint, 6 decimals), UniversalResolverV2 0x5d25c1d6acbb71b7a28aa7899618a3412a8303e3
- Registration: commit -> wait MIN_COMMITMENT_AGE (60s) -> register(label, owner, secret, subregistry, resolver, duration, paymentToken, referrer); approve MockUSDC first.
- Subregistry: deploy UserRegistry proxy via VerifiableFactory (emits ProxyDeployed), then ETHRegistry.setSubregistry(labelhash, proxy). initialize roleBitmap must include ROLE_REGISTRAR_ADMIN + ROLE_RENEW_ADMIN.
- Roles: REGISTRAR 1<<0, UNREGISTER 1<<12, RENEW 1<<16, SET_SUBREGISTRY 1<<20, SET_RESOLVER 1<<24; admin = role<<128. Resolver: SET_TEXT 1<<4.
- Events: LabelRegistered, LabelUnregistered (history for "former member").

## 2026-09-26 — M0 spike 3: attestation format (RESULT: OK, compatible with atst.me)
- Source: draft ENSIP PR #85 (ensips/xx.md). Payload = DAG-CBOR map, signature = EIP-191 over keccak256(payload), envelope = CBOR `Tag(0x61747374)[version, t, sig(65)]`, published as text record `attestations[RECORD_KEY][ATTESTER_NAME]` (base64 or 0x-hex). Consumer rebuilds `n,a,k,v` from live ENS data, so owner/record/attester-key changes auto-invalidate.
- **Discrepancy found**: the deployed playground (atst.me, `/api/verify`) uses envelope **v2** with payload keys `{n,a,p,h,t}` (`p`=platform, `h`=handle; `a` = 20 raw bytes), whereas the PR text says envelope **v1** with `{n,a,k,v,t}`. Decision: `packages/core/src/attestation.ts` **issues the PR draft layout (v1, k/v)** and **verifies both** layouts (chosen by envelope version). All format knowledge is in that one file (swap point for an EIP-712 fallback if ever needed; not needed so far).
- Proof: unit test reproduces byte-for-byte the payload + envelope of a real mainnet attestation (`jkm.eth`, `com.x`, attested by `atst.lighthousegov.eth`, valid per atst.me on 2026-09-26) and recovers the attester `0xf82A…9783`. 10/10 tests green (tamper, owner change, attester rotation, malformed, hex+base64).
- Limitation: atst.me's API resolves on **mainnet** only, so our Sepolia attestations cannot be shown "valid" in the playground UI; our own verifier is the demo surface. Mention atst.me compatibility via the mainnet vector.
- Attester = the org's ENS name; it must resolve (addr) to the org signing address -> M1 must `setAddress` on the org resolver. `a` = manager of the member subname = org wallet (org owns all subnames).
- Telegram record key (proposal): `org.telegram.id` (numeric id). Also `org.role`, `org.since`.

## 2026-09-26 — Tooling notes
- Blockscout (eth-sepolia.blockscout.com) gives verified ABIs for all ENSv2 Sepolia contracts -> saved in `packages/core/abis/`; deployed signatures match the docs.
- pnpm enforces `minimumReleaseAge` (supply-chain): versions published <24h ago are refused. Pinned dotenv 18.0.3 and vitest 5.0.1 for that reason. Do not bypass.
- pnpm 12.6.0 is what `npm i -g pnpm` installs here; build scripts need `allowBuilds` in `pnpm-workspace.yaml` (esbuild only).
- ENSv2 design for the demo: separate resolver for `team.<org>.eth` (HR gets only ROLE_SET_TEXT there, root resolver stays org-only); HR gets REGISTRAR|UNREGISTER|RENEW on the team registry ROOT only.

## 2026-09-26 — Spike 2 (GramJS/MTProto) ABANDONED — username lookup via our own registry [BUILDER DECIDED]
- No MTProto resolver, no throwaway Telegram account, no session string. Removes a fragile dependency and the `TG_API_ID/TG_API_HASH/TG_SESSION_STRING` env vars.
- Onboarding (`/start <token>`) stores BOTH the immutable numeric Telegram user ID and the current @username (case-folded). Every later interaction with the bot refreshes the stored @username for that numeric ID (usernames are mutable; the ID is the identity).
- A check by @username is answered from OUR registry (username -> numeric ID -> member subname -> attestation). A username not found in the registry is "Unknown"/"Lookalike", never resolved via Telegram.
- Forwarded messages still use `forward_origin` (numeric ID when visible; if `hidden_user`, victim pastes the @username).
- Consequence: a member who changed their @username and never talked to the bot since could be missed by username lookup until their next interaction; numeric-ID checks are unaffected. Accepted for the hackathon; demo members are refreshed at seed time.
- Only the numeric ID is attested on-chain (`org.telegram.id`); the username is off-chain registry data.

## 2026-09-26 — Clock (CORRECTED)
- The dev machine is on UTC+7 (Indochina), NOT JST; git-bash ignores TZ=Asia/Tokyo. Always compute JST with node: new Date().toLocaleString('fr-FR',{timeZone:'Asia/Tokyo'}).
- Deadline Sun 2026-09-27 09:00 JST = Sun 00:00 UTC = Sun 2026-09-27 07:00 on the machine clock. At 21:15 JST Sat (2026-09-26T12:15Z): 11h44 left. (An earlier note claiming ~21h left at "11:55" was wrong.)
- Builder is in Tokyo; machine clock is JST. Deadline Sun 2026-09-27 09:00 JST. At 11:55 JST Sat: ~21h left.

## 2026-09-26 — M0 spike 1: ENSv2 Sepolia registry + EAC + HR delegation (RESULT: OK, all txs succeeded)
- Script: `scripts/spike-ens.ts` (dry-run by default, `--send` to execute, idempotent via `scripts/state.sepolia.json`, gitignored). Public record of addresses: `deployments/sepolia.json`.
- Done on-chain: `kakunin-demo.eth` registered (8.000021 MockUSDC; `MockUSDC.mint` is public/free; ETHRegistrar accepts it), org UserRegistry `0x87a9cCF3826fF5Bd06558d27E377D7c313D69FB3` set as its subregistry at registration, `team` registered inside it pointing at team UserRegistry `0x40C390A61baf66cA6b56B521Be95432FDDC2867f`; org resolver `0x9a11…6a40`, team resolver `0x010E…226D` (both PermissionedResolver proxies via VerifiableFactory).
- EAC delegation proven: ORG granted HR `ROLE_REGISTRAR|UNREGISTER|RENEW` on the team registry ROOT (`grantRootRoles(69633, hr)`), HR holds only `ROLE_SET_TEXT` on the team resolver. HR successfully `register`ed `alice`, `setText(org.role)`, `unregister`ed `alice`. HR `unregister("team")` and `setResolver` on the ORG registry both **revert** (simulated) -> HR cannot touch the org root name.
- Findings that shape M1+:
  - `UserRegistry.register(label, owner, registry, resolver, roleBitmap, expiry)`: `owner=ORG` with `roleBitmap=0` works (org owns members, members hold no roles); expiry may equal the parent's expiry (no error).
  - Text read: `resolver.resolve(dnsEncodedName, abi.encode(text(node,key)))` returns an ABI-encoded string (works; "Engineer" read back). Reading through the **UniversalResolverV2** with viem is NOT yet tested -> first task of M1 (fallback: call the team resolver directly).
  - After `unregister`, `getState(labelhash)` = status 0 (AVAILABLE), expiry = unregister block time, latestOwner = 0x0. The old member is gone from state -> "former member since <date>" MUST come from `LabelUnregistered`/`LabelRegistered` events (block timestamps). Registry lookups must use the **labelhash**, not tokenId (tokenId changes on role changes/re-registration).
  - Text records live on the resolver and are NOT cleared by unregister; a check must first confirm the subname is REGISTERED before trusting records/attestations.
  - The demo member `alice` is currently revoked by the spike; the seed script re-registers.
- TODO M1: `setAddress(60, ORG)` for the org name on the org resolver so the org ENS name resolves to the attester signing address (required by the attestation validation step 6).

## 2026-09-26 — M1: registry scripts (DONE)
- `packages/core/src/ens.ts`: constants/roles, `getMemberState`, `readText`/`readAddress` **via UniversalResolverV2** (viem `universalResolverAddress` override works: `resolve(bytes,bytes)` has the v1 shape), `listMembers` (history from `LabelRegistered`/`LabelUnregistered` logs; former-member date = block timestamp of the unregistration; tokenId<->labelhash matched on canonical id = id>>32), writes `addMember`/`revokeMember`/`setMemberText`/`setAttesterAddress` (idempotent; every tx announced before sending; `dryRun`).
- Scripts (`scripts/`): `seed-demo.ts` (idempotent, `--dry-run`), `add-member.ts`, `revoke-member.ts`, `check.ts`. Members are added **by the HR wallet**, org-only actions by ORG.
- Verified on Sepolia: seed sent 7 txs (attester `addr(60)` of `kakunin-demo.eth` -> ORG; alice + bob re-registered by HR with `org.role`/`org.since`); a second run announces 0 txs. Reads through UR V2 return the records; `alice` showed as `former (revoked 2026-09-26T12:00:12Z)` before the re-seed, purely from events.
- Note: text records survive unregistration on the resolver, but a revoked subname no longer resolves through the UR (registry no longer finds it) -> revoked names read as null. Checks still gate on registry state first.
- `getLogs` range starts at `deployments/sepolia.json#fromBlock` (11786072); fine for the hackathon, would need pagination/indexer later (that is where MultiBaas/M5 comes in).

## 2026-09-26 — M2: attestation + check engine (DONE, verified live on Sepolia)
- `packages/core/src/check.ts`: `checkIdentity(reader, input, directory)` -> verified | former | lookalike | unknown; `issueTelegramAttestation` (ORG key signs, HR key writes; idempotent); `chainReader(pub)` is the only chain-touching part, so the orchestration is unit-tested with a fake `Reader` (31 tests green: valid, wrong-attester key, tampered, revoked -> former with date, lookalike incl. Cyrillic, unknown).
- Identity binding = text record `org.telegram.id` (numeric) + attestation record `attestations[org.telegram.id][kakunin-demo.eth]` (draft ENSIP layout, envelope v1). Former members are matched by reading the team resolver directly (records outlive unregistration; the UR no longer resolves a revoked name).
- Live proof: alice (`100000001`) -> `verified`, attestation valid, signer = ORG wallet = `addr(kakunin-demo.eth)`; `Bob_Kakunn` -> `lookalike` of `bob_kakunin` (distance 1); unknown handle -> `unknown`; second `seed-demo` run announces 0 txs. Demo Telegram IDs `100000001/2` are placeholders (`demo/directory.json`); real IDs arrive at bot onboarding.

## 2026-09-26 — M3 + M4: bot and web app (built, tested live)
- **Bot** (`apps/bot`, grammY 1.46): `/start <token>` binds the numeric Telegram ID + current @username to the invited member and attests it on ENS (ORG key signs, HR key writes); `/check` + forwarded messages (`forward_origin`: user -> numeric ID; `hidden_user` -> asks for @username); every interaction refreshes the stored @username of a known ID; every non-verified check stores an alert and notifies admin chats registered with `/subscribe <ADMIN_SECRET>`. Logic is Telegram-independent in `src/handlers.ts` (11 tests, fake deps). **Not yet run against real Telegram: needs `TELEGRAM_BOT_TOKEN` (BotFather) in `.env`.**
- **Shared store** `packages/core/src/store.ts` (JSON file `data/store.json`, gitignored, atomic rename): invites (single-use), directory (ID -> label + mutable username/display name), alerts. Exposed as `@kakunin/core/store` (node-only; the main entry stays browser-safe).
- **Web** (`apps/web`, Next 15.5 App Router + Tailwind 4): `/` pitch, `/check` public check, `/org/<name>` dashboard (live member table polling ENSv2 every 4s, add member = 3 wallet txs from the browser using the SAME core helpers as the scripts, revoke, one-time invite link, EAC delegation panel reading `hasRootRoles`, alerts feed), `/demo` scripted scenarios. Wallet = plain EIP-1193 + viem (no wagmi/RainbowKit: fewer moving parts, and the core write helpers are reused as-is). TypeScript pinned to 5.9.3 monorepo-wide: two TS versions produced two viem copies with incompatible types.
- **Demo signer** `/api/demo` (revoke / reset with the throwaway HR/ORG keys): only when `KAKUNIN_DEMO_SIGNER=1` AND host is localhost; `.env.example` ships it disabled.
- Live proof on Sepolia via the web API: Alice -> verified (attestation valid); `alice_kakunn` -> lookalike; unknown org -> "not registered"; HR revokes Bob through `/api/demo` in ~4s and the next check flips Bob to **former (revokedAt from the block timestamp)** with an alert recorded; `reset` re-seeds in ~17s.
- Delegation panel confirms on-chain: HR can register/unregister/renew + edit member records on `team.kakunin-demo.eth`, and can do NOTHING on the org root registry/resolver.
- Open items: real Telegram run; hosted deployment (Vercel cannot share the bot's JSON store; the live demo link will point at the locally-run app or a tunnel); MultiBaas (M5); README + screenshots (M8).

## 2026-09-26 — M7 (Intercepta + x402): built up to the API adapter; BLOCKED on the Intercepta API contract
- Prize requirements (ethglobal prizes page): a working agent payment flow (x402 preferred, testnet OK); at least one **live** Intercepta API call **before** a payment is signed/accepted, whose result decides what happens next (mocked/hard-coded responses do not qualify); demo of one approved and one blocked/held payment with the reason visible; README pointing to the files where the API is called + 3-5 lines of API feedback. Risk data covers **mainnet**, so screen real mainnet addresses even when the payment runs on a testnet.
- Free sandbox key (1,000 requests) requested at intercepta.io/ethglobal on 2026-09-26; arrives by email "within a few hours". Their API reference (docs.web3antivirus.io) is behind a bot wall (403 for curl, challenge in the embedded browser); not bypassed. The event page says a quickstart and a TypeScript example repo (Discord) exist. **No endpoint is invented**: `apps/paid-api/src/screener.ts` refuses to run until the real adapter is written.
- Built and verified: `packages/core/src/screening.ts` (pure policy `decidePayment`: refuse lookalike tokens, hard/ask spending limits, refuse high-risk `payTo`, ask a human on medium/unknown, **fail closed** if screening errors; 10 tests); `apps/paid-api/src/server.ts` (Express + `@x402/express` 2.27, `GET /check` at $0.001 on **Base Sepolia** `eip155:84532` because the public facilitator https://x402.org/facilitator supports Base Sepolia/Solana devnet, not Ethereum Sepolia; also a FAKE clone on :4022 whose `payTo` is the OFAC-sanctioned Tornado Cash router `0x8589…FDA16`); verified live: both endpoints return `402` with a `PAYMENT-REQUIRED` header (amount 1000 = $0.001, USDC `0x036C…CF7e`); `apps/paid-api/src/agent.ts` (`@x402/fetch` + `x402Client.onBeforePaymentCreation` hook: screen `payTo` -> decide -> abort before signing; typechecks against the SDK).
- The Base Sepolia USDC address comes from the x402 SDK output (`…CF7e`), NOT from memory; the agent trusts only that asset.
- Remaining: (1) Intercepta adapter (`AddressScreener`) once docs/key are available; (2) fund the agent wallet with Base Sepolia USDC (faucet.circle.com); (3) live run: approved payment to the real API, blocked payment to the clone; (4) optional seller-side payer screening; (5) README section + API feedback lines.

## 2026-09-26 — Intercepta API facts (public material, to be VERIFIED by the first live call)
- Source: a public GitHub issue of another ETHGlobal Tokyo team (kou-uni/ethglobal-tokyo2026-uni #14) and a web search: host `https://api.web3antivirus.io`, Quick Scan `GET /api/public/v2/extension/account/{address}/quick-scan`, Deep Scan `…/toxic-score`; auth header believed to be `x-api-key`. That team states it does not know the real response schema either, so **nothing about the response shape is assumed**: `mapVerdict` returns risk `unknown` (=> ask a human) until we have seen a real response.
- `apps/paid-api/src/probe.ts` (`pnpm --filter @kakunin/paid-api probe`) prints the raw response for a sanctioned address (Tornado router) and Circle's mainnet USDC contract; the key is never printed. Then finish `mapVerdict`, run `pnpm --filter @kakunin/paid-api agent`.

## 2026-09-26 — M7 DONE: Intercepta live, x402 flow verified end to end
- Key received and stored in `.env` (never committed). Verified live: auth header `x-api-key` works; quick-scan returns `{ toxicScore, traits:[{name,risk,description}] }`; contracts/unseen addresses answer 404 "An Externally Owned Account ... doesn't exist" (=> mapped to `unknown` => a human decides).
- **Correction**: the earlier assumption that `0x8589…FDA16` (Tornado-related) is sanctioned was WRONG per Intercepta (score 0). The fake clone now pays `0x098B…2f96` (Ronin exploiter): live verdict critical (`sanction_address`, `known_scammer`, `blacklist`). Our own throwaway addresses screen low (0); the burn address `0x…dEaD` scores 85 (`attack_money_target`).
- Our mapping thresholds (ours, the API publishes none): any `sanction_address`/`known_scammer` trait => critical; score >=75 critical, >=50 high, >=20 medium, else low. The agent refuses at high, asks a human at medium/unknown, and NEVER auto-pays when screening errors.
- Live run: payment to the real API approved and settled (agent 20 -> 19.999 USDC, org +0.001 USDC on Base Sepolia via the public x402 facilitator); payment to the clone aborted before signing with Intercepta's reasons. Tests: `apps/paid-api` 7 (mapping, from responses recorded live), `packages/core` 46.
- Note: the API key was pasted into the chat by the builder to save time; it is a free sandbox key (1,000 requests), stored only in `.env`. Rotate it via Intercepta if that is a concern.

## 2026-09-26 — Security review (see docs/SECURITY.md)
- Found and fixed a critical flaw in my own M4 work: `/api/invite` was unauthenticated (anyone could obtain an invite for an existing member and get their own Telegram ID attested on that subname). Invites now need an HR/ORG wallet signature (5 min, bound to org+member). Also: demo signer routes refuse proxied requests and the web binds to 127.0.0.1; rate limits on web and bot; postcss pinned (audit clean); secrets scan of all commits clean. 70 tests (52 core, 7 paid-api, 11 bot).

## 2026-09-26 — Vercel deployment fixes
- First Vercel build failed: `apps/paid-api/src/agent.ts` used `new URL('../../../.env', import.meta.url)`, which webpack tries to bundle (the file exists locally, not on Vercel). Replaced with a runtime `path.resolve`. Also: the demo directory is now imported as JSON (bundled) instead of read with fs, and the store falls back to `/tmp` when `VERCEL` is set (read-only filesystem). Verified by building without `.env` and running with `VERCEL=1`. Demo signer stays disabled on hosted deployments by design.

## 2026-09-26 — Full cloud mode (builder request: everything must work on the hosted version)
- **Store**: `Store` is now an async interface with `JsonStore` (local file) and `UpstashStore` (Redis REST, picked when `KV_REST_API_URL/TOKEN` exist). Single-use invites use `GETDEL` (atomic). Same contract suite runs on both backends (fake Redis in tests).
- **Bot**: `createBot()` shared by the local polling runner and the Vercel webhook route `/api/telegram` (secret header). Local polling refuses to start while a webhook is set (no silent takeover). `pnpm webhook:set|delete|info`.
- **x402 in the app**: seller routes `/api/paid/real` and `/api/paid/clone` (`@x402/next` `withX402`), so the agent self-fetches its own origin: no separate process, works on Vercel. The standalone Express `apps/paid-api` server stays as a reference.
- **Access control**: revoke/reset need `KAKUNIN_DEMO_SIGNER=1` and either plain localhost or `x-demo-token` (constant-time); agent demo is optionally public (`KAKUNIN_AGENT_PUBLIC=1`) and rate limited. `/api/health` reports what is configured (booleans only); `pnpm cloud:check` verifies a deployment end to end; `pnpm vercel:env` builds the import file for Vercel.
- Verified locally (agent through the in-app sellers: paid + blocked in 4 s; token gating; rate limit). Cloud verification needs the Vercel env + Upstash steps in docs/CLOUD.md.
