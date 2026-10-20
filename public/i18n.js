/**
 * fadarr — traductions (FR / EN).
 *
 * Le texte source est le français : t('Texte français {var}', { var }) renvoie la traduction de la langue choisie
 * (ou le français s'il n'y en a pas encore). Pour ajouter une langue : copier le bloc « en » ci-dessous, traduire les
 * valeurs, et ajouter la langue à LANGS. Les textes fixes de la page (index.html) sont traduits au chargement par apply().
 *
 * fadarr — translations (FR / EN). The source text is French: t('French text {var}', { var }) returns the translation
 * for the selected language (French when missing). To add a language: copy the "en" block, translate the values and add
 * the language to LANGS. Static page text (index.html) is translated on load by apply().
 */
(function () {
  'use strict';
  const LANGS = { fr: 'Français', en: 'English' };

  const DICT = {
    en: {
      // ---------- en-tête / header ----------
      'NAS…': 'NAS…',
      'NAS connecté': 'NAS connected',
      'NAS déconnecté': 'NAS disconnected',
      'NAS injoignable': 'NAS unreachable',
      'via Tailscale': 'via Tailscale',
      'réseau local': 'local network',
      'hors réseau': 'outside network',
      "Ouvrir ou fermer l'accès au NAS": 'Open or close access to the NAS',
      'Analyser le NAS': 'Scan NAS',
      'Relire la bibliothèque du NAS (seuls les fichiers nouveaux ou modifiés sont lus)': 'Rescan the NAS library (only new or changed files are read)',
      'Importer Traktor': 'Import Traktor',
      'Importer ta collection Traktor (collection.nml)': 'Import your Traktor collection (collection.nml)',
      'Exporter vers Rekordbox': 'Export to Rekordbox',
      'Réglages': 'Settings',
      'Skin': 'Skin',
      'Apparence du mixeur': 'Mixer look',
      'Onde': 'Wave',
      'Ajouté': 'Added',
      'Date d\'ajout': 'Date added',
      'Ajoutés': 'Added',
      'Filtrer par date d\'ajout': 'Filter by date added',
      'tous': 'all',
      '7 j': '7 d',
      '30 j': '30 d',
      '90 j': '90 d',
      '1 an': '1 yr',
      'Style de forme d\'onde': 'Waveform style',
      'Bandes': 'Bands',
      'Base': 'Base',
      'Analog': 'Analog',
      'Rotary': 'Rotary',
      'Langue': 'Language',
      '{n} morceaux': '{n} tracks',
      'analysé le {date}': 'scanned {date}',
      'jamais analysé': 'never scanned',
      'Lecture des tags : {done} / {total} (bibliothèque déjà utilisable)': 'Reading tags: {done} / {total} (library already usable)',
      'Liste des fichiers du NAS…': 'Listing NAS files…',
      'Analyse du NAS lancée.': 'NAS scan started.',
      'Le dossier musique répond ({dir}). Clic : déconnecter (les morceaux déjà chargés restent jouables).': 'The music folder responds ({dir}). Click: disconnect (tracks already loaded stay playable).',
      'Le dossier musique ne répond pas ({dir}). Clic : déconnecter (les morceaux déjà chargés restent jouables).': 'The music folder does not respond ({dir}). Click: disconnect (tracks already loaded stay playable).',
      "Accès au NAS fermé : la bibliothèque et les playlists restent consultables, l'écoute est coupée. Clic : reconnecter.": 'NAS access closed: library and playlists remain browsable, playback is off. Click: reconnect.',

      // ---------- decks ----------
      'Glisse un morceau ici': 'Drop a track here',
      'Chargement…': 'Loading…',
      'Décodage…': 'Decoding…',
      'Analyse…': 'Analyzing…',
      'Deck {id} : {msg}': 'Deck {id}: {msg}',
      "CUE : à l'arrêt, pose le point de départ ; en lecture, y revient": 'CUE: when stopped, sets the start point; while playing, jumps back to it',
      'Lecture / pause': 'Play / pause',
      'Tempo (double-clic : 0)': 'Tempo (double-click: 0)',
      'Plage du tempo': 'Tempo range',
      "Caler le tempo sur l'autre deck": 'Match tempo to the other deck',
      "Phase par rapport à l'autre deck (au centre : temps calés)": 'Phase against the other deck (centered: beats aligned)',
      'Loop de 4 temps (selon le BPM)': '4-beat loop (from BPM)',
      'Loop de 8 temps': '8-beat loop',
      'Activer / quitter la loop': 'Enable / exit loop',
      'Enregistrer la loop (memory loop Rekordbox)': 'Save loop (Rekordbox memory loop)',
      'Enregistrer un memory cue à la position actuelle': 'Save a memory cue at the current position',
      'Quantize : cues et loops calés sur la grille de tempo': 'Quantize: cues and loops snap to the beat grid',
      "Pose d'abord le début de la loop (IN).": 'Set the loop start first (IN).',
      'BPM inconnu pour ce morceau : pose la loop avec IN / OUT.': 'Unknown BPM for this track: set the loop with IN / OUT.',
      'Aucune loop à enregistrer.': 'No loop to save.',
      'Cues non enregistrés : {msg}': 'Cues not saved: {msg}',
      'Hot cue {pad} à {time}': 'Hot cue {pad} at {time}',
      'Hot loop {pad} à {time}': 'Hot loop {pad} at {time}',
      ' — Maj+clic ou clic droit : effacer': ' — Shift+click or right-click: delete',
      'Hot cue {pad} : clic pour poser (pendant une loop : hot loop)': 'Hot cue {pad}: click to set (during a loop: hot loop)',
      'Supprimer': 'Delete',
      'Clic : y aller — double-clic : renommer': 'Click: jump — double-click: rename',
      'Nom du repère (visible dans Rekordbox) :': 'Marker name (shown in Rekordbox):',
      "BPM inconnu sur l'un des deux decks.": 'Unknown BPM on one of the decks.',
      'Deck {id} : pas de BPM.': 'Deck {id}: no BPM.',

      // ---------- mixeur / mixer ----------
      'MIXER': 'MIXER',
      'Gain': 'Gain', 'Aigu': 'High', 'Médium': 'Mid', 'Grave': 'Low', 'Filtre': 'Filter', 'Master': 'Master',
      'Ch A': 'Ch A', 'Ch B': 'Ch B',
      'Gain (glisser, molette ; double-clic : remise à zéro)': 'Gain (drag, wheel; double-click: reset)',
      'Aigu (glisser, molette ; double-clic : remise à zéro)': 'High (drag, wheel; double-click: reset)',
      'Médium (glisser, molette ; double-clic : remise à zéro)': 'Mid (drag, wheel; double-click: reset)',
      'Grave (glisser, molette ; double-clic : remise à zéro)': 'Low (drag, wheel; double-click: reset)',
      'Filtre (glisser, molette ; double-clic : remise à zéro)': 'Filter (drag, wheel; double-click: reset)',
      'Master (glisser, molette ; double-clic : 80 %)': 'Master (drag, wheel; double-click: 80 %)',
      'Volume de la voie A (double-clic : 100 %)': 'Channel A volume (double-click: 100 %)',
      'Volume de la voie B (double-clic : 100 %)': 'Channel B volume (double-click: 100 %)',
      'Volume de la voie A (glisser, molette ; double-clic : 100 %)': 'Channel A volume (drag, wheel; double-click: 100 %)',
      'Volume de la voie B (glisser, molette ; double-clic : 100 %)': 'Channel B volume (drag, wheel; double-click: 100 %)',
      'Crossfader (double-clic : centre)': 'Crossfader (double-click: center)',

      // ---------- bibliothèque / library ----------
      'Bibliothèque': 'Library',
      'Mes playlists': 'My playlists',
      'Traktor': 'Traktor',
      'Tout': 'All',
      'Tout replier': 'Collapse all',
      'Nouvelle playlist': 'New playlist',
      'Ajouts récents (30 j)': 'Recently added (30 d)',
      'Ajouts récents (30 jours)': 'Recently added (30 days)',
      'Toute la bibliothèque': 'Whole library',
      'Aucune playlist : ＋ pour en créer une': 'No playlist yet: ＋ to create one',
      'Importe ta collection.nml': 'Import your collection.nml',
      'Rechercher (artiste, titre, album, dossier…)': 'Search (artist, title, album, folder…)',
      'Ajouter à': 'Add to',
      "N'afficher que les morceaux dans cette plage de BPM": 'Only show tracks within this BPM range',
      'Autour du BPM du deck A (±3 %)': 'Around deck A BPM (±3 %)',
      'Autour du BPM du deck B (±3 %)': 'Around deck B BPM (±3 %)',
      'Toute la plage': 'Full range',
      'Artiste': 'Artist', 'Titre': 'Title', 'Ton.': 'Key', 'Durée': 'Time', 'Format': 'Format', 'Cues': 'Cues',
      'Camelot': 'Camelot', 'Open Key': 'Open Key',
      'Clic : trier — Maj+clic : notation (musicale / Camelot / Open Key)': 'Click: sort — Shift+click: notation (musical / Camelot / Open Key)',
      'absent du NAS': 'not on NAS',
      'Pré-écoute (sans charger de deck)': 'Preview (without loading a deck)',
      'Pré-écoute impossible : {msg}': 'Preview failed: {msg}',
      'Retirer de la playlist': 'Remove from playlist',
      'Ajouter à la playlist choisie (« Ajouter à »)': 'Add to the selected playlist (“Add to”)',
      "Choisis d'abord une playlist dans « Ajouter à » (ou glisse le morceau sur une playlist à gauche).": 'First pick a playlist in “Add to” (or drag the track onto a playlist on the left).',
      'Aucun morceau dans cette plage de BPM.': 'No track in this BPM range.',
      'Playlist vide : glisse des morceaux dessus depuis la bibliothèque.': 'Empty playlist: drag tracks onto it from the library.',
      'Aucun morceau ne correspond.': 'No matching track.',
      'Bibliothèque vide : clique sur « Analyser le NAS ».': 'Empty library: click “Scan NAS”.',
      'Ajouté à « {name} »': 'Added to “{name}”',
      'Traktor · {name}': 'Traktor · {name}',
      'Copier dans mes playlists': 'Copy to my playlists',
      'Copie créée : {name}': 'Copy created: {name}',
      'Renommer': 'Rename',
      'Nouveau nom :': 'New name:',
      'Supprimer la playlist « {name} » ? (les morceaux ne sont pas touchés)': 'Delete playlist “{name}”? (tracks are not touched)',
      'Nom de la nouvelle playlist :': 'New playlist name:',

      // ---------- fenêtres / dialogs ----------
      'Annuler': 'Cancel',
      'Enregistrer': 'Save',
      'Réglages enregistrés.': 'Settings saved.',
      'Chemin du dossier musique sur ton Mac (pour Rekordbox)': 'Music folder path on your Mac (for Rekordbox)',
      "Le dossier qui correspond au dossier musique du NAS quand il est monté sur le Mac (Finder > Aller > Se connecter au serveur), ou ton SSD s'il a la même arborescence. Les morceaux du rekordbox.xml pointeront là.": 'The folder matching the NAS music folder when mounted on the Mac (Finder > Go > Connect to Server), or your SSD if it has the same layout. Tracks in rekordbox.xml will point there.',
      'Décalage des cues pour les MP3 (ms)': 'MP3 cue offset (ms)',
      "Traktor et Rekordbox ne comptent pas le début d'un MP3 tout à fait pareil. Laisse 0 tant qu'on n'a pas calibré sur tes morceaux. Les WAV et AIFF ne sont pas concernés.": "Traktor and Rekordbox don't count the start of an MP3 exactly the same way. Keep 0 until calibrated on your tracks. WAV and AIFF are not affected.",
      'Import de {file}…': 'Importing {file}…',
      'Import Traktor terminé': 'Traktor import done',
      '{matched} morceaux sur {entries} retrouvés sur le NAS': '{matched} of {entries} tracks found on the NAS',
      '{n} playlists ({entries} entrées)': '{n} playlists ({entries} entries)',
      '{n} absentes du NAS': '{n} not on NAS',
      '{n} cues et loops importés': '{n} cues and loops imported',
      '{n} morceaux gardés tels que modifiés dans fadarr': '{n} tracks kept as edited in fadarr',
      '{n} morceaux de la collection Traktor introuvables sur le NAS': '{n} Traktor collection tracks not found on the NAS',
      '({n} premiers)': '(first {n})',
      'Tous les morceaux ont été retrouvés.': 'All tracks were found.',
      'Import impossible : {msg}': 'Import failed: {msg}',
      'Aucune playlist à exporter.': 'No playlist to export.',
      'Chemin du dossier musique sur ton Mac': 'Music folder path on your Mac',
      'Playlists à exporter :': 'Playlists to export:',
      "Dans Rekordbox : Préférences > Avancé > Base de données > « rekordbox xml » : choisis le fichier téléchargé. Puis dans l'arborescence, « rekordbox xml » > clic droit sur la playlist > Importer la playlist. Les cues et loops suivent.": 'In Rekordbox: Preferences > Advanced > Database > “rekordbox xml”: choose the downloaded file. Then in the tree, “rekordbox xml” > right-click the playlist > Import Playlist. Cues and loops come along.',
      'Télécharger rekordbox.xml': 'Download rekordbox.xml',
      'Coche au moins une playlist.': 'Tick at least one playlist.',
      'rekordbox.xml : {n} morceaux': 'rekordbox.xml: {n} tracks',
      '{n} absents du NAS ignorés': '{n} missing from NAS skipped',
      // ---------- import Rekordbox + choix d'export ----------
      'Importer Rekordbox': 'Import Rekordbox',
      'Importer une collection Rekordbox (rekordbox.xml)': 'Import a Rekordbox collection (rekordbox.xml)',
      'Importe un rekordbox.xml': 'Import a rekordbox.xml',
      'Import Rekordbox terminé': 'Rekordbox import done',
      '{src} · {name}': '{src} · {name}',
      '{n} morceaux de la collection Rekordbox introuvables sur le NAS': '{n} tracks from the Rekordbox collection not found on the NAS',
      'Exporter': 'Export',
      'Format :': 'Format:',
      'Rekordbox XML (platines via Rekordbox)': 'Rekordbox XML (players via Rekordbox)',
      'Clé USB directe pour CDJ (bientôt)': 'Direct USB stick for CDJ (soon)',
      'Bientôt : écriture directe de la clé USB, sans passer par Rekordbox.': 'Soon: write the USB stick directly, without going through Rekordbox.',
      // ---------- catégories de playlists (glisser-déposer) ----------
      '＋ Catégorie…': '＋ Category…',
      'Rangée dans « {name} »': 'Moved to “{name}”',
      'Sortie de sa catégorie': 'Removed from its category',
      'Nom de la nouvelle catégorie :': 'New category name:',
      'Clic : noter': 'Click to rate',
      'Clic : couleur': 'Click to set color',
      'Figer cet ordre': 'Freeze this order',
      'Enregistre l’ordre d’affichage actuel (tri) comme ordre de la playlist': 'Save the current display order (sort) as the playlist order',
      'Enlève d’abord la recherche et les filtres : l’ordre se fige sur tous les morceaux.': 'Clear the search and filters first: the order is frozen over all tracks.',
      'Ordre de la playlist enregistré.': 'Playlist order saved.',
      'Aucune couleur': 'No color',
      'Charger dans A': 'Load in A',
      'Charger dans B': 'Load in B',
      'Rouge': 'Red', 'Orange': 'Orange', 'Jaune': 'Yellow', 'Vert': 'Green', 'Bleu': 'Blue', 'Violet': 'Purple', 'Rose': 'Pink',
      'Nouvelle playlist ici': 'New playlist here',
      'Renommer la catégorie': 'Rename category',
      'Dissoudre la catégorie': 'Dissolve category',
      'Ouvrir': 'Open',
      'Dupliquer': 'Duplicate',
      'Nouvelle catégorie…': 'New category…',
      'Sortir de la catégorie': 'Remove from category',
      'Nom de la playlist :': 'Playlist name:',
      'Nouveau nom de la catégorie :': 'New category name:',
      'Dissoudre la catégorie « {name} » ? Les playlists qu’elle contient reviennent à la racine (elles ne sont pas supprimées).': 'Dissolve the category “{name}”? Its playlists move back to the root (they are not deleted).',
      'Catégorie dissoute ({n} playlist(s)).': 'Category dissolved ({n} playlist(s)).',
      'Traktor (collection.nml, ré-importable)': 'Traktor (collection.nml, re-importable)',
      'Toutes tes playlists fadarr (avec leurs catégories) sont réécrites dans un collection.nml. Tes couleurs, notes, BPM, grille et cues repartent avec. Les morceaux venus de Traktor retrouvent leur place ; ceux ajoutés seulement dans fadarr sont ignorés (pas d’emplacement Mac).': 'All your fadarr playlists (with their categories) are written into a collection.nml. Your colors, ratings, BPM, grid and cues go with them. Tracks that came from Traktor find their place again; tracks added only in fadarr are skipped (no Mac location).',
      'Dans Traktor : clic droit sur « Playlists » > « Import… » > choisis le collection.nml. ⚠️ Ne remplace jamais ton collection.nml d’origine par celui-ci.': 'In Traktor: right-click “Playlists” > “Import…” > pick the collection.nml. ⚠️ Never replace your original collection.nml with this one.',
      'Télécharger collection.nml': 'Download collection.nml',
      'collection.nml téléchargé': 'collection.nml downloaded',
      '{p} playlist(s), {n} morceau(x) réécrits pour Traktor.': '{p} playlist(s), {n} track(s) written for Traktor.',
      '{n} morceaux ajoutés seulement dans fadarr ont été ignorés (Traktor ne connaît pas leur emplacement sur ton Mac).': '{n} tracks added only in fadarr were skipped (Traktor does not know their location on your Mac).',
      'Tous les morceaux ont pu être réécrits. ✔': 'All tracks could be written back. ✔',
      'Dans Traktor : clic droit sur « Playlists » (panneau de gauche) > « Import… » > choisis ce collection.nml. Tes catégories deviennent des dossiers Traktor. ⚠️ C’est un ajout : ne remplace pas ton collection.nml d’origine par ce fichier.': 'In Traktor: right-click “Playlists” (left panel) > “Import…” > pick this collection.nml. Your categories become Traktor folders. ⚠️ This is an addition: do not replace your original collection.nml with this file.',
      // ---------- grille / beatgrid ----------
      'Grille': 'Grid',
      'Tap tempo : clique en rythme': 'Tap tempo: click in time',
      'Caler le 1er temps sur la tête de lecture': 'Snap the first beat to the playhead',
      'BPM ÷2': 'BPM ÷2',
      'BPM ×2': 'BPM ×2',
      'Détecter automatiquement BPM et grille': 'Auto-detect BPM and grid',
      'Grille non enregistrée : {msg}': 'Grid not saved: {msg}',
      'Détection impossible sur ce morceau.': 'Could not detect a tempo on this track.',
      'Détecté : {bpm} BPM': 'Detected: {bpm} BPM',
      'Pose d\'abord un BPM (clic sur le BPM, Tap, ou Auto).': 'Set a BPM first (click the BPM, Tap, or Auto).',
      // ---------- BPM éditable, SYNC, repli ----------
      'BPM — clic pour régler': 'BPM — click to set',
      'BPM du morceau (Entrée pour valider, Échap pour annuler)': 'Track BPM (Enter to confirm, Esc to cancel)',
      'Charge un morceau pour régler son BPM.': 'Load a track to set its BPM.',
      'BPM non enregistré : {msg}': 'BPM not saved: {msg}',
      'Réduire les decks': 'Collapse the decks',
      'Afficher les decks': 'Show the decks',
      'Masquer le panneau': 'Hide the panel',
      'Afficher le panneau': 'Show the panel',
      // ---------- rapport d'export ----------
      'rekordbox.xml téléchargé': 'rekordbox.xml downloaded',
      '{n} morceaux exportés — {g} avec grille de tempo, {c} avec cues/loops.': '{n} tracks exported — {g} with a beat grid, {c} with cues/loops.',
      '{n} morceaux sans BPM : les CDJ ne poseront ni grille ni SYNC dessus. Charge-les dans fadarr et clique sur le BPM pour le poser.': '{n} tracks with no BPM: CDJs will show no grid and no SYNC for them. Load them in fadarr and click the BPM to set it.',
      "{n} morceaux ont un BPM mais pas de grille précise : la grille est posée au premier temps connu. Vérifie-les dans Rekordbox (double-clic sur la grille pour recaler si besoin).": '{n} tracks have a BPM but no precise grid: the grid is anchored on the first known beat. Check them in Rekordbox (double-click the grid to re-align if needed).',
      '{n} morceaux absents du NAS ont été ignorés.': '{n} tracks missing from the NAS were skipped.',
      'Tous les morceaux ont un BPM et une grille. ✔': 'Every track has a BPM and a grid. ✔',
      'Pour être sûr que ça passe sur les platines : 1) Rekordbox > Préférences > Avancé > rekordbox xml : choisis ce fichier ; 2) clic droit sur la playlist > Importer ; 3) vérifie que grille et cues apparaissent sur le morceau ; 4) branche ta clé USB, Rekordbox > Exporter vers le périphérique ; 5) relis la clé sur une CDJ (ou en mode Export). Garde le même rekordbox.xml et remplace-le à chaque export.': 'To be sure it plays on the players: 1) Rekordbox > Preferences > Advanced > rekordbox xml: pick this file; 2) right-click the playlist > Import; 3) check the grid and cues show on the track; 4) plug in your USB stick, Rekordbox > Export to device; 5) read the stick on a CDJ (or in Export mode). Keep the same rekordbox.xml and replace it on every export.',
      'Erreur {status}': 'Error {status}'
    }
  };

  let lang = 'fr';
  try { lang = localStorage.getItem('fadarr-lang') || ''; } catch (e) { /* rien */ }
  if (!LANGS[lang]) lang = /^fr\b/i.test(navigator.language || '') ? 'fr' : 'en';

  function t(fr, vars) {
    const table = DICT[lang];
    let s = (table && table[fr]) || fr;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
    return s;
  }

  /** Traduit les textes fixes d'une partie de la page (nœuds texte et attributs title / placeholder / aria-label). */
  function apply(root) {
    if (lang === 'fr' || !root) return;
    const table = DICT[lang];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const raw = n.nodeValue; const key = raw.trim();
      if (key && table[key]) n.nodeValue = raw.replace(key, table[key]);
    }
    const els = root.querySelectorAll ? root.querySelectorAll('[title],[placeholder],[aria-label]') : [];
    for (const el of els) for (const a of ['title', 'placeholder', 'aria-label']) {
      const v = el.getAttribute(a); if (v && table[v]) el.setAttribute(a, table[v]);
    }
  }

  function setLang(l) {
    if (!LANGS[l]) return;
    try { localStorage.setItem('fadarr-lang', l); } catch (e) { /* rien */ }
    location.reload();
  }

  document.documentElement.lang = lang;
  window.I18N = { t, apply, setLang, LANGS, get lang() { return lang; }, locale: lang === 'fr' ? 'fr-FR' : 'en-GB' };
})();
