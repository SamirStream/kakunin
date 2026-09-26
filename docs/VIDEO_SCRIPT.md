# Demo video script (target 2:50, well under the 4 minute limit)

Rules this script follows: **brief, concise, show don't tell.** The video plays during your judging slot, so it must be a full summary of what you built. Every scene is something happening on screen; the voice says one short thing per scene; captions carry the facts. About 330 spoken words (about 2:35 at a calm pace), the rest is silence while the screen works.

Record the screen at 1280x720 or more. Voice-over can be recorded after the screen, scene by scene, which is easier than talking live. Cut every wait: the only wait you show is the creation time-lapse (with a visible timer).

Before recording: `pnpm cloud:check https://kakunin.xyz` is green, demo token pasted in `/demo`, notifications off, no `.env`, Vercel tab or token field visible. For the creation scene use a fresh free name (for example `thearch`) and your own wallet. Start the run first, record the other scenes while it works, and use the finished result.

Legend: **CAPTION** = text burned into the video (large, 3 to 6 words). *Écran* = what to show (in French, for you).

---

## 1. 0:00 to 0:12 — The promise  (landing, first screen)

*Écran : kakunin.xyz, le tampon 偽 se pose sur le faux message de recruteur.*
**CAPTION:** "Is this recruiter really from that project?"

Voice: "Fake recruiters drain crypto teams. Kakunin answers in one second, from ENSv2."

## 2. 0:12 to 0:35 — It works  (/demo)

*Écran : scénario 2 (`@alice_kakunn`) → tampon 偽 « Lookalike » + l'alerte à droite. Puis scénario 3 (Alice) → tampon 確 « Verified », ouvre « Check the proof yourself ».*
**CAPTION:** "Lookalike caught" then "Verified, with a proof anyone can check"

Voice: "A lookalike: caught, and the project is alerted. The real Alice: verified, signed by the organization's own ENS name."

## 3. 0:35 to 1:15 — Any project can join  (/create, time-lapse)

*Écran : tape `thearch`, disponibilité verte, « Use my browser wallet », « Create ». Time-lapse de la checklist avec un chrono à l'écran (2:35 → accéléré à ~15 s). Fin : « thearch.eth is live », puis « Open your dashboard ».*
**CAPTION:** "Created live on ENSv2 Sepolia · 12 transactions · 2 min 35 · gas sponsored"

Voice: "And it's not one demo organization. Any project creates its own. The name is registered to its wallet, not to us."

## 4. 1:15 to 1:45 — Least privilege, on-chain  (dashboard de la nouvelle org)

*Écran : « Sign in with wallet » (une signature). Panneau Delegation : équipe « allowed », racine « denied ». « Add member » (carol) → ligne apparaît ; « Revoke » → « former · revoked ». Coupe les attentes.*
**CAPTION:** "Operator: team only · root: denied" then "Added. Revoked. No gas for the admin."

Voice: "One signature to add or revoke. The operator can run the team and nothing else, and the roles are read live from the chain."

## 5. 1:45 to 2:20 — Where the attack happens  (téléphone : Mini App Telegram)

*Écran : enregistrement du téléphone. Mini App → « My card » (tampon vérifié). Onglet Check → sélecteur de contact → un faux recruteur → 偽. Puis retour sur l'ordinateur : l'alerte apparaît dans le dashboard.*
**CAPTION:** "Telegram Mini App · identity = numeric ID"

Voice: "In Telegram, Telegram itself signs who you are. Pick a contact and Kakunin checks every project."

## 6. 2:20 to 2:45 — Agents  (/demo, section 5)

*Écran : clique « Run agent purchases ». Le paiement approuvé (PAID, score 0), puis le clone bloqué (REFUSED, sanction_address, known_scammer).*
**CAPTION:** "x402 agent · Intercepta screening before signing"

Voice: "Agents buy this check per call. Before signing, a policy checks the token, the amount and the payee with Intercepta. One paid, one refused, and it never pays when unsure."

## 7. 2:45 to 2:55 — What was built  (écran de synthèse)

*Écran : une seule diapositive (fond washi) : « Kakunin 確認 », kakunin.xyz, github.com/SamirStream/kakunin, et trois lignes : « ENSv2: registries, EAC, attestations · Intercepta: screened x402 agent · Telegram bot + Mini App + API ».*
**CAPTION:** (la diapositive elle-même)

Voice: "Kakunin. Open source, live at kakunin.xyz."

---

## Si tu dépasses 3 minutes, coupe dans cet ordre

1. Scène 5, la partie ordinateur (l'alerte), puis la scène 2 (garde seulement le vérifié).
2. La signature de connexion de la scène 4 (montre juste le panneau Delegation).
3. Jamais la scène 3 (création live) ni la scène 6 (agent) : ce sont vos deux preuves les plus fortes.

## Notes de tournage

- Une idée par scène, un mouvement à l'écran à la fois, curseur calme, zoom sur les tampons et sur « denied / allowed ».
- Ne dis pas « mock ». Tout est réel sur Sepolia, sauf les deux IDs Telegram de démo (Alice et Bob) : dis « demo members ».
- Le nom choisi doit être libre sur ENSv2 Sepolia (le champ le dit en vert). Environ 2 min 35 mesurées (137 à 155 s selon les runs).
- Ne cite pas de chiffre externe dans la vidéo. Si tu veux un chiffre d'accroche, l'avis NPA/FBI du 18 sept 2026 est vérifié (source : advisory FBI IC3 260918, au moins 30 000 appareils, plus de 7 000 wallets, 1,7 milliard de yens), mais ce n'est pas nécessaire.
- Pitch en direct devant les juges : un juge scanne le QR d'invitation d'un membre (dashboard → Invite) avec son propre Telegram.
- Vérifie ce que tu montres : aucun @username ni ID personnel visible, pas de token, pas de clé.
