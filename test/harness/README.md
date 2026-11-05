# Harnais de QA (hors tests unitaires)

Scripts Puppeteer utilisés pendant le développement. Ils supposent Chrome for Testing et puppeteer-core
aux chemins indiqués en tête de chaque fichier (adapter si besoin). Ils écrivent leurs captures dans ce dossier.

- `gen-demo.js` : génère des données de démo + les pages `harness-*.html` (dashboard réel avec `chrome.storage` simulé et le métagame Modern servi depuis `meta-Modern.json`). La racine du dépôt est prise depuis le dossier du script : une copie de travail (worktree) teste son propre code. Les pages exposent les globales du tableau de bord (`matches`, `render`, `S`, `state`, `cardNames`) à `page.evaluate`.
- `shots.js` : captures du tableau de bord (large, étroit, détail, menu, vide, filtres, anglais).
- `qa-live.js` : mise à jour en direct (journal conservé, report pendant saisie/sélection, suppression, import invalide).
- `qa-redraw.js` : les rafraîchissements que l'utilisateur n'a pas demandés (noms de cartes de Scryfall, métagame, match en direct) : la saisie et la place du clavier ne bougent pas, ils attendent qu'on quitte le champ, et le clic qui quitte le champ n'est pas perdu ; réponses Scryfall servies localement, au moment choisi ; assertions.
- `qa-popup.js` : la popup dans la vraie extension (profil jetable, données de démo), en français et en anglais, interrupteur du panneau, ouverture du tableau de bord.
- `qa-overlay.js` : le panneau dans la vraie extension, sur une page endstep.cc factice (toute requête vers endstep.cc est servie localement, aucune n'atteint le site) : entre deux games, replié sans prendre le focus, nouvelle game, déplacement gardé, fin de match, coupure depuis la popup.
- `qa-guide.js` : résumé (ni bandeau de session ni courbe, pas de taux sous 5 matchs, derniers résultats et leur survol), ouverture d'un match depuis un carré, onglets au clavier, panneau de matchup (bilans, aucun plan saisi à la main), Échap, `j`, tri, renommage d'un archétype ; assertions.
- `qa-versions.js` : versions de liste (deux listes pour Burn en Modern), comparaison avec la version précédente, colonnes G1 / G2-G3 ; assertions, sort en erreur si l'une échoue.
- `qa-guess.js` : reconnaissance du deck adverse dans le harnais.
- `qa-meta-busy.js` : le métagame d'un format répond 503 dans la vraie extension (réponses servies localement, aucune n'atteint le site) : les autres formats se chargent, un seul message d'erreur, nouvel essai plus tard, ancien métagame gardé sans message.
- `qa-format-move.js` : « Changer de format… » dans la vraie extension (métagame servi localement) : format écrit ou connu, saisie gardée pendant un rafraîchissement, prochains matchs, métagame du nouveau format, « Séparer », fusion, texte hostile, sauvegarde ; assertions.
- `qa-cards.js` : les onglets, « Mes cartes » et le side (panneau du matchup, détail d'un match), sur `harness-cards.html` (24 Bo3 Burn inventés, avec cartes piochées et side), large et étroit.
- `qa-history.js` : l'import de l'historique dans la vraie extension, sur une page `/history` factice (réponses servies localement) : rien sans le bouton « Importer mes anciens matchs » ; ensuite matchs absents ajoutés, match déjà enregistré (sous un autre id) laissé tel quel, doublon d'une build précédente retiré, compteur du panneau, « Terminer ».
- `qa-access.js` : le bandeau « pas d'accès permanent à endstep.cc » dans la popup et le tableau de bord (accès simulé via chrome.permissions), et son bouton.
- `qa-acted.js` : un onglet qui ne fait que recevoir une partie (jouée dans un autre onglet ou sur un autre ordinateur) ne l'enregistre pas, celui qui y agit si ; l'import d'une sauvegarde fusionne (copie la plus complète gardée, notes d'ici conservées).
- `e2e.js` : extension réellement chargée dans Chrome for Testing, partie rapide contre le bot puis vérification du stockage et du tableau de bord.
- `e2e-reload.js` : onglet endstep.cc ouvert avant l'installation de l'extension (même chemin que ↻ / mise à jour) : le traqueur doit être injecté dans l'onglet et enregistrer une trame ; ne joue aucune partie.
  Crée une session invitée, un deck et un match sur endstep.cc : à lancer avec parcimonie (une fois par phase, pas en boucle).
- `fetch-meta.js <Format>` : instantané du métagame d'un format (`meta-<Format>.json`).

Lancer depuis ce dossier : `node gen-demo.js && node shots.js`.

Ne jamais laisser un script appeler le vrai Scryfall (il limite puis bloque la machine) : intercepter `api.scryfall.com` avec `page.setRequestInterception` et répondre une carte factice, ou lancer Chrome avec `--host-resolver-rules=MAP * ~NOTFOUND`. Dans le dossier principal, les erreurs vers `127.0.0.1:8765` viennent du Coach de développement.
