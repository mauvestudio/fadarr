# Changelog

Toutes les versions notables de mixarr. Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/),
versions en [SemVer](https://semver.org/lang/fr/). / All notable changes; English summary under each entry.

## [0.5.0] — 2026-10-19
Inspiré de Mixxx (idées seulement ; Mixxx est GPL, mixarr reste MIT).
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

[0.5.0]: https://github.com/mauvestudio/mixarr/releases/tag/v0.5.0
[0.4.0]: https://github.com/mauvestudio/mixarr/releases/tag/v0.4.0
[0.3.0]: https://github.com/mauvestudio/mixarr/releases/tag/v0.3.0
[0.2.0]: https://github.com/mauvestudio/mixarr/releases/tag/v0.2.0
