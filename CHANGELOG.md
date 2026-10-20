# Changelog

Toutes les versions notables de fadarr. Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/),
versions en [SemVer](https://semver.org/lang/fr/). / All notable changes; English summary under each entry.

## [0.6.2] — 2026-10-20
Bibliothèque façon Traktor.
### Ajouté
- **Couleur par ligne façon Traktor** : la couleur d'un morceau teinte toute la ligne (fond léger + barre à gauche) et s'affiche comme une pastille cliquable dans la colonne #. (Avant, le liseré était un `box-shadow` sur `<tr>` que les navigateurs ne rendent pas — d'où « toujours pas de couleur ».)
- **Tonalité colorée** (roue Camelot) : chaque Ton. prend une teinte, façon Traktor/Mixxx.
### Corrigé
- **Waveform RGB « full color »** : le mode RGB utilisait les couleurs du skin (bleu/orange/crème) et paraissait monochrome. Il utilise maintenant un vrai dégradé graves = rouge, médiums = vert, aigus = bleu, indépendant du skin. (Le mode se choisit dans « Onde » ; RGB par défaut.)
- *EN: Traktor-style per-row color (full-row tint + left bar + clickable dot in the # column) — fixes the color that never showed because a `<tr>` box-shadow doesn't render; Camelot-colored key column; real full-color RGB waveform (low=red / mid=green / high=blue) instead of the dull skin-tinted mix.*

## [0.6.1] — 2026-10-20
### Ajouté
- **Notes cliquables (★) façon Mixxx** : 5 étoiles sur chaque ligne de la bibliothèque — clic pour noter, reclic sur la même étoile pour enlever. La note est enregistrée et repart à l'export Rekordbox/Traktor.
- **Clic droit sur un morceau** : poser une **couleur** (7 teintes Traktor) ou l'enlever, et charger le morceau dans le deck A ou B. La couleur s'affiche en liseré à gauche de la ligne.
### Corrigé
- **Largeur de la bibliothèque** : la liste occupe enfin toute la largeur. Une ligne d'espacement de la liste virtualisée créait une colonne fantôme qui rognait ~390 px à droite (la colonne Titre ne s'étirait plus). Corrigé.
- *EN: click-to-rate stars on every library row (saved, exported); right-click a track to set/clear a Traktor color or load it into a deck; fixed the library not using full width (a virtual-list spacer row spawned a phantom column that stole ~390px).*

## [0.6.0] — 2026-10-20
Playlists façon Mixxx / Traktor (idées seulement ; Mixxx et Traktor restent la propriété de leurs auteurs, fadarr reste MIT).
### Ajouté
- **Couleurs Traktor importées** : la pastille de couleur (INFO COLOR 1–7) de chaque morceau est reprise et affichée comme un liseré coloré à gauche de la ligne.
- **Notes (étoiles) dans la bibliothèque** : la note Traktor (RANKING) s'affiche en ★ (0–5) ; colonne triable. Les commentaires Traktor étaient déjà importés.
- **Clic droit sur les playlists** (façon Traktor) : Ouvrir, Renommer, Dupliquer, Nouvelle catégorie, Sortir de la catégorie, Supprimer. Sur une catégorie : Nouvelle playlist ici, Renommer, Dissoudre. Sur une playlist Traktor/Rekordbox : Copier dans mes playlists.
- **Glisser une playlist dans un dossier Traktor/Rekordbox** : la range dans une catégorie du même nom (ex. glisser « Otawa » dans « Next »).
- **Export vers Traktor (`collection.nml` ré-importable)** : réécrit toutes les playlists fadarr avec leurs catégories (→ dossiers Traktor), couleurs, notes, BPM, grille et cues. Les morceaux venus de Traktor retrouvent leur emplacement d'origine ; ceux ajoutés seulement dans fadarr sont ignorés. **Ajout non destructif** : à importer dans Traktor (clic droit sur « Playlists » > Import…), jamais à substituer au `collection.nml` d'origine.
### Note sur la rétro-compatibilité
- fadarr ne voit qu'une **copie** téléversée de `collection.nml` : il ne réécrit jamais la base Traktor en direct (ce serait destructif). La rétro-compatibilité passe par l'export ci-dessus, à ré-importer dans Traktor.
- *EN: imported Traktor track colors (row accent) and ratings (★ column, sortable); Traktor-style right-click menu on playlists & categories; drop a playlist onto a Traktor/Rekordbox folder to file it under a matching category; Export to Traktor as a re-importable collection.nml (categories→folders, colors, ratings, BPM, grid, cues) — a non-destructive add-on, never a replacement for the original. fadarr only ever reads an uploaded copy of collection.nml, so it never writes Traktor's live database.*

## [0.5.0] — 2026-10-19
Inspiré de Mixxx (idées seulement ; Mixxx est GPL, fadarr reste MIT).
### Renommé
- **Projet renommé `mixarr` → `fadarr`.** Les données existantes (`mixarr.json`, playlists perso) sont migrées automatiquement au premier lancement.
### Ajouté
- **Forme d'onde RGB façon Mixxx** : une couleur par colonne mélangée selon l'énergie grave/médium/aigu. Sélecteur « Onde » (RGB / Bandes) dans l'en-tête.
- **Détection de grille (beatgrid)** : BPM et 1er temps analysés dans le navigateur ; détection automatique au chargement d'un morceau sans grille importée.
- **Barre « Grille » par deck** : Tap tempo, caler le 1er temps sur la tête de lecture, ×2 / ÷2, détection « Auto ». Une grille auto n'est pas marquée « modifiée » (un import pourra la remplacer).
- **Colonne et filtre « Ajouté »** (date d'ajout) dans la bibliothèque : tri par date et filtre 7 j / 30 j / 90 j / 1 an.
### Corrigé
- **Mise en page des formes d'onde** : hauteur désormais fixe (ne grandit plus avec la largeur) — les decks ne dévorent plus l'écran et la bibliothèque prend toute la place. Les decks occupent toute la largeur.
- **Rangée transport compactée** : CUE · Play · IN / OUT / 4 / 8 / loop sur une seule ligne (plus de ligne à moitié vide) ; Quantize et memory cue/loop regroupés avec les outils de grille.
- **Suppression des memory cues** : la croix d'une puce les efface de nouveau (elles ne partaient plus après enregistrement).
- *EN: Mixxx-style RGB waveform (selectable), browser beatgrid detection, per-deck grid tools, date-added column & filter; fixed waveform height, full-width decks, compacted transport row.*

## [0.4.0] — 2026-10-19
### Ajouté
- **Liste de morceaux virtualisée** : seules les lignes visibles sont dessinées — des milliers de morceaux défilent sans ralentir.
- **Import Rekordbox** (`rekordbox.xml`) en plus de l'import Traktor : playlists, dossiers, cues, loops, grille, BPM, tonalité ; section « Rekordbox » dans la barre latérale.
- **Choix du format à l'export** (Rekordbox XML ; clé USB directe à venir).
- *EN: virtualised track list, Rekordbox import, export format chooser.*

## [0.3.0] — 2026-10-16
### Ajouté
- **BPM latéral éditable** façon Traktor, en temps réel ; clic pour poser / corriger le BPM.
- **Bouton SYNC allumé** (bleu) quand les tempos sont calés.
- **Decks et panneau repliables** (mémorisés).
- **Deck façon CDJ** : fader de tempo vertical à droite, bouton play rond.
### Modifié
- **Export Rekordbox fiabilisé pour les CDJ** : une grille de tempo est écrite pour chaque morceau qui a un BPM ; rapport de vérification après export.
- *EN: editable lateral BPM, lit SYNC, collapsible decks/panel, CDJ-style deck, sturdier Rekordbox export with a verification report.*

## [0.2.0] — 2026-10-16
Première version publiable (GitHub, MIT).
### Ajouté
- Deux decks (Web Audio), mixeur, skins ; formes d'onde colorées, glow, phase, compatibilité tonalité/BPM, pré-écoute, quantize.
- Bibliothèque NAS, import Traktor, export Rekordbox XML.
- Interface **français / anglais**, prête pour d'autres langues.
- *EN: first public release — two decks, mixer, colored waveforms, NAS library, Traktor import, Rekordbox XML export, FR/EN.*

[0.5.0]: https://github.com/mauvestudio/fadarr/releases/tag/v0.5.0
[0.4.0]: https://github.com/mauvestudio/fadarr/releases/tag/v0.4.0
[0.3.0]: https://github.com/mauvestudio/fadarr/releases/tag/v0.3.0
[0.2.0]: https://github.com/mauvestudio/fadarr/releases/tag/v0.2.0
