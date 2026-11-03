/**
 * Analyse audio côté serveur : BPM et grille, tonalité, volume (EBU R128), premier et dernier son.
 *
 * Le calcul est fait par analyzer/fadarr-analyze (C++), qui reprend les analyseurs de Mixxx (qm-dsp, GPL-2.0-or-later) ;
 * ffmpeg décode le morceau et mesure le volume dans le même passage (filtre ebur128).
 * Les résultats sont rangés dans la base (tracks[rel].analysis) et ne remplissent que ce qui manque :
 * une grille importée de Traktor / Rekordbox ou posée à la main n'est jamais remplacée.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const store = require('./store');
const library = require('./library');

const VERSION = 1; // à augmenter si l'algorithme change : les morceaux seront ré-analysés
const RATE = 44100;
const JOBS = Math.max(1, Math.min(8, Number(process.env.FADARR_ANALYSIS_JOBS) || 2));

/** Tonalités qm-dsp / Mixxx (1-12 majeures depuis do, 13-24 mineures) -> notation stockée par fadarr. */
const KEYS = [null, 'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B',
  'Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];

let binary;
function findBinary() {
  if (binary !== undefined) return binary;
  const candidates = [process.env.FADARR_ANALYZER, '/usr/local/bin/fadarr-analyze', path.join(__dirname, '..', 'analyzer', 'fadarr-analyze')].filter(Boolean);
  binary = candidates.find((p) => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch (_) { return false; } }) || null;
  return binary;
}
const available = () => Boolean(findBinary());

/** Analyse un fichier. Renvoie { bpm, gridStart, key, lufs, peak, start, end, duration }. */
function analyzeFile(abs) {
  const bin = findBinary();
  if (!bin) return Promise.reject(new Error('Analyseur absent (analyzer/fadarr-analyze) : voir le README.'));
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-nostdin', '-nostats', '-hide_banner', '-i', abs, '-vn', '-af', 'ebur128=framelog=quiet:peak=true',
      '-ac', '2', '-ar', String(RATE), '-f', 'f32le', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const an = spawn(bin, [String(RATE)], { stdio: ['pipe', 'pipe', 'pipe'] });
    let err = ''; let out = ''; let anErr = '';
    ff.stdout.pipe(an.stdin);
    an.stdin.on('error', () => { /* l'analyseur s'est arrêté : son code de sortie le dira */ });
    ff.stderr.on('data', (d) => { err += d; if (err.length > 200000) err = err.slice(-100000); });
    an.stdout.on('data', (d) => { out += d; });
    an.stderr.on('data', (d) => { anErr += d; });
    ff.on('error', (e) => { an.kill(); reject(new Error(`ffmpeg introuvable : ${e.message}`)); });
    an.on('error', (e) => { ff.kill(); reject(new Error(`Analyseur inutilisable : ${e.message}`)); });
    let ffCode = null;
    ff.on('close', (code) => { ffCode = code; });
    an.on('close', (code) => {
      const finish = () => {
        if (ffCode !== 0) return reject(new Error(`Décodage impossible (${String(err).trim().split('\n').pop() || ffCode})`));
        if (code !== 0) return reject(new Error(`Analyse impossible (${anErr.trim() || code})`));
        let r;
        try { r = JSON.parse(out); } catch (_) { return reject(new Error('Réponse de l\'analyseur illisible.')); }
        const lufs = /Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+|-inf) LUFS/.exec(err);
        const peak = /True peak:\s*\n\s*Peak:\s*(-?[\d.]+|-inf) dBFS/.exec(err);
        const num = (m) => (m && m[1] !== '-inf' && Number.isFinite(Number(m[1])) ? Number(m[1]) : null);
        let gridStart = null;
        if (r.bpm > 0) {
          const beat = 60 / r.bpm;
          gridStart = ((Number(r.firstBeatSec) % beat) + beat) % beat; // premier temps >= 0
        }
        resolve({
          bpm: r.bpm > 0 ? Math.round(r.bpm * 100) / 100 : null,
          gridStart: gridStart != null ? Math.round(gridStart * 1000) / 1000 : null,
          key: KEYS[r.key] || null,
          lufs: num(lufs),
          peak: num(peak),
          start: Math.round((r.firstSoundSec || 0) * 1000) / 1000,
          end: Math.round((r.lastSoundSec || 0) * 1000) / 1000,
          duration: Math.round((r.durationSec || 0) * 1000) / 1000
        });
      };
      if (ffCode !== null) finish(); else ff.once('close', finish);
    });
  });
}

/** Résultat encore valable pour ce fichier ? (même version d'algorithme, fichier inchangé) */
function fresh(rel) {
  const a = store.trackInfo(rel)?.analysis;
  const e = library.entry(rel);
  return Boolean(a && e && a.v === VERSION && a.mtime === (e.added || null));
}

/** Range le résultat et ne remplit que ce qui manque (grille, tonalité). */
function apply(rel, r) {
  const info = store.trackInfo(rel) || {};
  const e = library.entry(rel) || {};
  const patch = { analysis: { v: VERSION, at: Date.now(), mtime: e.added || null, ...r } };
  // grille remplaçable : absente, ou détectée automatiquement (navigateur / analyse). Jamais une grille importée ou posée à la main ;
  // les anciennes bases n'ont pas le marqueur gridManual : un morceau « edited » est alors laissé tel quel.
  const trusted = info.traktor || info.rekordbox || info.gridManual || (info.edited && !info.gridAuto);
  if (r.bpm && (!Number.isFinite(info.gridStart) || !trusted)) {
    if (!(trusted && info.bpm && Math.abs(info.bpm - r.bpm) / r.bpm > 0.005)) {
      patch.bpm = r.bpm; patch.gridStart = r.gridStart; patch.gridAuto = true;
    }
  }
  if (r.key && ((!info.key && !e.key) || info.keyAuto)) { patch.key = r.key; patch.keyAuto = true; }
  return store.updateTrack(rel, patch);
}

// ---------------------------------------------------------------------------
// File d'attente (une analyse à la fois par cœur demandé, en arrière-plan)
// ---------------------------------------------------------------------------

const queue = [];
const queued = new Set();
const waiting = new Map(); // rel -> [{ resolve, reject }] (analyse demandée par un deck)
let running = 0;
const state = { done: 0, total: 0, failed: 0, current: [], errors: [] };

function status() {
  return { available: available(), running: running > 0 || queue.length > 0, done: state.done, total: state.total, failed: state.failed,
    current: state.current.slice(), errors: state.errors.slice(-20), jobs: JOBS };
}

function pump() {
  while (running < JOBS && queue.length) {
    const rel = queue.shift();
    running++;
    state.current.push(rel);
    (async () => {
      let res = null; let fail = null;
      try {
        if (!library.entry(rel)) throw new Error('Morceau inconnu de la bibliothèque.');
        res = apply(rel, await analyzeFile(library.absPath(rel)));
      } catch (e) {
        fail = e;
        state.failed++;
        state.errors.push({ path: rel, error: e.message });
      }
      state.done++;
      running--;
      queued.delete(rel);
      state.current = state.current.filter((x) => x !== rel);
      for (const w of waiting.get(rel) || []) (fail ? w.reject(fail) : w.resolve(res));
      waiting.delete(rel);
      if (!running && !queue.length) { state.total = state.done; } // fin de série : le compteur reste visible jusqu'à la suivante
      pump();
    })();
  }
}

/** Met des morceaux en file. force : ré-analyse même s'ils le sont déjà. @returns nombre ajoutés */
function enqueue(paths, { force = false, first = false } = {}) {
  if (!available()) throw Object.assign(new Error('Analyseur absent : reconstruis l\'image Docker (ou lance npm run build:analyzer).'), { status: 503 });
  if (!running && !queue.length) { state.done = 0; state.total = 0; state.failed = 0; state.errors = []; }
  let n = 0;
  for (const rel of paths) {
    if (typeof rel !== 'string' || queued.has(rel) || !library.entry(rel)) continue;
    if (!force && fresh(rel)) continue;
    queued.add(rel);
    if (first) queue.unshift(rel); else queue.push(rel);
    n++;
  }
  state.total += n;
  pump();
  return n;
}

/** Analyse un morceau tout de suite (chargé dans un deck) et attend le résultat. */
function analyzeNow(rel) {
  if (fresh(rel)) return Promise.resolve(store.trackInfo(rel));
  return new Promise((resolve, reject) => {
    const list = waiting.get(rel) || [];
    list.push({ resolve, reject });
    waiting.set(rel, list);
    if (queued.has(rel)) {
      const i = queue.indexOf(rel);
      if (i > 0) { queue.splice(i, 1); queue.unshift(rel); } // passe devant
    } else {
      try { enqueue([rel], { first: true }); } catch (e) { waiting.delete(rel); reject(e); }
      if (!queued.has(rel)) { waiting.delete(rel); resolve(store.trackInfo(rel)); }
    }
  });
}

/** Pour l'interface : ce que l'analyse apporte à une ligne de la bibliothèque. */
function summary(info) {
  const a = info && info.analysis;
  if (!a) return { lufs: null, firstSound: null, analyzed: false };
  return { lufs: a.lufs, peak: a.peak, firstSound: a.start, analyzed: a.v === VERSION };
}

module.exports = { available, analyzeFile, enqueue, analyzeNow, status, summary, KEYS, VERSION };
