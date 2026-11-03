/**
 * Analyse audio pour la clé USB : 150 colonnes par seconde { low, mid, high, peak } (0-255), lues en flux via ffmpeg.
 * Mêmes filtres que rbxport (crates/rbl-analysis/src/waveform.rs, GPL-2.0-or-later) : passe-bas à un pôle à 200 Hz et 2 kHz ;
 * graves < 200 Hz, médiums 200 Hz - 2 kHz, aigus > 2 kHz ; chaque valeur est le pic de la bande sur la colonne.
 */
'use strict';

const { spawn } = require('child_process');

const COLUMNS_PER_SEC = 150;

/** Décode un fichier en mono flottant et calcule les colonnes. Renvoie { columns, sampleRate, durationSec }. */
function analyzeFile(file, sampleRate = 44100) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(sampleRate), '-f', 'f32le', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const perColumn = Math.max(1, Math.floor(sampleRate / COLUMNS_PER_SEC));
    const coeff = (cut) => Math.min(0.9999, Math.max(0, Math.exp(-2 * Math.PI * cut / sampleRate)));
    const lowC = coeff(200); const highC = coeff(2000);
    let lowS = 0; let highS = 0;
    let fill = 0; let lo = 0; let mi = 0; let hi = 0; let pk = 0;
    let total = 0;
    const columns = [];
    let carry = Buffer.alloc(0);
    let err = '';
    const toU8 = (v) => Math.floor(Math.min(1, Math.max(0, v)) * 255);
    const flush = () => { columns.push({ low: toU8(lo), mid: toU8(mi), high: toU8(hi), peak: toU8(pk) }); fill = 0; lo = mi = hi = pk = 0; };
    ff.stdout.on('data', (chunk) => {
      const buf = carry.length ? Buffer.concat([carry, chunk]) : chunk;
      const n = Math.floor(buf.length / 4);
      for (let i = 0; i < n; i++) {
        const x = Math.fround(buf.readFloatLE(i * 4));
        lowS = Math.fround(x * (1 - lowC) + lowS * lowC);
        highS = Math.fround(x * (1 - highC) + highS * highC);
        const h = x - highS; const m = highS - lowS;
        const al = lowS < 0 ? -lowS : lowS; if (al > lo) lo = al;
        const am = m < 0 ? -m : m; if (am > mi) mi = am;
        const ah = h < 0 ? -h : h; if (ah > hi) hi = ah;
        const ax = x < 0 ? -x : x; if (ax > pk) pk = ax;
        if (++fill === perColumn) flush();
      }
      total += n;
      carry = buf.subarray(n * 4);
    });
    ff.stderr.on('data', (d) => { err += d; });
    ff.on('error', (e) => reject(new Error(`ffmpeg introuvable : ${e.message}`)));
    ff.on('close', (code) => {
      if (code !== 0) return reject(new Error(`Décodage impossible (${String(err).trim().split('\n').pop() || code})`));
      if (fill) flush();
      resolve({ columns, sampleRate, durationSec: total / sampleRate });
    });
  });
}

/**
 * Grille constante pour PQTZ : un temps toutes les 60/bpm s, le 1er temps (temps « 1 ») à gridStart, de 0 à la fin du morceau.
 * Temps en millisecondes entières, tempo ×100 sur chaque temps.
 */
function constantGrid(bpm, gridStart, durationSec) {
  if (!bpm || !(bpm > 0) || !(durationSec > 0)) return [];
  const beat = 60 / bpm;
  const g = Number.isFinite(gridStart) ? gridStart : 0;
  const k0 = Math.ceil((0 - g) / beat - 1e-9); // premier temps à t >= 0
  const out = [];
  for (let k = k0; ; k++) {
    const t = g + k * beat;
    if (t >= durationSec) break;
    if (t < 0) continue;
    out.push({ beatNumber: (((k % 4) + 4) % 4) + 1, tempoX100: Math.round(bpm * 100), timeMs: Math.round(t * 1000) });
    if (out.length > 200000) break;
  }
  return out;
}

module.exports = { analyzeFile, constantGrid, COLUMNS_PER_SEC };
