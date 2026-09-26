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

## 2026-09-26 — Clock
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
