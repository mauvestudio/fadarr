/**
 * Base de mixarr : un fichier JSON (data/mixarr.json), écrit de façon atomique.
 *
 * C'est le « format pivot » : Traktor et Rekordbox ne sont que des entrées / sorties.
 *   tracks    : { [chemin relatif au dossier musique] : { cues: [...], bpm, gridStart, key, color, rating, comment } }
 *               un cue = { id, kind: 'hot' | 'memory' | 'loop', num (0-7 : touche de hot cue, -1 sinon), start (s), end (s, loop), name, color ('#rrggbb') }
 *               edited : true dès que les cues ont été modifiés dans mixarr (un nouvel import Traktor ne les écrase plus)
 *   playlists : [{ id, name, folder ('Traktor / Techno' …), source ('mixarr' | 'traktor'), tracks: [chemin relatif] }]
 *   settings  : { macPrefix, mp3OffsetMs }
 *
 * Les fichiers audio ne sont JAMAIS modifiés : tout ce que mixarr sait d'un morceau est ici.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'mixarr.json');

const DEFAULT_SETTINGS = {
  macPrefix: '',       // chemin du dossier musique tel que le Mac le voit (ex. /Volumes/music/Electronic) : sert à l'export Rekordbox
  mp3OffsetMs: 0       // décalage appliqué aux cues des MP3 entre Traktor et Rekordbox (à calibrer)
};

let db = { version: 1, tracks: {}, playlists: [], settings: { ...DEFAULT_SETTINGS } };
let timer = null;

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    db = {
      version: 1,
      tracks: parsed.tracks && typeof parsed.tracks === 'object' ? parsed.tracks : {},
      playlists: Array.isArray(parsed.playlists) ? parsed.playlists : [],
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) }
    };
  } catch (e) {
    if (e.code !== 'ENOENT') {
      const backup = `${FILE}.illisible-${Date.now()}`;
      try { fs.copyFileSync(FILE, backup); } catch (_) { /* rien à sauver */ }
      console.error(`⚠️ Base illisible (${e.message}) : copie gardée dans ${backup}, nouvelle base vide.`);
    }
  }
}

function writeNow() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE);
}

/** Écriture groupée (au plus une toutes les 500 ms). */
function save() {
  if (timer) return;
  timer = setTimeout(() => { timer = null; try { writeNow(); } catch (e) { console.error('⚠️ Enregistrement impossible :', e.message); } }, 500);
}

function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  writeNow();
}

const newId = () => crypto.randomBytes(6).toString('hex');

// ---------------------------------------------------------------------------
// Morceaux
// ---------------------------------------------------------------------------

function trackInfo(rel) {
  return db.tracks[rel] || null;
}

function updateTrack(rel, patch) {
  const current = db.tracks[rel] || { cues: [] };
  db.tracks[rel] = { ...current, ...patch };
  save();
  return db.tracks[rel];
}

const COLOR = /^#[0-9a-f]{6}$/i;

/** Nettoie une liste de cues venant de l'interface. */
function cleanCues(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const usedHot = new Set();
  for (const c of list.slice(0, 200)) {
    const kind = ['hot', 'memory', 'loop'].includes(c?.kind) ? c.kind : null;
    const start = Number(c?.start);
    if (!kind || !Number.isFinite(start) || start < 0) continue;
    // un hot cue a un numéro 0-7 (touches A-H de Rekordbox) ; une loop peut en avoir un (« hot loop ») ou non (-1)
    let num = Math.round(Number(c.num));
    if (!Number.isFinite(num) || num < 0 || num > 7) num = -1;
    if (kind === 'memory' || (num >= 0 && usedHot.has(num))) num = -1;
    if (kind === 'hot' && num < 0) continue;
    if (num >= 0) usedHot.add(num);
    const end = kind === 'loop' ? Number(c.end) : undefined;
    if (kind === 'loop' && !(Number.isFinite(end) && end > start)) continue;
    out.push({
      id: typeof c.id === 'string' && c.id ? c.id.slice(0, 20) : newId(),
      kind,
      num,
      start: Math.round(start * 1000) / 1000,
      ...(kind === 'loop' ? { end: Math.round(end * 1000) / 1000 } : {}),
      name: String(c.name || '').slice(0, 60),
      color: COLOR.test(c.color || '') ? c.color.toLowerCase() : ''
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------------------
// Playlists
// ---------------------------------------------------------------------------

function playlists() {
  return db.playlists;
}

function playlist(id) {
  return db.playlists.find((p) => p.id === id) || null;
}

function createPlaylist({ name, folder = '', source = 'mixarr', tracks = [] }) {
  const p = { id: newId(), name: String(name || 'Nouvelle playlist').slice(0, 120), folder: String(folder || '').slice(0, 300), source, tracks: [...tracks] };
  db.playlists.push(p);
  save();
  return p;
}

function updatePlaylist(id, patch) {
  const p = playlist(id);
  if (!p) return null;
  if (patch.name !== undefined) p.name = String(patch.name).slice(0, 120) || p.name;
  if (patch.folder !== undefined) p.folder = String(patch.folder).slice(0, 300);
  if (Array.isArray(patch.tracks)) p.tracks = patch.tracks.filter((t) => typeof t === 'string').slice(0, 5000);
  save();
  return p;
}

function deletePlaylist(id) {
  const before = db.playlists.length;
  db.playlists = db.playlists.filter((p) => p.id !== id);
  save();
  return db.playlists.length !== before;
}

/** Remplace les playlists d'une source importée (traktor, rekordbox…). Les playlists mixarr ne sont jamais touchées. */
function replaceSourcePlaylists(source, list) {
  db.playlists = db.playlists.filter((p) => p.source !== source).concat(list.map((p) => ({ id: newId(), source, ...p })));
  save();
}

/** Remplace les playlists importées depuis Traktor (les playlists mixarr ne sont jamais touchées). */
function replaceTraktorPlaylists(list) {
  replaceSourcePlaylists('traktor', list);
}

function settings() {
  return db.settings;
}

function updateSettings(patch) {
  if (patch.macPrefix !== undefined) db.settings.macPrefix = String(patch.macPrefix).trim().replace(/\/+$/, '');
  if (patch.mp3OffsetMs !== undefined) {
    const v = Math.round(Number(patch.mp3OffsetMs));
    db.settings.mp3OffsetMs = Number.isFinite(v) ? Math.max(-500, Math.min(500, v)) : 0;
  }
  save();
  return db.settings;
}

load();

module.exports = {
  DATA_DIR, trackInfo, updateTrack, cleanCues, playlists, playlist, createPlaylist, updatePlaylist, deletePlaylist,
  replaceTraktorPlaylists, replaceSourcePlaylists, settings, updateSettings, flush, newId, all: () => db
};
