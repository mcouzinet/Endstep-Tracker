# Harnais de QA (hors tests unitaires)

Scripts Puppeteer utilisés pendant le développement. Ils supposent Chrome for Testing et puppeteer-core
aux chemins indiqués en tête de chaque fichier (adapter si besoin). Ils écrivent leurs captures dans ce dossier.

- `gen-demo.js` : génère des données de démo + les pages `harness-*.html` (dashboard réel avec `chrome.storage` simulé et le métagame Modern servi depuis `meta-Modern.json`).
- `shots.js` : captures du tableau de bord (large, étroit, détail, menu, vide, filtres, anglais).
- `qa-live.js` : mise à jour en direct (journal conservé, report pendant saisie/sélection, suppression, import invalide).
- `qa-guess.js` : reconnaissance du deck adverse dans le harnais.
- `e2e.js` : extension réellement chargée dans Chrome for Testing, partie rapide contre le bot puis vérification du stockage et du tableau de bord.
- `e2e-reload.js` : onglet endstep.cc ouvert avant l'installation de l'extension (même chemin que ↻ / mise à jour) : le traqueur doit être injecté dans l'onglet et enregistrer une trame ; ne joue aucune partie.
  Crée une session invitée, un deck et un match sur endstep.cc : à lancer avec parcimonie (une fois par phase, pas en boucle).
- `fetch-meta.js <Format>` : instantané du métagame d'un format (`meta-<Format>.json`).

Lancer depuis ce dossier : `node gen-demo.js && node shots.js`.
