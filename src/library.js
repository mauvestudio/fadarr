/**
 * Bibliothèque : les fichiers audio du dossier musique (le NAS, monté en lecture seule dans le conteneur).
 *
 * L'index (data/library.json) garde pour chaque fichier ses tags, sa durée, sa taille et sa date : seuls les fichiers
 * nouveaux ou modifiés sont relus à l'analyse suivante. Il reste consultable même quand le NAS est « déconnecté »
 * (bouton de l'en-tête) : on peut parcourir sa bibliothèque et ses playlists, seule l'écoute demande le NAS.
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { DATA_DIR } = require('./store');

const MUSIC_DIR = path.resolve(process.env.MUSIC_DIR || '/music');
const INDEX_FILE = path.join(DATA_DIR, 'library.json');
const AUDIO = /\.(mp3|wav|aiff?|flac|m4a|aac|ogg|opus)$/i;

let index = { scannedAt: null, files: {} }; // rel -> { size, mtime, title, artist, album, genre, year, bpm, key, duration, format, bitrate }
let scan = { running: false, done: 0, total: 0, errors: 0, startedAt: null, finishedAt: null };
let connected = process.env.NAS_START_DISCONNECTED === 'true' ? false : true; // choix du bouton de l'en-tête

function loadIndex() {
  try { index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')); if (!index.files) index.files = {}; } catch (e) { /* première fois */ }
}

function saveIndex() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${INDEX_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(index));
  fs.renameSync(tmp, INDEX_FILE);
}

/** Chemin absolu d'un chemin relatif, ou null s'il sort du dossier musique. */
function absPath(rel) {
  const abs = path.resolve(MUSIC_DIR, String(rel || ''));
  const inside = path.relative(MUSIC_DIR, abs);
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) return null;
  return abs;
}

// ---------------------------------------------------------------------------
// Connexion au NAS
// ---------------------------------------------------------------------------

/** Le dossier musique répond-il ? (2 s au plus : un partage réseau tombé peut bloquer longtemps) */
async function reachable() {
  try {
    const entries = await Promise.race([
      fsp.readdir(MUSIC_DIR),
      new Promise((_, reject) => setTimeout(() => reject(new Error('délai dépassé')), 2000))
    ]);
    return entries.length > 0;
  } catch (e) {
    return false;
  }
}

async function status() {
  return {
    connected,
    reachable: connected ? await reachable() : null,
    musicDir: MUSIC_DIR,
    tracks: Object.keys(index.files).length,
    scannedAt: index.scannedAt,
    scan: { ...scan }
  };
}

function setConnected(on) {
  connected = Boolean(on);
  if (!connected) scan.cancel = true;
  return connected;
}

const isConnected = () => connected;

// ---------------------------------------------------------------------------
// Analyse
// ---------------------------------------------------------------------------

async function* walk(dir) {
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name.startsWith('@')) continue; // fichiers cachés, @eaDir de Synology
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (AUDIO.test(e.name)) yield full;
  }
}

/** Format affiché d'après l'extension (« MP3 », « WAV », « AIFF »…), plus parlant que le nom du conteneur (« MPEG », « WAVE »). */
const extFormat = (file) => { const e = path.extname(file).slice(1).toUpperCase(); return e === 'AIF' ? 'AIFF' : e; };

async function readTags(file) {
  const mm = require('music-metadata');
  const meta = await mm.parseFile(file, { duration: true, skipCovers: true });
  const c = meta.common || {};
  const f = meta.format || {};
  return {
    title: c.title || '',
    artist: c.artist || (c.artists || []).join(', ') || '',
    album: c.album || '',
    genre: (c.genre || [])[0] || '',
    year: c.year || '',
    bpm: c.bpm ? Math.round(Number(c.bpm) * 100) / 100 : null,
    key: c.key || '',
    duration: f.duration ? Math.round(f.duration * 1000) / 1000 : null,
    format: extFormat(file),
    bitrate: f.bitrate ? Math.round(f.bitrate / 1000) : null,
    lossless: Boolean(f.lossless)
  };
}

/** Analyse le dossier musique (seuls les fichiers nouveaux ou modifiés sont relus). */
async function rescan() {
  if (scan.running || !connected) return status();
  scan = { running: true, done: 0, total: 0, errors: 0, startedAt: Date.now(), finishedAt: null };
  (async () => {
    try {
      const files = [];
      for await (const f of walk(MUSIC_DIR)) { files.push(f); if (scan.cancel) break; }
      // 1. Liste des fichiers (rapide) : la bibliothèque est utilisable tout de suite, avec les noms de fichiers
      //    et les infos de la collection Traktor (titre, artiste, BPM, tonalité, cues) pour les morceaux importés.
      scan.total = files.length;
      scan.phase = 'liste';
      const seen = new Set();
      const toRead = [];
      for (const file of files) {
        if (scan.cancel) break;
        const rel = path.relative(MUSIC_DIR, file);
        seen.add(rel);
        try {
          const st = await fsp.stat(file);
          const known = index.files[rel];
          if (!known || known.pending || known.size !== st.size || known.mtime !== st.mtimeMs) { // pending : tags pas encore lus (analyse interrompue)
            index.files[rel] = { size: st.size, mtime: st.mtimeMs, format: extFormat(file), pending: true };
            toRead.push({ rel, file });
          }
        } catch (e) { scan.errors++; }
      }
      if (!scan.cancel) {
        for (const rel of Object.keys(index.files)) if (!seen.has(rel)) delete index.files[rel]; // disparus du NAS
        index.scannedAt = new Date().toISOString();
      }
      saveIndex();

      // 2. Lecture des tags des seuls fichiers nouveaux ou modifiés, en arrière-plan.
      //    Ceux que la collection Traktor décrit déjà passent en dernier.
      const store = require('./store');
      toRead.sort((a, b) => Number(Boolean(store.trackInfo(a.rel)?.meta)) - Number(Boolean(store.trackInfo(b.rel)?.meta)));
      scan.phase = 'tags';
      scan.total = toRead.length;
      for (const { rel, file } of toRead) {
        if (scan.cancel) break;
        let tags;
        try { tags = await readTags(file); } catch (e) { tags = { format: extFormat(file) }; scan.errors++; }
        if (index.files[rel]) index.files[rel] = { size: index.files[rel].size, mtime: index.files[rel].mtime, ...tags };
        scan.done++;
        if (scan.done % 300 === 0) saveIndex();
      }
      saveIndex();
    } catch (e) {
      console.error('⚠️ Analyse de la bibliothèque :', e.message);
    } finally {
      scan.running = false;
      scan.finishedAt = Date.now();
      delete scan.cancel;
    }
  })();
  return status();
}

// ---------------------------------------------------------------------------
// Lecture de l'index
// ---------------------------------------------------------------------------

/** Nom affiché quand les tags sont vides : « Artiste - Titre » du nom de fichier. */
function fallbackNames(rel) {
  const base = path.basename(rel).replace(/\.[^.]+$/, '');
  const m = base.match(/^(.+?)\s+-\s+(.+)$/);
  return m ? { artist: m[1], title: m[2] } : { artist: '', title: base };
}

function entry(rel) {
  const f = index.files[rel];
  if (!f) return null;
  // Ordre de préférence : tags du fichier, puis infos de la collection Traktor, puis nom du fichier
  const meta = require('./store').trackInfo(rel)?.meta || {};
  const names = (!f.title || !f.artist) ? fallbackNames(rel) : {};
  return {
    path: rel,
    folder: path.dirname(rel) === '.' ? '' : path.dirname(rel),
    title: f.title || meta.title || names.title || '',
    artist: f.artist || meta.artist || names.artist || '',
    album: f.album || meta.album || '',
    genre: f.genre || meta.genre || '',
    year: f.year || meta.year || '',
    bpm: f.bpm || null,
    key: f.key || '',
    duration: f.duration || meta.duration || null,
    format: f.format || '',
    bitrate: f.bitrate || meta.bitrate || null,
    added: f.mtime || null // date du fichier sur le NAS (≈ date d'arrivée) : liste « Ajouts récents »
  };
}

/** Sous-dossiers directs d'un dossier (pour l'arborescence de gauche), avec le nombre de morceaux. */
function folders() {
  const counts = new Map();
  for (const rel of Object.keys(index.files)) {
    const parts = rel.split(path.sep).slice(0, -1);
    for (let i = 1; i <= parts.length; i++) {
      const key = parts.slice(0, i).join('/');
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()].map(([p, n]) => ({ path: p, count: n })).sort((a, b) => a.path.localeCompare(b.path, 'fr', { numeric: true }));
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function list({ folder = '', q = '', limit = 50000, recentDays = 0 } = {}) {
  const since = recentDays > 0 ? Date.now() - recentDays * 86400000 : 0;
  const words = norm(q).split(/\s+/).filter(Boolean);
  const prefix = folder ? `${folder.replace(/\/+$/, '')}/` : '';
  const out = [];
  for (const rel of Object.keys(index.files)) {
    const relSlash = rel.split(path.sep).join('/');
    if (prefix && !relSlash.startsWith(prefix)) continue;
    if (since && !(index.files[rel].mtime >= since)) continue;
    const e = entry(rel);
    if (words.length) {
      const hay = norm(`${e.artist} ${e.title} ${e.album} ${e.genre} ${relSlash}`);
      if (!words.every((w) => hay.includes(w))) continue;
    }
    out.push(e);
    if (out.length >= limit) break;
  }
  if (since) return out.sort((a, b) => (b.added || 0) - (a.added || 0)); // les plus récents d'abord
  return out.sort((a, b) => (a.artist + a.title).localeCompare(b.artist + b.title, 'fr'));
}

const allPaths = () => Object.keys(index.files);

loadIndex();

module.exports = { MUSIC_DIR, absPath, status, setConnected, isConnected, rescan, entry, list, folders, allPaths };
