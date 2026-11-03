# Changelog

Toutes les versions notables de fadarr. Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/),
versions en [SemVer](https://semver.org/lang/fr/). / All notable changes; English summary under each entry.

## [0.14.0] — 2026-11-04
### Ajouté
- **Sound Color FX façon table de club** (`public/colorfx.js`) : le potard filtre de chaque voie pilote l'effet choisi, commun aux deux voies
  (à gauche graves / passe-bas, à droite aigus / passe-haut, neutre au centre), avec un potard PARAMETER :
  FILTER (résonant 24 dB/oct, PARAMETER = résonance), SPACE (réverbe filtrée), DUB ECHO (écho calé sur le tempo, qui s'éteint tout seul),
  CRUSH (réduction de bits et d'échantillonnage), SWEEP (gate rythmique à gauche, passe-bande qui balaie à droite), NOISE (bruit filtré).
  Réglages lissés (pas de craquement en tournant). Par défaut : FILTER, déjà plus « table de club » que l'ancien filtre.
- **Skin « Pionarr + Deckarr »** (menu Skin) : deux platines Deckarr DKR-3000 (façon CDJ-3000) de part et d'autre de la table
  Pionarr PNR-A2 (façon DJM, 2 voies). Façades 100 % vectorielles, sans logo ni police de marque (`tools/skins/*.js`).
  Tout est branché sur le même moteur : TRIM, EQ, COLOR + Sound Color FX (SPACE, DUB ECHO, CRUSH, SWEEP, NOISE, FILTER) et
  PARAMETER, faders, crossfader, MASTER, vu-mètres ; sur les platines : PLAY / CUE, 8 hot cues, IN / OUT / RELOOP, BEAT LOOP 4 / 8,
  BEAT JUMP, SEARCH, MEMORY et CALL, BEAT SYNC, fader de tempo et sa plage, TIME MODE, jog (scratch à l'arrêt, pitch bend en lecture).
  Le **sélecteur** à droite de l'écran fait défiler la bibliothèque, un appui charge le morceau ; les écrans affichent les vraies
  formes d'onde, le temps, le tempo, le BPM et la tonalité. Changer de skin ne coupe pas la lecture.

## [0.13.0] — 2026-11-03
### Ajouté
- **Clés et disques, joués en direct** (panneau de gauche, comme les appareils de Rekordbox) : ＋ Brancher une clé / un disque.
  Plusieurs appareils à la fois (ta clé et celle d'un ami pour une jam, un SSD…), chacun avec ⏏ pour l'éjecter.
  - **Clé préparée pour CDJ** (Rekordbox ou fadarr) : ses playlists et dossiers, et tous ses morceaux, joués depuis la clé avec
    leurs hot cues, memory cues, loops, grille, tonalité, couleur et note ; MP3 recalés selon leur encodeur ; rien n'est écrit sur la clé.
  - **Autre dossier** (disque dur, SSD) : ses sous-dossiers, comme l'ancien « Dossier local ».
  Les changements faits dans fadarr (cues, grille, note) sont gardés dans le navigateur. Fonctionne en http comme en https.
### Modifié
- Section « Collection » renommée **NAS** (source par défaut), « Dossier local » devient **Clés et disques**.
- Bouton **Source ▾** en haut : NAS (par défaut), Clé USB…, Disque dur…, les appareils branchés (✓ celui affiché) et ⏏ pour les éjecter ; rien n'est copié.
- **Importer ▾** réunit les imports Traktor et Rekordbox (l'import d'une clé vers le NAS n'est plus proposé : une clé se joue en direct).
- *EN: play USB sticks and drives directly (Rekordbox-style devices panel, several at once, CDJ sticks with their playlists, cues and grids); "Source ▾" menu (NAS, stick, drive), "Import ▾" menu for Traktor / Rekordbox.*

## [0.12.1] — 2026-11-03
### Ajouté
- **Grille de mesure façon Rekordbox** sur la forme d'onde : graduations en haut et en bas à chaque temps, longues et rouges sur
  le 1er temps de chaque mesure, numéro de mesure toutes les 4 mesures ; sur la vue d'ensemble, un trait toutes les 16 mesures.
### Corrigé
- Un morceau qui n'avait qu'un BPM (tags) sans début de grille n'affichait aucune grille : le début de grille est maintenant
  détecté au chargement (analyse du serveur, ou du navigateur en secours), en gardant le BPM des tags s'il colle (±2 %).
- *EN: Rekordbox-style bar grid on the waveforms (beat ticks, red downbeats, bar numbers, phrase marks on the overview); tracks with a BPM but no grid start now get one.*

## [0.12.0] — 2026-11-03
### Ajouté
- **Importer une clé USB** (bouton en haut) : fadarr lit une clé préparée pour CDJ, par Rekordbox ou par lui-même (`public/usbread.js`),
  directement depuis le navigateur (Chrome / Edge, https ou localhost, lecture seule) : playlists et dossiers, hot cues, memory cues
  et loops (couleurs, noms), grille, tonalité, couleur et note des morceaux. Les morceaux sont retrouvés sur le NAS comme pour
  l'import XML ; les playlists arrivent dans Rekordbox › Clé <nom>. Testé sur une vraie clé : 399 morceaux, 26 playlists,
  593 cues lus en 15 s ; l'aller-retour clé → fadarr → clé redonne les mêmes grilles et cues à la milliseconde.
- **Décalage MP3 automatique, fichier par fichier** (`src/mp3offset.js`), à l'import comme à l'export (clé USB et rekordbox.xml) :
  mesuré sur 375 morceaux d'une vraie clé (grilles Rekordbox contre l'analyse de fadarr, AIFF/WAV comme témoins) : MP3 LAME
  avec en-tête gapless 50 ms, autres encodeurs (ffmpeg) 25 ms, sans en-tête 0. Même constat que Mixxx. Le réglage « décalage MP3 »
  devient une correction supplémentaire (0 par défaut).
- **Cache** dans les Réglages : taille (formes d'onde, fichiers préparés pour la clé), bouton Vider, taille maximale (2 Go par défaut) ;
  ménage automatique au démarrage et après chaque export de clé.
### Amélioré
- **Grille sur la grosse caisse** : l'analyse vérifie l'énergie des graves sur le temps et le contretemps ; sur la clé de test, les
  grilles justes passent de 67 % à 87 % (le détecteur de Mixxx accroche souvent les charlestons). Les morceaux déjà analysés seront
  ré-analysés (version 2).
- Import : quand plusieurs entrées visent le même fichier (MP3 et AIFF d'un même morceau sur une clé), la grille et les cues viennent
  de celle dont le nom de fichier correspond.
- *EN: import a CDJ USB stick (playlists, cues, grid, colours, ratings); automatic per-file MP3 offset (LAME 50 ms, other encoders 25 ms,
  measured on a real stick); cache size, clear and limit in Settings; kick-phase check in the beat grid (67 % → 87 % correct grids).*

## [0.11.0] — 2026-11-03
### Ajouté
- **Analyse audio avec les algorithmes de Mixxx** (`analyzer/`, qm-dsp, GPL-2.0-or-later) :
  - BPM et grille à tempo constant (détection qm-dsp, puis régions constantes et arrondi du BPM de Mixxx) ;
  - tonalité (qm-dsp, tonalité la plus longue du morceau) ;
  - volume moyen et crête (EBU R128, filtre ebur128 de ffmpeg, dans le même décodage) ;
  - premier et dernier son (-60 dB) : sans memory cue, le deck se cale sur le début de la musique.
  Bouton **Analyser** dans la barre de la liste (Maj+clic : tout recalculer), file d'attente côté serveur (2 analyses à la fois,
  `FADARR_ANALYSIS_JOBS`), progression dans la barre d'état ; un morceau chargé dans un deck est analysé tout de suite
  (sinon détection rapide dans le navigateur, comme avant). Ne remplit que ce qui manque : une grille importée ou posée
  à la main n'est jamais remplacée ; la tonalité n'est ajoutée qu'aux morceaux qui n'en ont pas. Les grilles détectées
  partent aussi sur la clé USB.
- Colonne **LUFS** (triable) dans la liste.
- **Volume harmonisé** (Réglages, activé par défaut, niveau visé -9 LUFS) : decks et pré-écoute, au plus +6 dB, sans pousser la crête au-delà de 0 dBFS.
### Modifié
- L'image Docker compile l'analyseur (étape à part, binaire statique). En local : `npm run build:analyzer`.
- *EN: server-side audio analysis with Mixxx's algorithms (BPM and constant beat grid, key, EBU R128 loudness, first sound), "Analyse" button, LUFS column, loudness matching.*

## [0.10.0] — 2026-11-03
### Ajouté
- **Clé USB pour CDJ, sans Rekordbox (expérimental)** — Exporter › « Clé USB pour CDJ » : fadarr écrit lui-même la clé, lisible par les CDJ-2000NXS2 (priorité), CDJ-3000 et XDJ :
  - musique dans `Contents/<Artiste>/<Album>/`, noms compatibles FAT32 ;
  - base des platines `PIONEER/rekordbox/export.pdb` (morceaux, artistes, albums, genres, tonalités, couleurs, notes, playlists et dossiers) ;
  - analyses `ANLZ0000.DAT/.EXT/.2EX` : grille de tempo, hot cues et memory cues (couleurs, noms, loops), formes d'onde (aperçu, détail, couleurs NXS2 et 3 bandes CDJ-3000) ;
  - **synchro intelligente** : manifeste sur la clé (`PIONEER/fadarr/manifest.json`) ; seuls les fichiers changés sont réécrits, ceux que fadarr avait mis et qui ne sont plus choisis sont retirés, chaque fichier écrit est vérifié ;
  - analyse audio en cache sur le serveur ; identifiants de morceaux stables d'un export à l'autre.
  Le serveur prépare, le navigateur écrit sur la clé branchée sur l'ordinateur : Chrome / Edge en https (ex. `tailscale serve`) ou en localhost. Clé en FAT32 obligatoire pour la NXS2.
  Testé octet par octet contre les écrivains de rbxport ; **pas encore testé sur une vraie platine** : à vérifier avant un set.
### Licence
- **fadarr passe en GPL-2.0-ou-ultérieure** : l'export USB est un portage en JavaScript d'une partie de [rbxport](https://github.com/chrisle/rbxport) (GPL-2.0-or-later, © Chris Le et contributeurs). Voir `NOTICE.md`. Les versions jusqu'à la 0.9.1 restent sous MIT.
### Modifié
- Le bouton « Exporter vers Rekordbox » devient « Exporter » (Rekordbox XML, Traktor ou clé USB).
- *EN: experimental direct USB export for CDJs (CDJ-2000NXS2 first, CDJ-3000, XDJ): audio, export.pdb, ANLZ grid/cues/waveforms, smart sync with a manifest and verification; byte-identical to rbxport's writers in tests, not yet tested on hardware. fadarr is now GPL-2.0-or-later (USB export ported from rbxport).*

## [0.9.1] — 2026-11-03
### Sécurité
- **Dépendances à jour, 0 faille connue** (`npm audit`) : `music-metadata` 7 → 12 (corrige plusieurs failles de lecture de fichiers piégés : boucles infinies et allocations mémoire démesurées sur des tags ASF / MP4 / APE / ID3 / DSF malformés — utile quand la bibliothèque contient des fichiers venus d'inconnus, ex. Soulseek), `body-parser` (déni de service sur un corps compressé).
- Image Docker passée à **Node 22** (requis par music-metadata 12).
### Corrigé
- Fichiers sans tags : le numéro de piste en tête du nom (« 01. Artiste - Titre ») n'est plus pris pour l'artiste.
- *EN: dependencies updated, 0 known vulnerabilities (music-metadata 12 fixes crafted-file DoS issues; body-parser DoS); Docker image on Node 22; track-number prefix stripped from untagged file names.*

## [0.9.0] — 2026-11-03
### Ajouté
- **Dossier local** (en plus du NAS) : section « Dossier local » dans l'arbre, bouton ＋ pour ouvrir un dossier de l'ordinateur sur lequel tu es. Les morceaux sont lus directement dans le navigateur (rien n'est envoyé au serveur), avec sous-dossiers, recherche, decks, pré-écoute, détection de BPM / grille, cues, note et couleur — gardés dans ce navigateur. AIFF lu aussi dans Chrome (converti à la volée en WAV, sans perte). Les morceaux locaux ne vont pas dans les playlists (elles pointent vers le NAS).
### Corrigé
- Fader de tempo : la valeur ne passe plus à la ligne (decks de même hauteur). Compteur de cues mis à jour dans la bonne colonne. « 1er temps » traduit en anglais.
### Documentation
- README / LISEZMOI à jour (interface façon Traktor, favoris, dossier local) et nouvelle capture d'écran.
- *EN: local folder support (open a folder from this computer; tracks are read in the browser, nothing uploaded; AIFF decoded in Chrome too; cues/BPM/rating/colour kept in the browser); tempo-fader overflow fix; updated README and screenshot.*

## [0.8.1] — 2026-10-25
### Corrigé
- **Vue d'ensemble de la forme d'onde en couleurs** (elle tirait sur le violet) : la couleur suit maintenant l'énergie moyenne de chaque bande par passage, comparée au reste du morceau. Les passages riches en graves virent à l'orange / rouge, les breaks au vert / jaune, les passages brillants au bleu / blanc ; les couleurs sont lissées par plages, comme la vue d'ensemble de Traktor.
- *EN: colored waveform overview (no more purple): color follows each band's average energy per section relative to the track, smoothed into Traktor-like color zones.*

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

[0.14.0]: https://github.com/mauvestudio/fadarr/releases/tag/v0.14.0
[0.13.0]: https://github.com/mauvestudio/fadarr/releases/tag/v0.13.0
[0.12.1]: https://github.com/mauvestudio/fadarr/releases/tag/v0.12.1
[0.12.0]: https://github.com/mauvestudio/fadarr/releases/tag/v0.12.0
[0.11.0]: https://github.com/mauvestudio/fadarr/releases/tag/v0.11.0
[0.10.0]: https://github.com/mauvestudio/fadarr/releases/tag/v0.10.0
[0.9.1]: https://github.com/mauvestudio/fadarr/releases/tag/v0.9.1
[0.9.0]: https://github.com/mauvestudio/fadarr/releases/tag/v0.9.0
[0.8.1]: https://github.com/mauvestudio/fadarr/releases/tag/v0.8.1
[0.8.0]: https://github.com/mauvestudio/fadarr/releases/tag/v0.8.0
[0.5.0]: https://github.com/mauvestudio/fadarr/releases/tag/v0.5.0
[0.4.0]: https://github.com/mauvestudio/fadarr/releases/tag/v0.4.0
[0.3.0]: https://github.com/mauvestudio/fadarr/releases/tag/v0.3.0
[0.2.0]: https://github.com/mauvestudio/fadarr/releases/tag/v0.2.0
