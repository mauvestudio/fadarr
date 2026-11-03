/**
 * Préparation d'une clé USB pour CDJ (priorité CDJ-2000NXS2 : export.pdb + ANLZ .DAT/.EXT ; .2EX en plus pour CDJ-3000).
 *
 * Le serveur prépare tout ce qui va sur la clé — base, fichiers d'analyse — et indique pour chaque fichier son empreinte ;
 * le navigateur, lui, écrit sur la clé (branchée sur l'ordinateur, pas sur le serveur) et ne réécrit que ce qui a changé
 * (synchro intelligente, manifeste dans PIONEER/fadarr/manifest.json).
 *
 * Disposition et règles reprises de rbxport (GPL-2.0-or-later, https://github.com/chrisle/rbxport) :
 * Contents/<Artiste>/<Album>/<fichier> (dossiers coupés à 48 caractères, noms compatibles FAT32), analyse dans le dossier
 * que la platine calcule à partir du chemin final, identifiants de morceaux stables d'un export à l'autre.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const library = require('../library');
const store = require('../store');
const mp3offset = require('../mp3offset');
const pdb = require('./pdb');
const anlz = require('./anlz');
const { analyzeFile, constantGrid } = require('./analyze');

const DIR_NAME_MAX = 48;
const FILE_NAME_MAX = 120;
const CACHE_DIR = path.join(store.DATA_DIR, 'usb-cache');
const IDS_FILE = path.join(store.DATA_DIR, 'usb-ids.json');
const MANIFEST_PATH = 'PIONEER/fadarr/manifest.json';
const MANIFEST_VERSION = 1;

// ---------------------------------------------------------------------------
// Noms compatibles FAT32
// ---------------------------------------------------------------------------

function fatSafe(name) {
  let out = String(name || '').normalize('NFC').replace(/[/\\:*?"<>|\x00-\x1f]/g, '_');
  out = out.replace(/[. ]+$/, '');
  return out || 'Unknown';
}
function dirName(name) {
  const safe = fatSafe(name);
  const chars = [...safe];
  if (chars.length <= DIR_NAME_MAX) return safe;
  const cut = chars.slice(0, DIR_NAME_MAX).join('').replace(/[. ]+$/, '');
  return cut || 'Unknown';
}
function fatFileName(name) {
  const safe = fatSafe(name);
  if (Buffer.byteLength(safe) <= FILE_NAME_MAX) return safe;
  const dot = safe.lastIndexOf('.');
  const ext = dot > 0 ? safe.slice(dot) : '';
  let stem = dot > 0 ? safe.slice(0, dot) : safe;
  while (Buffer.byteLength(stem + ext) > FILE_NAME_MAX) stem = [...stem].slice(0, -1).join('');
  stem = stem.replace(/[. ]+$/, '') || 'Unknown';
  return stem + ext;
}

// ---------------------------------------------------------------------------
// Identifiants stables (un même morceau garde son numéro d'une clé à l'autre : les platines s'en servent)
// ---------------------------------------------------------------------------

function loadIds() { try { return JSON.parse(fs.readFileSync(IDS_FILE, 'utf8')); } catch (e) { return { next: 1, ids: {} }; } }
function saveIds(db) { fs.mkdirSync(path.dirname(IDS_FILE), { recursive: true }); fs.writeFileSync(IDS_FILE, JSON.stringify(db)); }

// ---------------------------------------------------------------------------
// Correspondances fadarr -> rekordbox
// ---------------------------------------------------------------------------

/** Couleur de morceau (#rrggbb, souvent une des 7 couleurs Traktor) -> couleur rekordbox 1-8 (Pink, Red, Orange, Yellow, Green, Aqua, Blue, Purple). */
function colorId(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return 0;
  const n = parseInt(m[1], 16); const r = (n >> 16) / 255; const g = ((n >> 8) & 255) / 255; const b = (n & 255) / 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  if (max - min < 0.08) return 0;
  let h;
  if (max === r) h = ((g - b) / (max - min)) % 6; else if (max === g) h = (b - r) / (max - min) + 2; else h = (r - g) / (max - min) + 4;
  h = (h * 60 + 360) % 360;
  if (h < 12 || h >= 345) return 2;       // rouge
  if (h < 40) return 3;                   // orange
  if (h < 70) return 4;                   // jaune
  if (h < 160) return 5;                  // vert
  if (h < 200) return 6;                  // aqua
  if (h < 255) return 7;                  // bleu
  if (h < 300) return 8;                  // violet
  return 1;                               // rose
}

/** Tonalité affichée par la platine : notation musicale (« Am », « F#m »…), y compris depuis Camelot (8A) ou Open Key (1m). */
const CAMELOT_MINOR = ['G#m', 'D#m', 'Bbm', 'Fm', 'Cm', 'Gm', 'Dm', 'Am', 'Em', 'Bm', 'F#m', 'C#m'];
const CAMELOT_MAJOR = ['B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E'];
function musicalKey(key) {
  const k = String(key || '').trim();
  let m = /^(\d{1,2})\s*([AB])$/i.exec(k);
  if (m && +m[1] >= 1 && +m[1] <= 12) return (m[2].toUpperCase() === 'A' ? CAMELOT_MINOR : CAMELOT_MAJOR)[+m[1] - 1];
  m = /^(\d{1,2})\s*([dm])$/i.exec(k);
  if (m && +m[1] >= 1 && +m[1] <= 12) { const c = ((+m[1] + 6) % 12) + 1; return (m[2].toLowerCase() === 'm' ? CAMELOT_MINOR : CAMELOT_MAJOR)[c - 1]; }
  return k;
}

const stars = (rating) => Math.max(0, Math.min(5, Math.round((Number(rating) || 0) / 51)));
const ymd = (ms) => { if (!ms) return ''; const d = new Date(ms); const p = (v) => String(v).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

/** Cues fadarr -> cues de clé : hot cue n (0-7) = emplacement n+1 (A-H), mémoire = 0. Couleur : code de palette le plus proche. */
function deviceCues(cues, shiftS) {
  const ms = (s) => Math.max(0, Math.round((s + shiftS) * 1000));
  return (cues || []).filter((c) => Number.isFinite(c.start)).map((c) => {
    const memory = c.kind === 'memory' || !(c.num >= 0);
    const slot = memory ? 0 : Math.min(16, c.num + 1);
    const isLoop = c.kind === 'loop' && Number.isFinite(c.end) && c.end > c.start;
    return { slot, timeMs: ms(c.start), loopTimeMs: isLoop ? ms(c.end) : null, colorId: 0, colorCode: memory ? 0 : anlz.nearestColourCode(c.color), comment: String(c.name || '').slice(0, 60) };
  }).sort((a, b) => a.slot - b.slot || a.timeMs - b.timeMs);
}

// ---------------------------------------------------------------------------
// Cache (analyse audio et fichiers générés), sur le disque des données
// ---------------------------------------------------------------------------

const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
function cachePath(kind, key) { return path.join(CACHE_DIR, kind, `${sha1(key)}.bin`); }
function readCache(kind, key) {
  try { const p = cachePath(kind, key); const b = fs.readFileSync(p); try { const now = new Date(); fs.utimesSync(p, now, now); } catch (_) { /* rien */ } return b; } catch (e) { return null; }
}
function writeCache(kind, key, buf) { const p = cachePath(kind, key); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); }

/** Fichiers générés de plus de 3 jours : supprimés (les formes d'onde, elles, restent en cache tant que le morceau ne change pas). */
function cacheFiles(kind) {
  const d = path.join(CACHE_DIR, kind);
  let names = []; try { names = fs.readdirSync(d); } catch (e) { return []; }
  const out = [];
  for (const n of names) { try { const st = fs.statSync(path.join(d, n)); if (st.isFile()) out.push({ kind, path: path.join(d, n), size: st.size, mtime: st.mtimeMs }); } catch (e) { /* disparu */ } }
  return out;
}

/** Une préparation de clé en cours (ou prête depuis moins d'une heure) : ses fichiers générés doivent rester là. */
const busy = () => [...jobs.values()].some((j) => j.phase === 'prepare' || (j.phase === 'ready' && Date.now() - j.startedAt < 3600 * 1000));

/** Taille du cache : formes d'onde des morceaux (« columns ») et fichiers préparés pour la clé (« gen »). */
function cacheInfo() {
  const parts = {};
  for (const kind of ['columns', 'gen']) { const f = cacheFiles(kind); parts[kind] = { files: f.length, bytes: f.reduce((a, x) => a + x.size, 0) }; }
  return { bytes: parts.columns.bytes + parts.gen.bytes, files: parts.columns.files + parts.gen.files, parts, maxMb: Number(store.settings().cacheMaxMb) || 0, busy: busy() };
}

/** Vide le cache (les fichiers d'une préparation en cours sont gardés). */
function clearCache() {
  let removed = 0; let bytes = 0;
  for (const kind of busy() ? ['columns'] : ['columns', 'gen']) for (const f of cacheFiles(kind)) { try { fs.rmSync(f.path, { force: true }); removed++; bytes += f.size; } catch (e) { /* rien */ } }
  return { ...cacheInfo(), removed, freedBytes: bytes, keptGen: busy() };
}

/** Ménage : fichiers préparés de plus de 3 jours, puis les plus anciens jusqu'à repasser sous la taille maximale (réglages). */
function cleanCache() {
  const keepGen = busy();
  for (const f of cacheFiles('gen')) if (!keepGen && Date.now() - f.mtime > 3 * 86400000) { try { fs.rmSync(f.path, { force: true }); } catch (e) { /* rien */ } }
  const maxBytes = (Number(store.settings().cacheMaxMb) || 0) * 1024 * 1024;
  if (!maxBytes) return;
  const all = [...cacheFiles('columns'), ...(keepGen ? [] : cacheFiles('gen'))].sort((a, b) => a.mtime - b.mtime);
  let total = cacheInfo().bytes;
  for (const f of all) { if (total <= maxBytes) break; try { fs.rmSync(f.path, { force: true }); total -= f.size; } catch (e) { /* rien */ } }
}

/** Colonnes de forme d'onde d'un fichier (mises en cache tant que le fichier ne change pas). */
async function columnsOf(abs, stat) {
  const key = `${abs}|${stat.size}|${stat.mtimeMs}|v1`;
  const hit = readCache('columns', key);
  if (hit) { const cols = []; for (let i = 0; i + 4 <= hit.length; i += 4) cols.push({ low: hit[i], mid: hit[i + 1], high: hit[i + 2], peak: hit[i + 3] }); return cols; }
  const { columns } = await analyzeFile(abs);
  const buf = Buffer.alloc(columns.length * 4);
  columns.forEach((c, i) => { buf[i * 4] = c.low; buf[i * 4 + 1] = c.mid; buf[i * 4 + 2] = c.high; buf[i * 4 + 3] = c.peak; });
  writeCache('columns', key, buf);
  return columns;
}

/** Infos techniques du fichier (fréquence, profondeur, débit, durée). */
let mmPromise = null;
async function techInfo(abs) {
  try {
    const mm = await (mmPromise ||= import('music-metadata'));
    const meta = await mm.parseFile(abs, { duration: true, skipCovers: true });
    const f = meta.format || {};
    return { sampleRate: f.sampleRate || 44100, bits: f.bitsPerSample || (f.lossless ? 16 : 0), bitrate: f.bitrate ? Math.round(f.bitrate / 1000) : 0, duration: f.duration || 0 };
  } catch (e) { return { sampleRate: 44100, bits: 0, bitrate: 0, duration: 0 }; }
}

// ---------------------------------------------------------------------------
// Préparation
// ---------------------------------------------------------------------------

const jobs = new Map(); // id -> { progress, total, done, error, result, files }

/** Playlists choisies (et leurs catégories « A / B ») -> arbre de la clé. */
function playlistTree(wanted) {
  const nodes = []; let nextId = 1;
  const folderIds = new Map(); const order = new Map();
  const sortOrder = (parent) => { const n = order.get(parent) || 0; order.set(parent, n + 1); return n; };
  const folderOf = (parts) => {
    let parent = 0; let key = '';
    for (const part of parts) {
      key = key ? `${key} / ${part}` : part;
      if (!folderIds.has(key)) { const id = nextId++; folderIds.set(key, id); nodes.push({ id, parentId: parent, sortOrder: sortOrder(parent), folder: true, name: part }); }
      parent = folderIds.get(key);
    }
    return parent;
  };
  const lists = [];
  for (const p of wanted) {
    const parent = folderOf(String(p.folder || '').split(' / ').map((s) => s.trim()).filter(Boolean));
    const id = nextId++;
    nodes.push({ id, parentId: parent, sortOrder: sortOrder(parent), folder: false, name: p.name || 'Playlist' });
    lists.push({ id, tracks: p.tracks });
  }
  return { nodes, lists };
}

/**
 * Lance la préparation (en tâche de fond). previous = manifeste lu sur la clé (ou null).
 * @returns {string} identifiant de tâche
 */
function start(playlistIds, { deviceName = '', previous = null } = {}) {
  const id = crypto.randomBytes(6).toString('hex');
  cleanCache();
  const job = { id, phase: 'prepare', done: 0, total: 0, current: '', error: null, result: null, startedAt: Date.now() };
  jobs.set(id, job);
  prepare(job, playlistIds, deviceName, previous).catch((e) => { job.error = e.message; job.phase = 'error'; });
  // nettoyage des vieilles tâches
  for (const [k, j] of jobs) if (Date.now() - j.startedAt > 6 * 3600 * 1000) jobs.delete(k);
  return id;
}

async function prepare(job, playlistIds, deviceName, previous) {
  const settings = store.settings();
  const wanted = playlistIds.map((id) => store.playlist(id)).filter((p) => p && Array.isArray(p.tracks));
  if (!wanted.length) throw new Error('Choisis au moins une playlist.');
  const { nodes, lists } = playlistTree(wanted);

  // Morceaux, dans l'ordre de première apparition
  const rels = []; const seen = new Set(); const missing = [];
  for (const l of lists) for (const rel of l.tracks) {
    if (seen.has(rel)) continue; seen.add(rel);
    if (!library.entry(rel) || !library.absPath(rel)) { missing.push(rel); continue; }
    rels.push(rel);
  }
  job.total = rels.length;

  const ids = loadIds();
  const intern = () => { const m = new Map(); return { map: m, id: (name) => { if (!name) return 0; if (!m.has(name)) m.set(name, m.size + 1); return m.get(name); } }; };
  const artists = intern(); const albums = intern(); const genres = intern(); const keys = intern(); const labels = intern();
  const files = []; const trackRows = []; const usedPaths = new Map(); const trackIdOf = new Map();
  const report = { tracks: 0, noBpm: [], noGrid: 0, withCues: 0, missing, warnings: [] };

  for (const rel of rels) {
    job.current = rel;
    const e = library.entry(rel); const info = store.trackInfo(rel) || {};
    const abs = library.absPath(rel);
    let stat; try { stat = fs.statSync(abs); } catch (err) { missing.push(rel); job.done++; continue; }
    if (stat.size > 0xffffffff) { report.warnings.push(`${rel} : plus de 4 Go, impossible sur une clé FAT32.`); job.done++; continue; }

    // Chemin sur la clé
    const fileName = fatFileName(path.basename(rel));
    let audio = `/Contents/${dirName(e.artist || 'UnknownArtist')}/${dirName(e.album || 'UnknownAlbum')}/${fileName}`;
    for (let n = 2; usedPaths.has(audio.toLowerCase()) && usedPaths.get(audio.toLowerCase()) !== rel; n++) {
      const dot = fileName.lastIndexOf('.');
      audio = `/Contents/${dirName(e.artist || 'UnknownArtist')}/${dirName(e.album || 'UnknownAlbum')}/${dot > 0 ? `${fileName.slice(0, dot)} (${n})${fileName.slice(dot)}` : `${fileName} (${n})`}`;
    }
    usedPaths.set(audio.toLowerCase(), rel);
    const anlzDir = anlz.analysisDirectory(audio);

    if (!ids.ids[rel]) ids.ids[rel] = ids.next++;
    const trackId = ids.ids[rel];
    trackIdOf.set(rel, trackId);

    const tech = await techInfo(abs);
    const duration = e.duration || tech.duration || 0;
    const bpm = info.bpm || e.bpm || null;
    const shift = mp3offset.deviceShift(abs, settings); // MP3 : fadarr (ffmpeg) -> position CDJ, selon l'encodeur
    const gridStart = Number.isFinite(info.gridStart) ? info.gridStart : null;
    if (!bpm) report.noBpm.push(e.artist && e.title ? `${e.artist} - ${e.title}` : rel); else if (gridStart === null) report.noGrid++;
    const cues = deviceCues(info.cues, shift);
    if (cues.length) report.withCues++;

    // Analyse (en cache) puis fichiers ANLZ
    const columns = await columnsOf(abs, stat);
    const beats = bpm ? constantGrid(bpm, (gridStart ?? 0) + shift, duration || columns.length / 150) : [];
    const a = anlz.author(audio, beats, columns, cues);

    files.push({ path: audio.slice(1), kind: 'audio', rel, size: stat.size, hash: `src:${stat.size}:${Math.round(stat.mtimeMs)}` });
    for (const [ext, buf] of [['DAT', a.dat], ['EXT', a.ext], ['2EX', a.twoEx]]) {
      const hash = sha1(buf); writeCache('gen', hash, buf);
      files.push({ path: `${anlzDir.slice(1)}/ANLZ0000.${ext}`, kind: 'gen', size: buf.length, hash });
    }

    trackRows.push({
      id: trackId, title: e.title || path.basename(rel), filename: path.posix.basename(audio), filePath: audio, analyzePath: `${anlzDir}/ANLZ0000.DAT`,
      artistId: artists.id(e.artist), albumId: albums.id(e.album), genreId: genres.id(e.genre), keyId: keys.id(musicalKey(info.key || e.key || '')), labelId: 0,
      colorId: colorId(info.color), rating: stars(info.rating), tempoX100: bpm ? Math.round(bpm * 100) : 0, durationSec: Math.round(duration),
      year: Number(e.year) || 0, bitrate: e.bitrate || tech.bitrate || 0, sampleRate: tech.sampleRate, sampleDepth: tech.bits || 0, fileSize: stat.size,
      comment: info.comment || '', dateAdded: ymd(e.added || stat.mtimeMs), hotCueAutoLoad: cues.some((c) => c.slot > 0)
    });
    report.tracks++;
    job.done++;
  }
  saveIds(ids);

  // Lignes trop longues pour une page : on raccourcit le commentaire plutôt que de produire une base corrompue
  for (const t of trackRows) {
    while (pdb.trackRow(t).length > pdb.maxRowLen() && t.comment) t.comment = t.comment.slice(0, -10);
    if (pdb.trackRow(t).length > pdb.maxRowLen()) throw new Error(`« ${t.title} » : trop de texte (titre, chemin…) pour export.pdb.`);
  }

  const entries = [];
  for (const l of lists) { let pos = 0; for (const rel of l.tracks) { const tid = trackIdOf.get(rel); if (tid) entries.push({ index: ++pos, trackId: tid, playlistId: l.id }); } }
  const db = pdb.buildPdb({
    tracks: trackRows, genres: genres.map, artists: artists.map, albums: albums.map, labels: labels.map, keys: keys.map,
    playlists: nodes, entries, deviceName: String(deviceName || '').slice(0, 32), createdDate: ymd(Date.now())
  });
  const dbHash = sha1(db); writeCache('gen', dbHash, db);
  files.push({ path: 'PIONEER/rekordbox/export.pdb', kind: 'gen', size: db.length, hash: dbHash, last: true });

  // Synchro intelligente : ce qui est déjà identique sur la clé n'est pas réécrit ; ce que fadarr y avait mis et qui n'est
  // plus choisi est retiré (jamais un fichier que fadarr n'a pas écrit lui-même).
  const before = previous && previous.version === MANIFEST_VERSION && previous.files && typeof previous.files === 'object' ? previous.files : {};
  const now = {}; for (const f of files) now[f.path] = f.hash;
  const toWrite = files.filter((f) => before[f.path] !== f.hash || f.last);
  const toDelete = Object.keys(before).filter((p) => !(p in now) && /^(Contents|PIONEER\/USBANLZ)\//.test(p));
  const manifest = { version: MANIFEST_VERSION, app: 'fadarr', writtenAt: new Date().toISOString(), files: now };
  const mbuf = Buffer.from(JSON.stringify(manifest)); const mhash = sha1(mbuf); writeCache('gen', mhash, mbuf);
  toWrite.push({ path: MANIFEST_PATH, kind: 'gen', size: mbuf.length, hash: mhash, last: true });

  job.result = {
    files: toWrite.map(({ path: p, kind, size, hash, rel }) => ({ path: p, kind, size, hash, rel: kind === 'audio' ? rel : undefined })),
    unchanged: files.length - toWrite.filter((f) => f.path !== MANIFEST_PATH).length,
    toDelete, bytes: toWrite.reduce((s, f) => s + f.size, 0), report, playlists: lists.length
  };
  job.phase = 'ready';
  job.current = '';
}

function status(id) {
  const j = jobs.get(id);
  if (!j) return null;
  return { id: j.id, phase: j.phase, done: j.done, total: j.total, current: j.current, error: j.error, result: j.phase === 'ready' ? j.result : undefined };
}

/** Chemin du contenu d'un fichier à écrire : audio (sur le NAS) ou fichier généré (cache). */
function source(kind, key) {
  if (kind === 'audio') { const abs = library.entry(key) && library.absPath(key); return abs || null; }
  if (/^[0-9a-f]{40}$/.test(key)) { const p = cachePath('gen', key); return fs.existsSync(p) ? p : null; }
  return null;
}

module.exports = { start, status, source, MANIFEST_PATH, cacheInfo, clearCache, cleanCache, _internals: { musicalKey, fatFileName, dirName, colorId, deviceCues, playlistTree, prepare } };
