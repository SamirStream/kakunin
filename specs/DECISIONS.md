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
