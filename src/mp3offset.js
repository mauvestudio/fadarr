/**
 * Décalage entre la position d'un MP3 dans fadarr (décodage ffmpeg / Chrome, qui retire le délai d'encodage d'après
 * l'en-tête « gapless ») et sa position sur les CDJ / dans Rekordbox.
 *
 * Mesuré sur une vraie clé (399 morceaux, grilles Rekordbox comparées à l'analyse de fadarr, AIFF/WAV comme témoins) :
 *   - MP3 encodé par LAME avec en-tête Xing/Info : la platine est ~50 ms plus loin que fadarr (64 fichiers) ;
 *   - autre encodeur (ffmpeg : Lavc / Lavf) avec en-tête : ~25 ms, soit les 1105 échantillons retirés par ffmpeg (20 fichiers) ;
 *   - sans en-tête : 0.
 * Même constat que Mixxx (src/library/rekordbox/rekordboxfeature.cpp, mp3guessenc : 50 ms pour un MP3 LAME « vérifié »).
 * Position sur la clé = position fadarr + offsetMs ; le réglage « décalage MP3 » s'ajoute pour corriger à la main.
 */
'use strict';

const fs = require('fs');

const LAME_MS = 50;
const OTHER_MS = 25;
const cache = new Map(); // chemin -> { key, ms }

/** En-tête de la première trame audio (après l'ID3v2) : { tag: 'Xing' | 'Info' | 'VBRI' | null, encoder }. */
function mp3Header(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const read = (pos, n) => { const b = Buffer.alloc(n); const got = fs.readSync(fd, b, 0, n, pos); return b.subarray(0, got); };
    let pos = 0;
    const h = read(0, 10);
    if (h.length === 10 && h.toString('latin1', 0, 3) === 'ID3') {
      pos = 10 + (((h[6] & 127) << 21) | ((h[7] & 127) << 14) | ((h[8] & 127) << 7) | (h[9] & 127)) + ((h[5] & 0x10) ? 10 : 0);
    }
    const b = read(pos, 16384);
    let i = 0;
    while (i + 4 < b.length && !(b[i] === 0xff && (b[i + 1] & 0xe0) === 0xe0)) i++;
    const frame = b.subarray(i, i + 600).toString('latin1');
    return { tag: (frame.match(/Xing|Info|VBRI/) || [null])[0], encoder: (frame.match(/LAME|Lavc|Lavf|GOGO/) || [null])[0] };
  } finally { fs.closeSync(fd); }
}

/** Décalage automatique (ms) pour un fichier ; 0 si ce n'est pas un MP3 ou s'il est illisible. */
function offsetMs(abs) {
  if (!abs || !/\.mp3$/i.test(abs)) return 0;
  let st; try { st = fs.statSync(abs); } catch (_) { return 0; }
  const key = `${st.size}:${st.mtimeMs}`;
  const c = cache.get(abs);
  if (c && c.key === key) return c.ms;
  let ms = 0;
  try {
    const h = mp3Header(abs);
    if (h.tag === 'Xing' || h.tag === 'Info') ms = h.encoder === 'LAME' ? LAME_MS : OTHER_MS;
    else if (h.tag === 'VBRI') ms = OTHER_MS;
  } catch (_) { ms = 0; }
  if (cache.size > 50000) cache.clear();
  cache.set(abs, { key, ms });
  return ms;
}

/** Décalage total (s) à ajouter à une position fadarr pour obtenir la position Rekordbox / CDJ. */
function deviceShift(abs, settings) {
  if (!/\.mp3$/i.test(String(abs || ''))) return 0;
  return (offsetMs(abs) + (Number(settings && settings.mp3OffsetMs) || 0)) / 1000;
}

module.exports = { offsetMs, deviceShift, mp3Header };
