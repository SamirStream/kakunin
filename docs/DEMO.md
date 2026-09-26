# Demo script (4 min) — Kakunin

Everything below is REAL: every check reads ENSv2 on Sepolia; nothing is mocked. Run `pnpm rehearse` first (about 30 s): it replays this script against the live chain and fails loudly if anything drifted.

## Fastest path: the live cloud version

Everything runs on https://kakunin.xyz (Vercel + Upstash, bot on a webhook), so no local process is needed. Before going on stage:

```bash
pnpm cloud:check https://kakunin.xyz --agent     # must print "All checks passed"
```

Open on the laptop: https://kakunin.xyz/demo (main), https://kakunin.xyz/org/kakunin-demo.eth (dashboard). On the phone: https://t.me/KakuninxyzBot/app (Mini App). The demo buttons need the demo token: paste it in the field at the top of `/demo` (it is in Vercel env, never on screen).

## Setup (local alternative)

```bash
pnpm seed                      # idempotent: attester address, alice + bob + attestations, bot directory
pnpm bot                       # Telegram bot @KakuninxyzBot (needs TELEGRAM_BOT_TOKEN in .env)
pnpm paid                      # x402 paid API :4021 + fake clone :4022 (needs INTERCEPTA_API_KEY, AGENT_PRIVATE_KEY funded with Base Sepolia USDC)
pnpm web                       # http://localhost:3000  (KAKUNIN_DEMO_SIGNER=1 in .env enables the demo buttons)
```

Screens: `/` (hook), `/demo` (main), `/org/kakunin-demo.eth` (dashboard), Telegram on the phone.

## Timeline

| Time | Say | Do |
|---|---|---|
| 0:00 | **Hook.** On 18 Sept 2026 Japan's NPA, with the FBI, published a joint advisory on WaterPlum / "Contagious Interview": 30,000+ devices, 7,000+ wallets drained, about 1.7B JPY. Every infection started with a fake recruiter. | Landing page `/` |
| 0:30 | A "recruiter from KakuninDemo" DMs a developer. Today's defense is "be careful". | `/demo` scenario 1 (`@satoshi_recruiter`) → ❓ **Unknown**. Then scenario 2 (`@alice_kakunn`) → ⚠️ **Lookalike** of the real Alice. Show the **alert** appearing on the right (and on the phone if subscribed). |
| 1:15 | The real Alice is on the team registry, attested by the org's own ENS name. | Scenario 3 → ✅ **Verified**, show the signer = org address. On the phone: forward a message to the bot, same answer. |
| 1:45 | **WOW.** HR revokes Bob live. HR is a *separate wallet* that can only manage the team registry. | Scenario 4 (Bob is ✅) → click **HR: revoke Bob** (about 4 s on-chain) → run scenario 4 again → 🕓 **Former member**, revocation date read from ENSv2 events. |
| 2:30 | **Under the hood.** Hierarchical ENSv2 registries, Enhanced Access Control (HR cannot touch the root name), per-account permissioned resolver, Universal Resolver V2, registry events for history, and the draft ENSIP "Text Record Attestations". | `/org/kakunin-demo.eth` → **HR delegation** panel: HR allowed on the team registry, denied on the org root. Show the architecture diagram from the README. |
| 2:50 | **Where the attack happens: Telegram.** The Mini App authenticates the person by Telegram's signed `initData`, so nobody can ask for someone else's card. | Phone: open the Mini App → **My card** shows the verified stamp for your own account. Open **Check**, pick a contact with the native picker (`/pick`) → stamp. As admin, **Team** tab → revoke or add a member; the web dashboard updates. |
| 3:15 | **Agents pay for the check.** An AI agent buys Kakunin checks over x402. Before it signs, it screens the destination with the live Intercepta API. | `/demo` section 5 → **Run agent purchases** (about 4 s): ✅ payment approved (screened low, paid 0.001 USDC, got the verdict) and ⛔ the fake clone blocked before signing, with Intercepta's reasons (sanction_address, known_scammer). |
| 3:45 | **Vision.** Free for users, paid alerts for projects, native Telegram badges later (Telegram third-party verification). | Landing page |

## Q&A cheat sheet

- **Why numeric Telegram ID?** Usernames are mutable; the ID is the identity. The bot refreshes the @username on every interaction.
- **Why is the org the owner of member subnames?** Members do not need wallets; the org vouches. HR is limited by EAC roles.
- **Where does "former member" come from?** An unregistered ENSv2 name disappears from registry state, so we read `LabelUnregistered` events (block timestamp).
- **What if the record or the attester key changes?** The attestation is rebuilt from live ENS data, so it stops verifying (the ENSIP's design).
- **atst.me compatibility?** Our tests reproduce a real mainnet attestation byte for byte; the playground only resolves mainnet, so Sepolia demos use our own verifier.

## Fallbacks

- Sepolia RPC slow: set `SEPOLIA_RPC_URL` in `.env` to an Alchemy/Infura Sepolia URL and restart.
- Demo state drifted: click **Reset demo** on `/demo`, or `pnpm seed`.
- Onboard a judge live: dashboard → **Invite** shows a QR (single-use, signed by HR). A judge scans it with their own Telegram, and their card becomes a real attested member within seconds. This answers "is it hardcoded?" better than anything else.
- Bot down: the web `/check` and `/demo` give the same answers.
- Wi-Fi dead: screen-record `pnpm rehearse` output in advance as a last resort.
