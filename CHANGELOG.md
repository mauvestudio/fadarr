# Changelog

Toutes les versions notables de fadarr. Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/),
versions en [SemVer](https://semver.org/lang/fr/). / All notable changes; English summary under each entry.

## [0.8.0] — 2026-10-25
Interface façon Traktor Pro (disposition et codes visuels seulement : aucun logo ni élément graphique de Native Instruments ; fadarr reste MIT).
### Modifié
- **Decks façon Traktor** : titre / artiste / album sur trois lignes, temps restant et durée, BPM, % de tempo et BPM d'origine, grande lettre A / B ; SYNC et indicateur de phase sur une ligne ; fader de tempo à droite de la forme d'onde ; Play vert, CUE, tailles de loop 1/2 · 1 · 2 · 4 · 8 · 16 (reclic = sortir de la loop), IN / OUT ; 8 hot cues numérotés 1 à 8 ; tête de lecture rouge.
- **Mixeur central** compact : tempo du deck maître en haut, potards à côté des faders. Le skin par défaut s'appelle désormais « Traktor » (Analog et Rotary restent disponibles).
- **Navigateur façon Traktor** : recherche en haut de l'arbre, lignes entièrement teintées par leur couleur, ligne sélectionnée en bleu, colonnes # · ▶/deck chargé · couleur · Titre · Artiste · BPM · Ton. · Note · Durée · Format · Cues · Ajouté, barre d'état (nombre de morceaux, durée totale). Colonnes secondaires masquées sur les écrans de MacBook.
- **Waveform RGB** : chaque bande est rapportée à son niveau typique sur le morceau (les médiums ne mettent plus tout en vert) ; kicks orange / rouge, charley bleu, plein spectre blanc. La vue d'ensemble garde les mêmes teintes.
### Ajouté
- **Favoris** (grille 2 × 6 au-dessus de la liste) : clic droit sur une playlist ou un dossier › Ajouter aux favoris.
- Horloge dans la barre du haut.
- *EN: Traktor Pro–style layout (no NI logos or artwork): three-line deck header, tempo fader beside the waveform, lime Play, 1/2–16 beat loop sizes, numbered hot cues, red playhead; compact mixer with master tempo; tree search, full-row colors, blue selection, status bar; 2×6 favorites grid; RGB waveform rebalanced per band so mids no longer turn everything green.*

## [0.7.1] — 2026-10-21
### Corrigé
- **Waveform RGB enfin « full color »** : le mode RGB faisait une moyenne pondérée des 3 couleurs de bande → comme la basse domine partout, tout virait à l'orange. Désormais chaque bande pilote directement un canal (graves = rouge, médiums = vert, aigus = bleu), façon Mixxx : rouge sur les kicks, vert sur les médiums, bleu sur les aigus, blanc sur le plein spectre.
- *EN: real full-color RGB waveform — each frequency band now drives its own channel (low=R, mid=G, high=B) instead of a weighted average that always skewed orange.*

## [0.7.0] — 2026-10-20
### Ajouté
- **Figer l'ordre d'une playlist** (façon Traktor) : trie une playlist par colonne (#, BPM, tonalité, note…) puis « Figer cet ordre » enregistre cet ordre comme nouvel ordre de la playlist. (La colonne # reste le numéro de piste : clic = ordre de la playlist, et le glisser-déposer reste dispo dans cet ordre.)
### Performance
- **Analyse hors du fil principal** : la forme d'onde et la détection de beatgrid tournent désormais dans un Web Worker. Charger un morceau ne gèle plus l'interface — avant, chaque morceau sans BPM déclenchait une analyse de ~2 min d'audio sur le fil principal. Secours synchrone automatique si le worker est indisponible.
- *EN: freeze a playlist's order from any column sort (Traktor-style); waveform + beatgrid analysis moved to a Web Worker so loading a track no longer freezes the UI (with a synchronous fallback).*

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
