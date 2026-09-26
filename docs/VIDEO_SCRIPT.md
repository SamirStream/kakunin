# Demo video script (about 3:30, spoken English)

Read it aloud at a calm pace (about 130 words per minute). Cues in *italics* are actions on screen (in French, for you). Total: about 440 spoken words. Record voice and screen together, then cut any waiting.

Before recording: `pnpm cloud:check https://kakunin.xyz --agent` is green, demo token pasted in `/demo`, browser at 1280x720 or larger, notifications off, no `.env` or Vercel tab visible.

---

## 0:00 to 0:20 — Hook  (kakunin.xyz, landing page)

*Page d'accueil, le tampon se pose sur le message du faux recruteur.*

"Last week, Japan's police and the FBI warned about fake recruiters who drain crypto wallets. It always starts the same way: someone says they work for a project, and a developer believes them. Kakunin answers one question: is this person really on that team?"

## 0:20 to 0:55 — Check  (/demo, scenarios 1 to 3)

*Scénario 1 `@satoshi_recruiter` → Unknown. Scénario 2 `@alice_kakunn` → Lookalike. Montre l'alerte à droite. Scénario 3 → Verified, ouvre le panneau de preuve.*

"A stranger claims to recruit for KakuninDemo. Unknown. Someone with a name one letter off from a real teammate: lookalike, and the project gets an alert. And the real Alice: verified. This isn't our database talking. The proof shows the organization's own ENS name signed this identity, and anyone can check it."

## 0:55 to 1:30 — ENSv2 under the hood  (/org/kakunin-demo.eth)

*Dashboard: liste d'équipe, panneau HR delegation.*

"Here is the organization on ENSv2, on Sepolia. Every member is a subname in a team registry. A separate HR wallet manages that registry through Enhanced Access Control. The panel reads the roles live: HR can add and revoke members, but it is denied on the organization's root name. The person who runs recruiting can never take over the project's identity."

## 1:30 to 2:10 — Revocation  (/demo, scenario 4)

*Scénario 4 (Bob) → Verified. Clique « HR: revoke Bob », attends la transaction (coupe l'attente au montage). Relance le scénario 4 → Former member.*

"Now Bob leaves the company. HR revokes him with one transaction. Same check, new answer: former member, with the date read from ENSv2 events. An old teammate can no longer pass as current staff, and nobody had to update a list by hand."

## 2:10 to 2:50 — Telegram  (téléphone, filmé ou capturé)

*Ouvre la Mini App : My card → tampon vérifié. Puis Check → sélecteur de contact → résultat. Optionnel : transfère un message au bot.*

"Attacks happen on Telegram, so the check lives there too. The Mini App authenticates you with Telegram's own signed data, so nobody can request someone else's card. Pick a contact, get the stamp. Your identity is your numeric Telegram ID, not your username, because usernames can be changed to impersonate someone."

## 2:50 to 3:20 — AI agents  (/demo, section 5, « Run agent purchases »)

*Clique Run agent purchases. Montre le paiement approuvé, puis le clone bloqué avec les raisons.*

"Agents can buy this check per call over x402. Before an agent signs a payment, it screens the destination with the Intercepta API. The real endpoint scores clean and gets paid. The clone is flagged, sanctioned address and known scammer, and the payment is refused before anything is signed."

## 3:20 to 3:35 — Close  (GitHub + terminal)

*Repo GitHub, puis `pnpm cloud:check` en vert. Retour sur la landing.*

"Kakunin is open source and running live at kakunin.xyz. Free for people, paid alerts for projects, per-call checks for agents. Thank you."

---

## Notes de tournage

- Si la transaction de révocation dépasse ~10 s, coupe-la au montage. Ne parle pas pendant l'attente.
- Si un appel échoue en direct, refais la prise. Ne montre jamais une erreur sans l'expliquer.
- Ne dis pas « hardcoded » ni « mock ». Tout est réel sur Sepolia, sauf les deux IDs Telegram de démo (Alice et Bob), donc pas de phrase du type « membres réels de l'équipe ». Dis « demo members ».
- « Last week » suppose que l'avis NPA/FBI du 18 sept 2026 est correct : vérifie la date et les chiffres (30 000 appareils, 7 000 wallets, 1,7 Md JPY) avant d'enregistrer. Sinon, retire la phrase de chiffres.
- Astuce pitch en direct : fais scanner le QR d'invitation à un juge (dashboard → Invite).
