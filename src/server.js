/**
 * mixarr : préparation de sets DJ dans le navigateur.
 * Écoute sur deux decks depuis le NAS, playlists, cues et loops, import Traktor (collection.nml), export Rekordbox (rekordbox.xml).
 *
 * Variables d'environnement :
 *   PORT (3010)   MUSIC_DIR (/music, lecture seule)   DATA_DIR (./data)
 *   AUTH_USER / AUTH_PASSWORD : mot de passe facultatif (conseillé si l'appli est joignable hors de chez toi)
 */
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { spawn } = require('child_process');
const express = require('express');
const store = require('./store');
const library = require('./library');

const PORT = Number(process.env.PORT) || 3010;
const app = express();
app.disable('x-powered-by');

// ---------------------------------------------------------------------------
// Sécurité : mot de passe facultatif, en-têtes
// ---------------------------------------------------------------------------

const AUTH_USER = process.env.AUTH_USER || '';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || '';
const same = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  if (!AUTH_USER || !AUTH_PASSWORD) return next();
  const [type, value] = String(req.headers.authorization || '').split(' ');
  if (type === 'Basic' && value) {
    const [u, ...rest] = Buffer.from(value, 'base64').toString().split(':');
    if (same(u, AUTH_USER) && same(rest.join(':'), AUTH_PASSWORD)) return next();
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="mixarr"');
  return res.status(401).send('Authentification requise');
});

// Requêtes qui modifient : uniquement depuis l'appli elle-même
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return res.status(403).json({ error: require('./i18n').tr(req, 'Requête interdite (origine externe)') });
  return next();
});

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: 0 }));

const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error(`❌ ${req.method} ${req.path} : ${e.message}`);
  res.status(e.status || 400).json({ error: require('./i18n').tr(req, e.message) });
});

const httpError = (status, message) => Object.assign(new Error(message), { status });

// ---------------------------------------------------------------------------
// Connexion au NAS (bouton de l'en-tête)
// ---------------------------------------------------------------------------

/** D'où vient le navigateur : Tailscale (100.64.0.0/10), réseau local, ou ailleurs. */
function networkOf(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim().replace(/^::ffff:/, '');
  const m = ip.match(/^(\d+)\.(\d+)\./);
  if (m && Number(m[1]) === 100 && Number(m[2]) >= 64 && Number(m[2]) <= 127) return { ip, where: 'tailscale' };
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|::1$|fd)/.test(ip)) return { ip, where: 'local' };
  return { ip, where: 'autre' };
}

app.get('/api/status', wrap(async (req, res) => {
  res.json({ ...(await library.status()), network: networkOf(req) });
}));

app.post('/api/nas', wrap(async (req, res) => {
  library.setConnected(req.body?.connected === true);
  console.log(`🔌 NAS ${library.isConnected() ? 'connecté' : 'déconnecté'} depuis l'interface.`);
  res.json({ ...(await library.status()), network: networkOf(req) });
}));

const needNas = () => { if (!library.isConnected()) throw httpError(409, 'NAS déconnecté : reconnecte-le avec le bouton en haut.'); };

// ---------------------------------------------------------------------------
// Bibliothèque
// ---------------------------------------------------------------------------

app.post('/api/library/rescan', wrap(async (req, res) => { needNas(); res.json(await library.rescan()); }));
app.get('/api/library/folders', (req, res) => res.json(library.folders()));
app.get('/api/library', (req, res) => {
  const list = library.list({ folder: String(req.query.folder || ''), q: String(req.query.q || ''), recentDays: Math.min(365, Number(req.query.recent) || 0) });
  res.json(list.map((e) => withInfo(e)));
});

/** Morceau + ce que mixarr en sait (cues, BPM, grille…). */
function withInfo(e) {
  const info = store.trackInfo(e.path) || {};
  return { ...e, bpm: info.bpm || e.bpm, key: info.key || e.key, gridStart: info.gridStart ?? null, cueCount: (info.cues || []).length, rating: info.rating || 0, traktor: Boolean(info.traktor) };
}

app.get('/api/track', wrap(async (req, res) => {
  const rel = String(req.query.path || '');
  const e = library.entry(rel);
  if (!e) throw httpError(404, 'Morceau inconnu de la bibliothèque.');
  const info = store.trackInfo(rel) || {};
  res.json({ ...withInfo(e), cues: info.cues || [], comment: info.comment || '' });
}));

app.put('/api/track/cues', wrap(async (req, res) => {
  const rel = String(req.body?.path || '');
  if (!library.entry(rel)) throw httpError(404, 'Morceau inconnu de la bibliothèque.');
  const t = store.updateTrack(rel, { cues: store.cleanCues(req.body.cues), edited: true });
  res.json({ cues: t.cues });
}));

app.put('/api/track/meta', wrap(async (req, res) => {
  const rel = String(req.body?.path || '');
  if (!library.entry(rel)) throw httpError(404, 'Morceau inconnu de la bibliothèque.');
  const patch = {};
  const b = req.body;
  if (b.bpm !== undefined) { const v = Number(b.bpm); patch.bpm = v > 20 && v < 400 ? Math.round(v * 100) / 100 : null; }
  if (b.gridStart !== undefined) { const v = Number(b.gridStart); patch.gridStart = Number.isFinite(v) && v >= 0 ? Math.round(v * 1000) / 1000 : null; }
  if (b.key !== undefined) patch.key = String(b.key).slice(0, 8);
  if (b.rating !== undefined) patch.rating = Math.max(0, Math.min(255, Math.round(Number(b.rating) || 0)));
  if (b.comment !== undefined) patch.comment = String(b.comment).slice(0, 300);
  // valeur posée à la main (Tap, 1er temps, ×2/÷2, édition du BPM) : un ré-import ne l'écrase pas. La détection auto (b.auto) ne bloque rien.
  if ((b.bpm !== undefined || b.gridStart !== undefined) && !b.auto) patch.edited = true;
  res.json(store.updateTrack(rel, patch));
}));

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

const MIME = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg' };

app.get('/api/audio', wrap(async (req, res) => {
  needNas();
  const rel = String(req.query.path || '');
  const abs = library.absPath(rel);
  if (!abs || !library.entry(rel)) throw httpError(404, 'Morceau inconnu de la bibliothèque.');
  const ext = path.extname(abs).toLowerCase();

  // AIFF : Chrome ne sait pas le décoder ; on le convertit à la volée en WAV (sans perte, mêmes échantillons)
  if (ext === '.aif' || ext === '.aiff') {
    res.setHeader('Content-Type', 'audio/wav');
    const ff = spawn('ffmpeg', ['-v', 'error', '-i', abs, '-f', 'wav', '-acodec', 'pcm_s16le', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    ff.stdout.pipe(res);
    ff.stderr.on('data', (d) => console.error(`ffmpeg : ${String(d).trim()}`));
    ff.on('error', (e) => { console.error('ffmpeg introuvable :', e.message); if (!res.headersSent) res.status(500).end(); else res.end(); });
    req.on('close', () => ff.kill('SIGKILL'));
    return;
  }

  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(abs, { acceptRanges: true, dotfiles: 'allow' });
}));

// ---------------------------------------------------------------------------
// Playlists
// ---------------------------------------------------------------------------

app.get('/api/playlists', (req, res) => res.json(store.playlists().map((p) => ({ id: p.id, name: p.name, folder: p.folder, source: p.source, count: p.tracks.length }))));

app.get('/api/playlists/:id', wrap(async (req, res) => {
  const p = store.playlist(req.params.id);
  if (!p) throw httpError(404, 'Playlist introuvable.');
  res.json({ ...p, items: p.tracks.map((rel) => { const e = library.entry(rel); return e ? withInfo(e) : { path: rel, missing: true, title: path.basename(rel), artist: '' }; }) });
}));

app.post('/api/playlists', wrap(async (req, res) => {
  const tracks = Array.isArray(req.body?.tracks) ? req.body.tracks.filter((t) => library.entry(t)) : [];
  res.json(store.createPlaylist({ name: req.body?.name, folder: req.body?.folder || '', tracks }));
}));

/** Copie modifiable d'une playlist (ex. une playlist Traktor). */
app.post('/api/playlists/:id/duplicate', wrap(async (req, res) => {
  const p = store.playlist(req.params.id);
  if (!p) throw httpError(404, 'Playlist introuvable.');
  res.json(store.createPlaylist({ name: req.body?.name || `${p.name} (mixarr)`, folder: '', tracks: p.tracks }));
}));

app.put('/api/playlists/:id', wrap(async (req, res) => {
  const p = store.playlist(req.params.id);
  if (!p) throw httpError(404, 'Playlist introuvable.');
  if (p.source === 'traktor') throw httpError(400, 'Les playlists Traktor sont en lecture seule : fais-en une copie mixarr pour la modifier.');
  res.json(store.updatePlaylist(p.id, req.body || {}));
}));

app.delete('/api/playlists/:id', wrap(async (req, res) => {
  const p = store.playlist(req.params.id);
  if (!p) throw httpError(404, 'Playlist introuvable.');
  if (p.source === 'traktor') throw httpError(400, 'Les playlists Traktor se mettent à jour en réimportant collection.nml.');
  store.deletePlaylist(p.id);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Traktor / Rekordbox
// ---------------------------------------------------------------------------

app.post('/api/import/traktor', express.text({ type: '*/*', limit: '200mb' }), wrap(async (req, res) => {
  const xml = String(req.body || '');
  if (!xml.trim()) throw httpError(400, 'Fichier vide.');
  if (!library.allPaths().length) throw httpError(400, 'Analyse d\'abord ta bibliothèque (bouton « Analyser le NAS ») : l\'import retrouve les morceaux du NAS d\'après la collection Traktor.');
  const report = require('./traktor').importNml(xml);
  console.log(`📥 Import Traktor : ${report.matched}/${report.entries} morceaux retrouvés, ${report.playlists} playlists, ${report.cuesImported} cues.`);
  res.json(report);
}));

app.post('/api/import/rekordbox', express.text({ type: '*/*', limit: '200mb' }), wrap(async (req, res) => {
  const xml = String(req.body || '');
  if (!xml.trim()) throw httpError(400, 'Fichier vide.');
  if (!library.allPaths().length) throw httpError(400, 'Analyse d\'abord ta bibliothèque (bouton « Analyser le NAS ») : l\'import retrouve les morceaux du NAS d\'après la collection Rekordbox.');
  const report = require('./rekordboxImport').importXml(xml);
  console.log(`📥 Import Rekordbox : ${report.matched}/${report.entries} morceaux retrouvés, ${report.playlists} playlists, ${report.cuesImported} cues.`);
  res.json(report);
}));

app.post('/api/export/rekordbox', wrap(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  const rep = require('./rekordbox').exportXml(ids);
  console.log(`📤 Export Rekordbox : ${rep.playlists} playlist(s), ${rep.tracks} morceau(x), ${rep.withGrid} avec grille.`);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="rekordbox.xml"');
  res.setHeader('X-Mixarr-Tracks', String(rep.tracks));
  res.setHeader('X-Mixarr-Missing', String(rep.missing.length));
  res.setHeader('X-Mixarr-Nobpm', String(rep.noBpmCount));
  res.setHeader('X-Mixarr-Nogrid', String(rep.noGrid));
  res.setHeader('X-Mixarr-Cues', String(rep.withCues));
  res.send(rep.xml);
}));

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------

app.get('/api/settings', (req, res) => res.json(store.settings()));
app.put('/api/settings', (req, res) => res.json(store.updateSettings(req.body || {})));

app.use('/api', (req, res) => res.status(404).json({ error: require('./i18n').tr(req, 'Route inconnue') }));
app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

const server = app.listen(PORT, () => {
  console.log(`🎛️  mixarr à l'écoute sur le port ${PORT} — musique : ${library.MUSIC_DIR}${AUTH_USER ? ' — mot de passe activé' : ''}`);
  if (!fs.existsSync(library.MUSIC_DIR)) console.log(`⚠️ Dossier musique introuvable : ${library.MUSIC_DIR}`);
});

const stop = () => { try { store.flush(); } catch (e) { /* rien */ } server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref(); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
