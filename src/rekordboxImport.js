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
 * Importe un rekordbox.xml : met à jour BPM / grille / cues des morceaux retrouvés (sauf ceux déjà modifiés dans fadarr)
 * et remplace les playlists « Rekordbox » de fadarr.
 */
function importXml(xml) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false });
  const doc = parser.parse(xml);
  const root = doc.DJ_PLAYLISTS;
  if (!root) throw new Error('Ce fichier n\'est pas un rekordbox.xml (balise DJ_PLAYLISTS absente).');

  const match = buildMatcher();
  const idToRel = new Map();      // TrackID -> rel
  const locToRel = new Map();     // clé par chemin (pour les playlists KeyType 1)
  const unmatched = [];
  let matched = 0; let cuesImported = 0; let kept = 0;

  const tracks = arr(root.COLLECTION && root.COLLECTION.TRACK);
  for (const tr of tracks) {
    const id = String(tr['@_TrackID'] || '');
    const file = fileFromLocation(tr['@_Location']);
    const artist = String(tr['@_Artist'] || '');
    const title = String(tr['@_Name'] || '');
    const found = file || artist || title ? match(file, artist, title) : null;
    if (!found) { unmatched.push({ artist, title, file }); continue; }
    matched++;
    if (id) idToRel.set(id, found.rel);
    if (tr['@_Location']) locToRel.set(String(tr['@_Location']), found.rel);

    const tempo = arr(tr.TEMPO)[0];
    const gridStart = tempo && Number.isFinite(Number(tempo['@_Inizio'])) ? Number(tempo['@_Inizio']) : null;
    const bpmTempo = tempo ? Number(tempo['@_Bpm']) : NaN;
    const bpm = Number.isFinite(bpmTempo) && bpmTempo > 0 ? bpmTempo : (Number(tr['@_AverageBpm']) || null);
    const cues = convertMarks(tr.POSITION_MARK);
    const current = store.trackInfo(found.rel);
    const patch = {
      rekordbox: true,
      bpm: bpm != null ? Math.round(bpm * 100) / 100 : (current && current.bpm) || null,
      gridStart: gridStart != null ? Math.round(gridStart * 1000) / 1000 : (current && current.gridStart) || null,
      key: String(tr['@_Tonality'] || (current && current.key) || '').slice(0, 8),
      meta: {
        title, artist,
        album: String(tr['@_Album'] || ''),
        genre: String(tr['@_Genre'] || ''),
        duration: Number(tr['@_TotalTime']) || null,
        bitrate: Number(tr['@_BitRate']) || null
      }
    };
    if (current && current.edited) kept++;
    else { patch.cues = cues; cuesImported += cues.length; }
    store.updateTrack(found.rel, patch);
  }

  const pls = walkPlaylists(root.PLAYLISTS && root.PLAYLISTS.NODE, [], []);
  let playlistTracks = 0; let playlistMissing = 0;
  const toSave = pls.map((p) => {
    const trackRels = [];
    for (const k of p.keys) {
      const rel = idToRel.get(k) || locToRel.get(k);
      if (rel) { trackRels.push(rel); playlistTracks++; } else playlistMissing++;
    }
    return { name: p.name, folder: p.folder ? `Rekordbox / ${p.folder}` : 'Rekordbox', tracks: trackRels };
  });
  store.replaceSourcePlaylists('rekordbox', toSave);

  return {
    entries: tracks.length,
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

module.exports = { importXml, _internals: { fileFromLocation, convertMarks } };
