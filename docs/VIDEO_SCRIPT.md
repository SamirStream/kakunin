# Demo video script (about 3:45, spoken English)

Read it aloud at a calm pace (about 130 words per minute, about 480 spoken words). Cues in *italics* are actions on screen (in French, for you). Record voice and screen together, then cut every wait.

Before recording: `pnpm cloud:check https://kakunin.xyz` is green, demo token pasted in `/demo`, browser at 1280x720 or larger, notifications off, no `.env` or Vercel tab visible. For the creation scene, use a fresh name you have not used (for example `thearch`) and a wallet you control; start the run first, record the rest of the scene while it works, and cut the wait in editing (real duration: about 2.5 minutes).

---

## 0:00 to 0:20 — Hook  (kakunin.xyz, landing page)

*Page d'accueil, le tampon se pose sur le message du faux recruteur.*

"Fake recruiters are how crypto teams get hacked: someone says they work for a project, and a developer believes them. Chasing fakes never ends, so Kakunin does the opposite. Each project publishes the short list of people who are real, on ENSv2, and anyone can check against it."

## 0:20 to 0:50 — Check  (/demo, scenarios 2 and 3)

*Scénario 2 `@alice_kakunn` → Lookalike (montre l'alerte). Scénario 3 → Verified, ouvre le panneau de preuve.*

"A handle one letter off from a real teammate: lookalike, and the project gets an alert. And the real Alice: verified. This isn't our database talking. The organization's own ENS name signed this identity, and anyone can re-check the proof."

## 0:50 to 1:35 — Any project can join  (/create)

*Tape `thearch`, clique « Use my browser wallet », dispo verte, « Create my organisation ». Laisse défiler la checklist (accélère au montage), puis « Open your dashboard ».*

"And it isn't one demo organization. Any project can create its own. Pick a name and the wallet that will own it. Kakunin registers the name to that wallet through the ENS registrar, then deploys the registries and resolvers on ENSv2, and gives a limited operator key just enough rights to run the team. About two minutes, on Sepolia, gas sponsored. Here it is: the name belongs to my wallet, not to Kakunin."

## 1:35 to 2:05 — ENSv2 delegation  (dashboard of the new org, panneau Delegation)

*Descends au panneau Delegation : équipe « allowed », racine « denied ». Signe avec le wallet (« Sign in with wallet »).*

"The delegation panel reads the access-control roles live from the chain. The operator can register and revoke members on the team registry, and it is denied everywhere on the organization's root. I can take its rights away on-chain whenever I want. Signing in costs no gas: I sign, and the operator sends the transactions."

## 2:05 to 2:35 — Add and revoke  (dashboard : Add member, puis Revoke)

*Ajoute `carol` (rôle Engineer) : signature, ~25 s (coupe l'attente). Clique Revoke (signature) et montre « former · revoked » (coupe l'attente).*

"Adding a member is one signature and one Telegram link. Revoking is the same. The team is public on ENS, so the moment someone is revoked, every answer changes: former member, with the date, read from ENSv2 events."

## 2:35 to 3:05 — Telegram  (téléphone : Mini App)

*Ouvre la Mini App : My card → tampon vérifié. Puis Check → sélecteur de contact → résultat « any project ». Optionnel : montre l'onglet Team d'un admin.*

"Attacks happen on Telegram, so the check lives there. The Mini App is authenticated by Telegram's own signed data, so nobody can request someone else's card. Pick a contact and Kakunin looks them up across every project on the network. Your identity is your numeric Telegram ID, never a username, because usernames can be changed to impersonate someone."

## 3:05 to 3:30 — AI agents  (/demo, section 5, « Run agent purchases »)

*Clique Run agent purchases. Montre le paiement approuvé, puis le clone bloqué avec les raisons.*

"Agents can buy this check per call over x402. Before an agent signs a payment, it screens the destination with the Intercepta API. The real endpoint scores clean and gets paid. The clone is flagged, sanctioned address and known scammer, and the payment is refused before anything is signed."

## 3:30 to 3:45 — Close  (landing)

*Retour sur la landing.*

"Kakunin is open source and running live at kakunin.xyz. Free for people, alerts for projects, per-call checks for agents. Thank you."

---

## Notes de tournage

- Ne dis pas « mock ». Tout est réel sur Sepolia, sauf les deux IDs Telegram de démo (Alice et Bob) : dis « demo members ».
- Si une étape échoue en direct, refais la prise. Ne montre jamais une erreur sans l'expliquer.
- Le wizard poursuit le run même si tu quittes la page (localStorage) : tu peux le lancer, tourner d'autres scènes, puis revenir.
- Pitch en direct : un juge scanne le QR d'invitation d'un membre (dashboard → Invite) avec son propre Telegram, ou tu lances la création d'une organisation pendant que tu parles (2,5 min).
- Le chiffre d'accroche de la version précédente (avis NPA/FBI du 18 sept 2026) a été retiré : ne le cite que si tu as vérifié la source.
