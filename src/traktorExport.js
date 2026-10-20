/**
 * Export vers Traktor (retro-compatibilité).
 *
 * fadarr ne voit qu'une COPIE téléversée de collection.nml : il ne peut pas (et ne doit pas) réécrire la base
 * Traktor en direct — l'écraser perdrait tout ce que fadarr ignore. À la place, on génère un collection.nml
 * ré-importable : dans Traktor, clic droit sur « Playlists » → « Import… » → ce fichier ajoute les playlists
 * (et retrouve les morceaux par leur emplacement Mac d'origine, conservé à l'import).
 *
 * Seuls les morceaux VENUS de Traktor (qui ont gardé leur clé + emplacement Mac) peuvent être réécrits ;
 * les morceaux ajoutés uniquement dans fadarr n'ont pas d'emplacement Mac valable et sont listés dans le rapport.
 */
const { XMLBuilder } = require('fast-xml-parser');
const library = require('./library');
const store = require('./store');
const { colorToTraktor, _internals: { KEYS } } = require('./traktor');

const KEY_INDEX = new Map(KEYS.map((k, i) => [k, i]));
const ms = (s) => Math.round(Number(s || 0) * 1000);

/** cues fadarr -> CUE_V2 Traktor (+ marqueur de grille si gridStart est défini). */
function cuesToTraktor(cues, gridStart) {
  const out = [];
  if (gridStart !== null && gridStart !== undefined && Number.isFinite(Number(gridStart))) {
    out.push({ '@_NAME': 'AutoGrid', '@_DISPL_ORDER': '0', '@_TYPE': '4', '@_START': String(ms(gridStart)), '@_LEN': '0', '@_REPEATS': '-1', '@_HOTCUE': '-1' });
  }
  for (const c of cues || []) {
    const start = ms(c.start);
    if (c.kind === 'loop') {
      out.push({ '@_NAME': c.name || 'n.n.', '@_DISPL_ORDER': '0', '@_TYPE': '5', '@_START': String(start), '@_LEN': String(Math.max(0, ms(c.end) - start)), '@_REPEATS': '-1', '@_HOTCUE': String(c.num >= 0 ? c.num : -1) });
    } else {
      out.push({ '@_NAME': c.name || 'n.n.', '@_DISPL_ORDER': '0', '@_TYPE': '0', '@_START': String(start), '@_LEN': '0', '@_REPEATS': '-1', '@_HOTCUE': String(c.kind === 'hot' && c.num >= 0 ? c.num : -1) });
    }
  }
  return out;
}

/** Construit une ENTRY de collection pour un morceau venu de Traktor (avec clé + emplacement conservés). */
function buildEntry(rel) {
  const info = store.trackInfo(rel) || {};
  if (!info.traktorKey || !info.traktorLoc) return null; // pas d'emplacement Mac fiable : non ré-exportable
  const e = library.entry(rel) || {};
  const loc = info.traktorLoc;
  const entry = {
    '@_MODIFIED_DATE': new Date().toISOString().slice(0, 10),
    '@_TITLE': e.title || info.meta?.title || '',
    '@_ARTIST': e.artist || info.meta?.artist || '',
    LOCATION: { '@_DIR': loc.DIR || '', '@_FILE': loc.FILE || '', '@_VOLUME': loc.VOLUME || '', '@_VOLUMEID': loc.VOLUMEID || '' }
  };
  const infoAttr = {};
  if (e.genre || info.meta?.genre) infoAttr['@_GENRE'] = e.genre || info.meta.genre;
  if (info.comment) infoAttr['@_COMMENT'] = String(info.comment);
  if (info.rating) infoAttr['@_RANKING'] = String(Math.max(0, Math.min(255, Math.round(info.rating))));
  const colIdx = colorToTraktor(info.color);
  if (colIdx) infoAttr['@_COLOR'] = String(colIdx);
  if (e.bitrate) infoAttr['@_BITRATE'] = String(Math.round(e.bitrate * 1000));
  if (Object.keys(infoAttr).length) entry.INFO = infoAttr;
  if (info.bpm) entry.TEMPO = { '@_BPM': String(info.bpm), '@_BPM_QUALITY': '100' };
  if (info.key && KEY_INDEX.has(info.key)) entry.MUSICAL_KEY = { '@_VALUE': String(KEY_INDEX.get(info.key)) };
  const cues = cuesToTraktor(info.cues, info.gridStart);
  if (cues.length) entry.CUE_V2 = cues;
  return { key: info.traktorKey, entry };
}

/** Un nœud PLAYLIST Traktor à partir d'une playlist fadarr. */
function playlistNode(name, keys) {
  return {
    '@_TYPE': 'PLAYLIST', '@_NAME': name,
    PLAYLIST: {
      '@_ENTRIES': String(keys.length), '@_TYPE': 'LIST', '@_UUID': store.newId() + store.newId(),
      ENTRY: keys.map((k) => ({ PRIMARYKEY: { '@_TYPE': 'TRACK', '@_KEY': k } }))
    }
  };
}

/** Arbre de dossiers (catégories fadarr) -> NODE FOLDER imbriqués. */
function foldersToNodes(playlistsByFolder) {
  const root = { children: new Map(), lists: [] };
  for (const { folder, node } of playlistsByFolder) {
    const parts = String(folder || '').split('/').map((x) => x.trim()).filter(Boolean);
    let cur = root;
    for (const part of parts) { if (!cur.children.has(part)) cur.children.set(part, { children: new Map(), lists: [] }); cur = cur.children.get(part); }
    cur.lists.push(node);
  }
  const toNodes = (n) => {
    const nodes = [...n.lists];
    for (const [name, child] of n.children) {
      const sub = toNodes(child);
      nodes.push({ '@_TYPE': 'FOLDER', '@_NAME': name, SUBNODES: { '@_COUNT': String(sub.length), NODE: sub } });
    }
    return nodes;
  };
  return toNodes(root);
}

/**
 * Génère un collection.nml ré-importable dans Traktor à partir des playlists fadarr.
 * @returns { xml, report: { playlists, tracks, skipped: [{name, reason}], skippedCount } }
 */
function exportNml() {
  const fadarrLists = store.playlists().filter((p) => p.source === 'fadarr');
  const entriesByKey = new Map(); // clé Traktor -> ENTRY (dédupliquée)
  const skipped = [];
  const playlistsByFolder = [];
  let trackCount = 0;

  for (const p of fadarrLists) {
    const keys = [];
    for (const rel of p.tracks) {
      const built = buildEntry(rel);
      if (!built) { skipped.push({ name: `${p.name} — ${rel.split('/').pop()}`, reason: 'ajouté dans fadarr (hors Traktor), pas d’emplacement Mac' }); continue; }
      if (!entriesByKey.has(built.key)) entriesByKey.set(built.key, built.entry);
      keys.push(built.key);
      trackCount++;
    }
    playlistsByFolder.push({ folder: p.folder, node: playlistNode(p.name, keys) });
  }

  const subNodes = foldersToNodes(playlistsByFolder);
  const entries = [...entriesByKey.values()];
  const doc = {
    NML: {
      '@_VERSION': '19',
      HEAD: { '@_COMPANY': 'www.native-instruments.com', '@_PROGRAM': 'fadarr' },
      COLLECTION: { '@_ENTRIES': String(entries.length), ENTRY: entries },
      PLAYLISTS: { NODE: { '@_TYPE': 'FOLDER', '@_NAME': '$ROOT', SUBNODES: { '@_COUNT': String(subNodes.length), NODE: subNodes } } }
    }
  };

  const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true, suppressEmptyNode: true });
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + builder.build(doc);
  return { xml, report: { playlists: fadarrLists.length, tracks: trackCount, skipped: skipped.slice(0, 500), skippedCount: skipped.length } };
}

module.exports = { exportNml, _internals: { cuesToTraktor, buildEntry, foldersToNodes } };
