/**
 * Import d'une collection Rekordbox (rekordbox.xml exporté depuis Rekordbox : Fichier > Exporter une collection en xml,
 * ou le fichier réglé dans Préférences > Avancé > Base de données > « rekordbox xml »).
 *
 * C'est le miroir de l'export (voir rekordbox.js) : <DJ_PLAYLISTS> <COLLECTION> un TRACK par morceau
 *   (Location « file://localhost/… », AverageBpm, Tonality, TEMPO = grille, POSITION_MARK = cues/loops),
 *   puis <PLAYLISTS> l'arborescence (NODE Type 0 = dossier, Type 1 = playlist, TRACK Key = TrackID).
 *
 * Les chemins Rekordbox (du Mac) ne valent rien sur le NAS : chaque morceau est retrouvé dans la bibliothèque par son
 * nom de fichier (accents et ponctuation tolérés), puis par artiste + titre. Les introuvables sont listés dans le rapport.
 * Un morceau déjà modifié dans fadarr n'est pas écrasé.
 */
const path = require('path');
const { XMLParser } = require('fast-xml-parser');
const library = require('./library');
const store = require('./store');
const mp3offset = require('./mp3offset');

const arr = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** « file://localhost/Volumes/music/Electronic/2026/A%20-%20B.mp3 » -> nom de fichier décodé « A - B.mp3 ». */
function fileFromLocation(loc) {
  let s = String(loc || '');
  s = s.replace(/^file:\/\/(localhost)?/i, '');
  try { s = decodeURIComponent(s); } catch (e) { /* laisse tel quel */ }
  return s.split('/').filter(Boolean).pop() || '';
}

function buildMatcher() {
  const byName = new Map();
  const byNormName = new Map();
  const byArtistTitle = new Map();
  const push = (m, k, rel) => { if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(rel); };
  for (const rel of library.allPaths()) {
    const base = path.basename(rel);
    push(byName, base.toLowerCase(), rel);
    push(byNormName, norm(base.replace(/\.[^.]+$/, '')), rel);
    const e = library.entry(rel);
    if (e && e.artist && e.title) push(byArtistTitle, `${norm(e.artist)}|${norm(e.title)}`, rel);
  }
  return (file, artist, title) => {
    let c = byName.get(String(file).toLowerCase());
    if (c && c.length) return { rel: c[0], how: 'nom' };
    c = byNormName.get(norm(String(file).replace(/\.[^.]+$/, '')));
    if (c && c.length) return { rel: c[0], how: 'nom approchant' };
    if (artist && title) { c = byArtistTitle.get(`${norm(artist)}|${norm(title)}`); if (c && c.length) return { rel: c[0], how: 'artiste + titre' }; }
    return null;
  };
}

const toHex = (m) => {
  const r = Number(m['@_Red']); const g = Number(m['@_Green']); const b = Number(m['@_Blue']);
  if (![r, g, b].every(Number.isFinite)) return '';
  return `#${[r, g, b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('')}`;
};

/** POSITION_MARK Rekordbox -> cues fadarr. Type 0 = cue, 4 = loop ; Num -1 = memory, 0-7 = hot (A-H). Start/End en secondes. */
function convertMarks(marks) {
  const cues = [];
  for (const m of arr(marks)) {
    const type = Number(m['@_Type']);
    const start = Number(m['@_Start']);
    const num = Number(m['@_Num']);
    const name = String(m['@_Name'] || '');
    if (!Number.isFinite(start)) continue;
    const n = Number.isFinite(num) && num >= 0 && num <= 7 ? num : -1;
    if (type === 4) { const end = Number(m['@_End']); if (Number.isFinite(end) && end > start) cues.push({ kind: 'loop', num: n, start, end, name, color: n >= 0 ? toHex(m) : '' }); }
    else cues.push({ kind: n >= 0 ? 'hot' : 'memory', num: n, start, name, color: n >= 0 ? toHex(m) : '' });
  }
  return store.cleanCues(cues);
}

function walkPlaylists(node, folderPath, out, trackName) {
  for (const n of arr(node)) {
    const type = Number(n['@_Type']);
    const name = String(n['@_Name'] || '');
    if (type === 0) { // dossier
      const next = name === 'ROOT' ? folderPath : [...folderPath, name];
      walkPlaylists(n.NODE, next, out, trackName);
    } else if (type === 1) { // playlist : les entrées désignent un TrackID (KeyType 0) ou un chemin (KeyType 1)
      const keys = arr(n.TRACK).map((e) => String(e['@_Key'] || '')).filter(Boolean);
      out.push({ name, folder: folderPath.join(' / '), keys });
    }
  }
  return out;
}

/**
 * Importe une collection Rekordbox déjà lue (rekordbox.xml ou clé USB) :
 *   tracks    : [{ id, file, artist, title, album, genre, duration, bitrate, bpm, gridStart, key, rating?, color?, cues }]
 *               (positions en secondes, dans le temps Rekordbox / CDJ)
 *   playlists : [{ name, folder, keys: [id] }]
 * Met à jour BPM / grille / cues des morceaux retrouvés (sauf ceux déjà modifiés dans fadarr) et remplace les playlists
 * importées de la même origine (`root` : « Rekordbox » pour le XML, « Rekordbox / Clé LUCID USB » pour une clé).
 * Les MP3 sont recalés sur le temps de fadarr (voir mp3offset.js), comme l'export les décale dans l'autre sens.
 */
/** Début de grille recalé (temps fadarr) : un début qui passerait sous 0 avance d'un temps au lieu d'être écrasé à 0. */
function gridAt(start, bpm, shift) {
  let g = start - shift;
  const beat = bpm > 0 ? 60 / bpm : 0;
  if (beat) while (g < -0.0005) g += beat;
  return Math.max(0, Math.round(g * 1000) / 1000);
}

function importCollection(tracks, playlists, { root = 'Rekordbox', replace } = {}) {
  const match = buildMatcher();
  const settings = store.settings();
  const idToRel = new Map();
  const unmatched = [];
  let matched = 0; let cuesImported = 0; let kept = 0;

  // Plusieurs entrées peuvent viser le même fichier (ex. le MP3 et l'AIFF d'un morceau sur une clé) : les playlists
  // suivent toutes les entrées, mais BPM / grille / cues viennent de la mieux appariée (nom exact > nom approchant > artiste + titre).
  const RANK = { nom: 3, 'nom approchant': 2, 'artiste + titre': 1 };
  const best = new Map(); // rel -> rang retenu
  const found = tracks.map((tr) => {
    const f = tr.file || tr.artist || tr.title ? match(tr.file || '', tr.artist || '', tr.title || '') : null;
    if (f && (best.get(f.rel) || 0) < RANK[f.how]) best.set(f.rel, RANK[f.how]);
    return f;
  });
  const applied = new Set();
  for (const [i, tr] of tracks.entries()) {
    const { id, file, artist = '', title = '' } = tr;
    const f = found[i];
    if (!f) { unmatched.push({ artist, title, file }); continue; }
    matched++;
    if (id !== undefined && id !== null && id !== '') idToRel.set(String(id), f.rel);
    if (tr.location) idToRel.set(String(tr.location), f.rel);
    if (RANK[f.how] < best.get(f.rel) || applied.has(f.rel)) continue; // une meilleure entrée (ou la première au même rang) s'en charge
    applied.add(f.rel);
    const found1 = f;

    const shift = mp3offset.deviceShift(library.absPath(found1.rel), settings); // temps Rekordbox -> temps fadarr
    const at = (x) => Math.max(0, Math.round((x - shift) * 1000) / 1000);
    const current = store.trackInfo(found1.rel);
    const bpm = Number(tr.bpm) > 0 ? Number(tr.bpm) : null;
    const patch = {
      rekordbox: true,
      bpm: bpm != null ? Math.round(bpm * 100) / 100 : (current && current.bpm) || null,
      gridStart: Number.isFinite(tr.gridStart) ? gridAt(tr.gridStart, bpm, shift) : (current && current.gridStart) ?? null,
      key: String(tr.key || (current && current.key) || '').slice(0, 8),
      meta: { title, artist, album: tr.album || '', genre: tr.genre || '', duration: Number(tr.duration) || null, bitrate: Number(tr.bitrate) || null }
    };
    if (bpm != null) { patch.gridAuto = false; patch.keyAuto = false; }
    if (tr.rating !== undefined && !(current && current.rating)) patch.rating = Math.max(0, Math.min(255, Math.round(Number(tr.rating) || 0)));
    if (tr.color && !(current && current.color)) patch.color = tr.color;
    const cues = store.cleanCues((tr.cues || []).map((c) => ({ ...c, start: at(c.start), ...(c.end !== undefined ? { end: at(c.end) } : {}) })));
    if (current && current.edited) kept++;
    else { patch.cues = cues; cuesImported += cues.length; }
    store.updateTrack(found1.rel, patch);
  }

  let playlistTracks = 0; let playlistMissing = 0;
  const toSave = playlists.map((p) => {
    const trackRels = [];
    for (const k of p.keys) {
      const rel = idToRel.get(String(k));
      if (rel) { trackRels.push(rel); playlistTracks++; } else playlistMissing++;
    }
    return { name: p.name, folder: p.folder ? `${root} / ${p.folder}` : root, tracks: trackRels };
  });
  if (replace) store.replacePlaylistsWhere(replace, 'rekordbox', toSave);
  else store.replaceSourcePlaylists('rekordbox', toSave);

  return {
    entries: tracks.length, matched,
    unmatched: unmatched.slice(0, 2000), unmatchedCount: unmatched.length,
    playlists: toSave.length, playlistTracks, playlistMissing, cuesImported, keptEdited: kept
  };
}

/** Importe un rekordbox.xml (voir importCollection). */
function importXml(xml) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false });
  const doc = parser.parse(xml);
  const root = doc.DJ_PLAYLISTS;
  if (!root) throw new Error('Ce fichier n\'est pas un rekordbox.xml (balise DJ_PLAYLISTS absente).');
  const tracks = arr(root.COLLECTION && root.COLLECTION.TRACK).map((tr) => {
    const tempo = arr(tr.TEMPO)[0];
    const bpmTempo = tempo ? Number(tempo['@_Bpm']) : NaN;
    return {
      id: String(tr['@_TrackID'] || ''),
      location: tr['@_Location'] ? String(tr['@_Location']) : '',
      file: fileFromLocation(tr['@_Location']),
      artist: String(tr['@_Artist'] || ''),
      title: String(tr['@_Name'] || ''),
      album: String(tr['@_Album'] || ''),
      genre: String(tr['@_Genre'] || ''),
      duration: Number(tr['@_TotalTime']) || null,
      bitrate: Number(tr['@_BitRate']) || null,
      bpm: Number.isFinite(bpmTempo) && bpmTempo > 0 ? bpmTempo : (Number(tr['@_AverageBpm']) || null),
      gridStart: tempo && Number.isFinite(Number(tempo['@_Inizio'])) ? Number(tempo['@_Inizio']) : null,
      key: String(tr['@_Tonality'] || ''),
      cues: convertMarks(tr.POSITION_MARK)
    };
  });
  const pls = walkPlaylists(root.PLAYLISTS && root.PLAYLISTS.NODE, [], []);
  // les playlists de la clé USB (« Rekordbox / Clé … ») ne sont pas touchées par un import XML
  return importCollection(tracks, pls, { root: 'Rekordbox', replace: (p) => !/^Rekordbox \/ Clé /.test(p.folder || '') });
}

/**
 * Importe une clé USB lue par le navigateur (public/usbread.js) : { name, tracks, playlists } avec, par morceau,
 * cues = [{ slot, timeMs, loopTimeMs, rgb, comment }] et grid = { bpm, gridStart }.
 */
const USB_COLORS = { 1: '#ec407a', 2: '#f5425a', 3: '#f58a42', 4: '#f5d142', 5: '#4caf50', 6: '#42a5f5', 7: '#42a5f5', 8: '#7e57c2' };
function importUsb(data) {
  if (!data || !Array.isArray(data.tracks)) throw new Error('Clé illisible.');
  const name = String(data.name || 'USB').replace(/[\/]/g, ' ').slice(0, 60);
  const hex = (rgb) => (Array.isArray(rgb) && rgb.length === 3 ? `#${rgb.map((x) => Math.max(0, Math.min(255, Number(x) || 0)).toString(16).padStart(2, '0')).join('')}` : '');
  const tracks = data.tracks.slice(0, 100000).map((t) => ({
    id: String(t.id),
    file: String(t.fileName || String(t.filePath || '').split('/').pop() || ''),
    artist: String(t.artist || ''), title: String(t.title || ''), album: String(t.album || ''), genre: String(t.genre || ''),
    duration: Number(t.duration) || null, bitrate: Number(t.bitrate) || null,
    bpm: t.grid && t.grid.bpm ? t.grid.bpm : (Number(t.bpm) || null),
    gridStart: t.grid && Number.isFinite(t.grid.gridStart) ? Math.max(0, t.grid.gridStart) : null,
    key: String(t.key || ''),
    rating: Number(t.rating) ? Math.min(5, Number(t.rating)) * 51 : 0,
    color: USB_COLORS[t.colorId] || '',
    cues: (Array.isArray(t.cues) ? t.cues : []).slice(0, 200).map((c) => {
      const slot = Number(c.slot) || 0;
      const num = slot >= 1 && slot <= 8 ? slot - 1 : -1;
      const loop = c.loopTimeMs != null && Number(c.loopTimeMs) > Number(c.timeMs);
      return {
        kind: loop ? 'loop' : (num >= 0 ? 'hot' : 'memory'), num,
        start: Number(c.timeMs) / 1000, ...(loop ? { end: Number(c.loopTimeMs) / 1000 } : {}),
        name: String(c.comment || '').slice(0, 60), color: num >= 0 ? hex(c.rgb) : ''
      };
    })
  }));
  const root = `Rekordbox / Clé ${name}`;
  const playlists = (Array.isArray(data.playlists) ? data.playlists : []).map((p) => ({ name: String(p.name || ''), folder: String(p.folder || ''), keys: (p.trackIds || []).map(String) }));
  return importCollection(tracks, playlists, { root, replace: (p) => (p.folder || '') === root || String(p.folder || '').startsWith(`${root} / `) });
}

module.exports = { importXml, importUsb, importCollection, _internals: { fileFromLocation, convertMarks } };
