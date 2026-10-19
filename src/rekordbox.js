/**
 * Export rekordbox.xml (format « rekordbox xml » importable dans Rekordbox 6 / 7).
 *
 *   <DJ_PLAYLISTS> <COLLECTION> : un TRACK par morceau, avec
 *       Location  « file://localhost/Volumes/… » : le chemin du fichier VU PAR LE MAC (réglage « Chemin du dossier musique sur le Mac »)
 *       TEMPO     début de grille (Inizio, s) + BPM
 *       POSITION_MARK  Type 0 = cue, 4 = loop ; Num -1 = memory cue / memory loop, 0-7 = hot cue A-H ; Start / End en secondes
 *   <PLAYLISTS> : dossiers (NODE Type 0) et playlists (NODE Type 1, morceaux désignés par leur TrackID), dans l'ordre.
 *
 * Dans Rekordbox : Préférences > Avancé > Base de données > « rekordbox xml » : choisir ce fichier, puis dans l'arborescence
 * « rekordbox xml », clic droit sur la playlist > « Importer la playlist ».
 */
const path = require('path');
const library = require('./library');
const store = require('./store');

const esc = (v) => String(v ?? '')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const attrs = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}="${esc(v)}"`).join(' ');

/** Couleurs par défaut des hot cues A-H quand aucune n'est choisie. */
const HOT_COLORS = ['#28e214', '#ff8c00', '#e13535', '#10b1e2', '#e6d200', '#aa00ff', '#304ff1', '#ff007f'];

const KIND = { MP3: 'MP3 File', MPEG: 'MP3 File', WAV: 'WAV File', WAVE: 'WAV File', AIFF: 'AIFF File', AIF: 'AIFF File', FLAC: 'FLAC File', M4A: 'M4A File', MP4: 'M4A File' };

/** « /Volumes/music/Electronic » + « 2026/A - B.mp3 » -> « file://localhost/Volumes/music/Electronic/2026/A%20-%20B.mp3 » */
function locationOf(rel, macPrefix) {
  const full = `${macPrefix.replace(/\/+$/, '')}/${rel.split(path.sep).join('/')}`;
  return `file://localhost${full.split('/').map((s) => encodeURIComponent(s)).join('/')}`;
}

const hexToRgb = (hex) => {
  const n = parseInt(String(hex).slice(1), 16);
  return { Red: (n >> 16) & 255, Green: (n >> 8) & 255, Blue: n & 255 };
};

const RATING = [0, 51, 102, 153, 204, 255];

/**
 * @param {string[]} playlistIds playlists à exporter (toutes les playlists fadarr si vide)
 * @returns {{ xml: string, tracks: number, playlists: number, missing: string[] }}
 */
function exportXml(playlistIds = []) {
  const settings = store.settings();
  if (!settings.macPrefix) throw new Error('Indique d\'abord dans les Réglages le chemin du dossier musique sur ton Mac (ex. /Volumes/music/Electronic).');
  const wanted = playlistIds.length
    ? playlistIds.map((id) => store.playlist(id)).filter(Boolean)
    : store.playlists().filter((p) => p.source === 'fadarr');
  if (!wanted.length) throw new Error('Aucune playlist à exporter.');

  const ids = new Map(); // rel -> TrackID
  const missing = [];
  for (const p of wanted) for (const rel of p.tracks) {
    if (ids.has(rel)) continue;
    if (!library.entry(rel)) { missing.push(rel); continue; }
    ids.set(rel, ids.size + 1);
  }

  const offsetS = (settings.mp3OffsetMs || 0) / 1000;
  const lines = [];
  const noBpm = [];   // morceaux sans BPM : pas de grille possible -> inutilisables en SYNC / quantize sur les CDJ
  let noGrid = 0;     // BPM connu mais pas de début de grille précis (grille posée à 0 : à vérifier dans Rekordbox)
  let withCues = 0;
  for (const [rel, id] of ids) {
    const e = library.entry(rel);
    const info = store.trackInfo(rel) || {};
    const isMp3 = /\.mp3$/i.test(rel);
    const shift = isMp3 ? offsetS : 0;
    const t = (s) => Math.max(0, s + shift).toFixed(3);
    const bpm = info.bpm || e.bpm || null;
    const rating = RATING[Math.max(0, Math.min(5, Math.round((Number(info.rating) || 0) / 51)))] || 0;
    const head = attrs({
      TrackID: id,
      Name: e.title,
      Artist: e.artist,
      Album: e.album,
      Genre: e.genre,
      Kind: KIND[String(e.format).toUpperCase()] || `${path.extname(rel).slice(1).toUpperCase()} File`,
      TotalTime: e.duration ? Math.round(e.duration) : undefined,
      Year: e.year || undefined,
      AverageBpm: bpm ? Number(bpm).toFixed(2) : undefined,
      BitRate: e.bitrate || undefined,
      Tonality: info.key || e.key || undefined,
      Comments: info.comment || undefined,
      Rating: rating || undefined,
      Location: locationOf(rel, settings.macPrefix)
    });
    const inner = [];
    // Grille de tempo : indispensable pour que les CDJ affichent la grille, la phase et jouent le SYNC / quantize.
    // On l'écrit dès qu'un BPM est connu ; sans début de grille précis, on l'ancre au premier temps connu (cue) ou à 0.
    if (bpm) {
      const hasGrid = Number.isFinite(info.gridStart);
      const firstCue = (info.cues || []).map((c) => c.start).filter((s) => Number.isFinite(s)).sort((a, b) => a - b)[0];
      const inizio = hasGrid ? info.gridStart : (Number.isFinite(firstCue) ? firstCue : 0);
      if (!hasGrid) noGrid++;
      inner.push(`      <TEMPO ${attrs({ Inizio: t(inizio), Bpm: Number(bpm).toFixed(2), Metro: '4/4', Battito: 1 })}/>`);
    } else {
      noBpm.push(e.artist && e.title ? `${e.artist} - ${e.title}` : rel);
    }
    if ((info.cues || []).length) withCues++;
    for (const c of info.cues || []) {
      const isLoop = c.kind === 'loop';
      const num = c.kind === 'memory' ? -1 : (c.num >= 0 ? c.num : -1);
      const color = num >= 0 ? hexToRgb(c.color || HOT_COLORS[num]) : {};
      inner.push(`      <POSITION_MARK Name="${esc(c.name || '')}" ${attrs({ Type: isLoop ? 4 : 0, Start: t(c.start), End: isLoop ? t(c.end) : undefined, Num: num, ...color })}/>`);
    }
    lines.push(inner.length ? `    <TRACK ${head}>\n${inner.join('\n')}\n    </TRACK>` : `    <TRACK ${head}/>`);
  }

  // Arborescence des playlists : « Traktor / Techno / Peak » -> dossiers imbriqués
  const root = { children: new Map(), lists: [] };
  for (const p of wanted) {
    let node = root;
    for (const f of String(p.folder || '').split(' / ').map((s) => s.trim()).filter(Boolean)) {
      if (!node.children.has(f)) node.children.set(f, { children: new Map(), lists: [] });
      node = node.children.get(f);
    }
    node.lists.push(p);
  }
  const renderNode = (node, indent) => {
    const out = [];
    for (const [name, child] of node.children) {
      const count = child.children.size + child.lists.length;
      out.push(`${indent}<NODE Type="0" Name="${esc(name)}" Count="${count}">`, ...renderNode(child, `${indent}  `), `${indent}</NODE>`);
    }
    for (const p of node.lists) {
      const trackIds = p.tracks.map((rel) => ids.get(rel)).filter(Boolean);
      out.push(`${indent}<NODE Name="${esc(p.name)}" Type="1" KeyType="0" Entries="${trackIds.length}">`);
      for (const tid of trackIds) out.push(`${indent}  <TRACK Key="${tid}"/>`);
      out.push(`${indent}</NODE>`);
    }
    return out;
  };

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<DJ_PLAYLISTS Version="1.0.0">',
    '  <PRODUCT Name="fadarr" Version="0.2.0" Company=""/>',
    `  <COLLECTION Entries="${ids.size}">`,
    ...lines,
    '  </COLLECTION>',
    '  <PLAYLISTS>',
    `    <NODE Type="0" Name="ROOT" Count="${root.children.size + root.lists.length}">`,
    ...renderNode(root, '      '),
    '    </NODE>',
    '  </PLAYLISTS>',
    '</DJ_PLAYLISTS>',
    ''
  ].join('\n');

  return { xml, tracks: ids.size, playlists: wanted.length, missing, withBpm: ids.size - noBpm.length, withGrid: ids.size - noBpm.length - noGrid, withCues, noGrid, noBpm: noBpm.slice(0, 200), noBpmCount: noBpm.length };
}

module.exports = { exportXml, _internals: { locationOf, HOT_COLORS } };
