/**
 * Import de la collection Traktor (collection.nml).
 *
 * Le NML décrit chaque morceau (ENTRY) avec son emplacement sur le Mac (LOCATION : VOLUME + DIR + FILE, DIR écrit « /:Users/:… /: »),
 * son BPM (TEMPO), sa tonalité, ses cues (CUE_V2 : START et LEN en millisecondes, HOTCUE -1 ou 0-7, TYPE 0 cue, 1 fade-in,
 * 2 fade-out, 3 load, 4 grille, 5 loop), puis les playlists (PLAYLISTS > NODE …, chaque morceau désigné par sa clé
 * « VOLUME/:Users/:…/:fichier.mp3 »).
 *
 * Les chemins du Mac ne valent rien sur le NAS : chaque morceau est retrouvé dans la bibliothèque par son nom de fichier
 * (puis par les dossiers qui l'entourent, puis par artiste + titre). Les introuvables sont listés dans le rapport.
 */
const path = require('path');
const { XMLParser } = require('fast-xml-parser');
const library = require('./library');
const store = require('./store');

const arr = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** « /:Users/:me/:Music/: » + « a.mp3 » -> [ 'Users', 'me', 'Music', 'a.mp3' ] */
function locationParts(loc) {
  const dir = String(loc?.['@_DIR'] || '').split('/:').filter(Boolean);
  return [...dir, String(loc?.['@_FILE'] || '')].filter(Boolean);
}

function primaryKey(loc) {
  return `${loc?.['@_VOLUME'] || ''}${loc?.['@_DIR'] || ''}${loc?.['@_FILE'] || ''}`;
}

// ---------------------------------------------------------------------------
// Correspondance avec les fichiers du NAS
// ---------------------------------------------------------------------------

function buildMatcher() {
  const byName = new Map();      // nom de fichier (minuscules) -> [rel]
  const byNormName = new Map();  // nom de fichier normalisé (sans accents ni ponctuation) -> [rel]
  const byArtistTitle = new Map();
  for (const rel of library.allPaths()) {
    const base = path.basename(rel);
    const push = (m, k) => { if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(rel); };
    push(byName, base.toLowerCase());
    push(byNormName, norm(base.replace(/\.[^.]+$/, '')));
    const e = library.entry(rel);
    if (e?.artist && e?.title) push(byArtistTitle, `${norm(e.artist)}|${norm(e.title)}`);
  }

  /** Parmi plusieurs fichiers du même nom : celui dont les dossiers ressemblent le plus à ceux du Mac. */
  const bestBySuffix = (cands, parts) => {
    if (cands.length === 1) return cands[0];
    const dirs = parts.slice(0, -1).map((d) => d.toLowerCase());
    let best = null; let bestScore = -1;
    for (const c of cands) {
      const cd = c.split('/').slice(0, -1).map((d) => d.toLowerCase());
      let score = 0;
      for (let i = 1; i <= Math.min(dirs.length, cd.length); i++) { if (dirs[dirs.length - i] === cd[cd.length - i]) score++; else break; }
      if (score > bestScore) { best = c; bestScore = score; }
    }
    return best;
  };

  return (parts, artist, title) => {
    const file = parts[parts.length - 1] || '';
    let c = byName.get(file.toLowerCase());
    if (c?.length) return { rel: bestBySuffix(c, parts), how: 'nom' };
    c = byNormName.get(norm(file.replace(/\.[^.]+$/, '')));
    if (c?.length) return { rel: bestBySuffix(c, parts), how: 'nom approchant' };
    if (artist && title) {
      c = byArtistTitle.get(`${norm(artist)}|${norm(title)}`);
      if (c?.length) return { rel: bestBySuffix(c, parts), how: 'artiste + titre' };
    }
    return null;
  };
}

// ---------------------------------------------------------------------------
// Lecture du NML
// ---------------------------------------------------------------------------

/** Cues Traktor -> cues fadarr (+ début de grille, en secondes). */
function convertCues(cueList) {
  const cues = [];
  let gridStart = null;
  for (const c of arr(cueList)) {
    const type = Number(c['@_TYPE']);
    const start = Number(c['@_START']) / 1000;
    const len = Number(c['@_LEN']) / 1000;
    const hot = Number(c['@_HOTCUE']);
    const name = String(c['@_NAME'] ?? '').replace(/^n\.n\.$/, ''); // « n.n. » = sans nom chez Traktor
    if (!Number.isFinite(start)) continue;
    const num = hot >= 0 && hot <= 7 ? hot : -1;
    if (type === 4) { // marqueur de grille (« AutoGrid ») : début de la grille ; s'il occupe un pad dans Traktor, il devient un hot cue « Grid »
      if (gridStart === null || start < gridStart) gridStart = start;
      if (num >= 0) cues.push({ kind: 'hot', num, start, name: name && name !== 'AutoGrid' ? name : 'Grid' });
      continue;
    }
    if (type === 5 && len > 0) cues.push({ kind: 'loop', num, start, end: start + len, name });
    else cues.push({ kind: num >= 0 ? 'hot' : 'memory', num, start, name: name || ({ 1: 'Fade in', 2: 'Fade out', 3: 'Load' }[type] || '') });
  }
  return { cues: store.cleanCues(cues), gridStart };
}

/** Tonalité Traktor (MUSICAL_KEY 0-11 majeur de Do à Si, 12-23 mineur) -> notation musicale comprise par Rekordbox (« Am », « F#m », « Eb »). */
const NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const KEYS = [...NOTES, ...NOTES.map((k) => `${k}m`)];

/** Pastilles de couleur Traktor (INFO COLOR 1-7) -> hex, reprises à l'identique dans fadarr et au ré-export. */
const TRAKTOR_COLORS = { 1: '#f5425a', 2: '#f58a42', 3: '#f5d142', 4: '#4caf50', 5: '#42a5f5', 6: '#7e57c2', 7: '#ec407a' };
/** hex -> index Traktor le plus proche (pour ré-exporter la couleur). */
function colorToTraktor(hex) {
  const h = String(hex || '').toLowerCase();
  for (const k of Object.keys(TRAKTOR_COLORS)) if (TRAKTOR_COLORS[k] === h) return Number(k);
  return null;
}

function walkPlaylists(node, folderPath, out) {
  for (const n of arr(node)) {
    const type = n['@_TYPE'];
    const name = String(n['@_NAME'] || '');
    if (type === 'FOLDER') {
      const sub = arr(n.SUBNODES?.NODE);
      const next = name === '$ROOT' ? folderPath : [...folderPath, name];
      walkPlaylists(sub, next, out);
    } else if (type === 'PLAYLIST') {
      if (name.startsWith('_')) continue; // _LOOPS, _RECORDINGS… : listes internes de Traktor
      const keys = arr(n.PLAYLIST?.ENTRY).map((e) => e.PRIMARYKEY?.['@_KEY']).filter(Boolean);
      out.push({ name, folder: folderPath.join(' / '), keys });
    }
  }
  return out;
}

/**
 * Importe un collection.nml : met à jour les cues / BPM des morceaux retrouvés (sauf ceux déjà modifiés dans fadarr)
 * et remplace les playlists « Traktor » de fadarr.
 * @returns rapport { entries, matched, unmatched: [{artist,title,file}], playlists, playlistTracks, playlistMissing, cuesImported }
 */
function importNml(xml) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, allowBooleanAttributes: true });
  const doc = parser.parse(xml);
  const nml = doc.NML;
  if (!nml) throw new Error('Ce fichier n\'est pas un collection.nml de Traktor (balise NML absente).');

  const match = buildMatcher();
  const keyToRel = new Map();
  const unmatched = [];
  let matched = 0;
  let cuesImported = 0;
  let kept = 0;

  const entries = arr(nml.COLLECTION?.ENTRY);
  for (const e of entries) {
    const loc = e.LOCATION;
    if (!loc) continue;
    const parts = locationParts(loc);
    const artist = String(e['@_ARTIST'] || '');
    const title = String(e['@_TITLE'] || '');
    const found = match(parts, artist, title);
    if (!found) { unmatched.push({ artist, title, file: parts.join('/') }); continue; }
    matched++;
    keyToRel.set(primaryKey(loc), found.rel);

    const { cues, gridStart } = convertCues(e.CUE_V2);
    const bpm = Number(e.TEMPO?.['@_BPM']);
    const keyNum = Number(e.MUSICAL_KEY?.['@_VALUE']);
    const info = e.INFO || {};
    const colorIdx = Number(info['@_COLOR']);
    const current = store.trackInfo(found.rel);
    const patch = {
      traktor: true,
      // clé + emplacement Mac d'origine : conservés pour ré-écrire un collection.nml que Traktor reconnaîtra (export)
      traktorKey: primaryKey(loc),
      traktorLoc: { VOLUME: loc['@_VOLUME'] || '', VOLUMEID: loc['@_VOLUMEID'] || '', DIR: loc['@_DIR'] || '', FILE: loc['@_FILE'] || '' },
      bpm: Number.isFinite(bpm) && bpm > 0 ? Math.round(bpm * 100) / 100 : current?.bpm ?? null,
      gridStart: gridStart ?? current?.gridStart ?? null,
      key: Number.isInteger(keyNum) && KEYS[keyNum] ? KEYS[keyNum] : (current?.key || ''),
      color: (colorIdx >= 1 && colorIdx <= 7) ? TRAKTOR_COLORS[colorIdx] : (current?.color || ''),
      rating: Number(info['@_RANKING']) || current?.rating || 0,
      comment: String(info['@_COMMENT'] || current?.comment || '').slice(0, 300),
      // infos de la collection : affichées tant que les tags du fichier n'ont pas été lus (et en secours s'ils sont vides)
      meta: {
        title, artist,
        album: String(e.ALBUM?.['@_TITLE'] || ''),
        genre: String(info['@_GENRE'] || ''),
        duration: Number(info['@_PLAYTIME_FLOAT'] || info['@_PLAYTIME']) || null,
        bitrate: Number(info['@_BITRATE']) ? Math.round(Number(info['@_BITRATE']) / 1000) : null
      }
    };
    if (current?.edited) kept++;
    else { patch.cues = cues; cuesImported += cues.length; }
    store.updateTrack(found.rel, patch);
  }

  const pls = walkPlaylists(nml.PLAYLISTS?.NODE, [], []);
  let playlistTracks = 0;
  let playlistMissing = 0;
  const toSave = pls.map((p) => {
    const tracks = [];
    for (const k of p.keys) {
      const rel = keyToRel.get(k);
      if (rel) { tracks.push(rel); playlistTracks++; } else playlistMissing++;
    }
    return { name: p.name, folder: p.folder ? `Traktor / ${p.folder}` : 'Traktor', tracks };
  });
  store.replaceTraktorPlaylists(toSave);

  return {
    entries: entries.length,
    matched,
    unmatched: unmatched.slice(0, 2000),
    unmatchedCount: unmatched.length,
    playlists: toSave.length,
    playlistTracks,
    playlistMissing,
    cuesImported,
    keptEdited: kept
  };
}

module.exports = { importNml, TRAKTOR_COLORS, colorToTraktor, _internals: { convertCues, locationParts, walkPlaylists, KEYS, primaryKey } };
