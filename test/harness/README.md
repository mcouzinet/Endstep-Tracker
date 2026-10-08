# Harnais de QA (hors tests unitaires)

Scripts Puppeteer utilisés pendant le développement. Ils supposent Chrome for Testing et puppeteer-core
aux chemins indiqués en tête de chaque fichier (adapter si besoin). Ils écrivent leurs captures dans ce dossier.

- `gen-demo.js` : génère des données de démo + les pages `harness-*.html` (dashboard réel avec `chrome.storage` simulé et le métagame Modern servi depuis `meta-Modern.json`).
- `shots.js` : captures du tableau de bord (large, étroit, détail, menu, vide, filtres, anglais).
- `qa-live.js` : mise à jour en direct (journal conservé, report pendant saisie/sélection, suppression, import invalide).
- `qa-popup.js` : la popup dans la vraie extension (profil jetable, données de démo), en français et en anglais, interrupteur du panneau, ouverture du tableau de bord.
- `qa-overlay.js` : le panneau dans la vraie extension, sur une page endstep.cc factice (toute requête vers endstep.cc est servie localement, aucune n'atteint le site) : entre deux games, replié sans prendre le focus, nouvelle game, déplacement gardé, fin de match, coupure depuis la popup.
- `qa-guide.js` : session (confirmation d’archétype, ouverture d’un match), panneau de matchup, plan de side enregistré puis rappelé sous la ligne, Échap, `j`, tri ; assertions.
- `qa-versions.js` : versions de liste (deux listes pour Burn en Modern), comparaison avec la version précédente, colonnes G1 / G2-G3 ; assertions, sort en erreur si l'une échoue.
- `qa-guess.js` : reconnaissance du deck adverse dans le harnais.
- `qa-cards.js` : les onglets, « Mes cartes » et le side (panneau du matchup, détail d'un match), sur `harness-cards.html` (24 Bo3 Burn inventés, avec cartes piochées et side), large et étroit.
- `qa-history.js` : l'import de l'historique dans la vraie extension, sur une page `/history` factice (réponses servies localement) : rien sans le bouton « Importer mes anciens matchs » ; ensuite matchs absents ajoutés, match déjà enregistré (sous un autre id) laissé tel quel, doublon d'une build précédente retiré, compteur du panneau, « Terminer ».
- `qa-access.js` : le bandeau « pas d'accès permanent à endstep.cc » dans la popup et le tableau de bord (accès simulé via chrome.permissions), et son bouton.
- `qa-acted.js` : un onglet qui ne fait que recevoir une partie (jouée dans un autre onglet ou sur un autre ordinateur) ne l'enregistre pas, celui qui y agit si ; l'import d'une sauvegarde fusionne (copie la plus complète gardée, notes d'ici conservées).
- `e2e.js` : extension réellement chargée dans Chrome for Testing, partie rapide contre le bot puis vérification du stockage et du tableau de bord.
- `e2e-reload.js` : onglet endstep.cc ouvert avant l'installation de l'extension (même chemin que ↻ / mise à jour) : le traqueur doit être injecté dans l'onglet et enregistrer une trame ; ne joue aucune partie.
  Crée une session invitée, un deck et un match sur endstep.cc : à lancer avec parcimonie (une fois par phase, pas en boucle).
- `fetch-meta.js <Format>` : instantané du métagame d'un format (`meta-<Format>.json`).

Lancer depuis ce dossier : `node gen-demo.js && node shots.js`.
