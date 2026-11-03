/**
 * Fichiers d'analyse ANLZ0000.DAT / .EXT / .2EX d'une clé USB : grille de tempo, cues, formes d'onde.
 *
 * Portage en JavaScript de rbxport (crates/rbl-anlz : write.rs, encode.rs, cues.rs ; GPL-2.0-or-later, © Chris Le et
 * contributeurs, https://github.com/chrisle/rbxport). Les échelles et les « planchers » des formes d'onde viennent de
 * leurs mesures sur des fichiers écrits par rekordbox [OBS] — ce sont eux qui évitent qu'une NXS2 rejette l'aperçu.
 *
 * Tout est en gros-boutiste. Fichier : « PMAI », longueur d'en-tête, longueur totale, 16 octets constants, puis les sections
 * (fourcc, longueur d'en-tête, longueur totale, champs d'en-tête, données).
 */
'use strict';

const be16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16BE(v & 0xffff); return b; };
const be32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32BE(v >>> 0); return b; };
const HEADER_EXTRA = Buffer.from([0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
const FRAME = 12;

const section = (tag, header, payload) => ({ tag, header: Buffer.from(header), payload: Buffer.from(payload) });

function render(sections) {
  const lenHeader = FRAME + HEADER_EXTRA.length;
  const parts = [];
  let body = 0;
  for (const s of sections) {
    const lh = FRAME + s.header.length; const lt = lh + s.payload.length;
    parts.push(Buffer.from(s.tag, 'latin1'), be32(lh), be32(lt), s.header, s.payload);
    body += lt;
  }
  return Buffer.concat([Buffer.from('PMAI'), be32(lenHeader), be32(lenHeader + body), HEADER_EXTRA, ...parts]);
}

/** PPTH : le chemin de l'audio SUR LA CLÉ, en UTF-16BE terminé par un NUL. */
function pathSection(p) {
  const text = Buffer.concat([Buffer.from(p, 'utf16le').swap16(), Buffer.from([0, 0])]);
  return section('PPTH', be32(text.length), text);
}

/** PVBR sans table (401 mots à zéro) : ce que rekordbox écrit quand il n'y a rien à indexer ; un .DAT sans PVBR est refusé. */
const vbrZero = () => section('PVBR', be32(0), Buffer.alloc(401 * 4));

/** PQTZ : grille. Mot 0, puis 0x00080000 (décalage signé en ms dans les 16 bits bas), puis le nombre de temps ; 8 octets par temps. */
function gridSection(beats) {
  const payload = Buffer.alloc(beats.length * 8);
  beats.forEach((b, i) => { payload.writeUInt16BE(b.beatNumber, i * 8); payload.writeUInt16BE(b.tempoX100, i * 8 + 2); payload.writeUInt32BE(b.timeMs >>> 0, i * 8 + 4); });
  return section('PQTZ', Buffer.concat([be32(0), be32(0x00080000), be32(beats.length)]), payload);
}

function previewSection(tag, data) { return section(tag, Buffer.concat([be32(data.length), be32(0x00010000)]), data); }

function scrollSection(tag, stride, data) {
  const entries = stride ? Math.floor(data.length / stride) : 0;
  const trailer = tag === 'PWV5' ? 0x00960305 : tag === 'PWV4' ? 0 : 0x00960000;
  const header = [be32(stride), be32(entries)];
  if (tag !== 'PWV6') header.push(be32(trailer)); // l'en-tête de PWV6 fait 20 octets, pas 24
  return section(tag, Buffer.concat(header), data);
}

// ---------------------------------------------------------------------------
// Formes d'onde, à partir de colonnes { low, mid, high, peak } (0-255), 150 colonnes par seconde
// ---------------------------------------------------------------------------

const OVERVIEW_COLUMNS = 1200; const PREVIEW_COLUMNS = 400; const TINY_COLUMNS = 100;
const BAND_FULL_SCALE = 44;
const PWAV_CEILING = 25; const PWV2_CEILING = 15; const DETAIL_CEILING = 31;
const PWAV_FLOOR = 2; const PWV2_FLOOR = 1; const PWV2_MAX = 15;

function resample(cols, n) {
  if (!n) return [];
  if (!cols.length) return Array.from({ length: n }, () => ({ low: 0, mid: 0, high: 0, peak: 0 }));
  const out = [];
  for (let b = 0; b < n; b++) {
    const start = Math.floor(b * cols.length / n);
    const end = Math.min(cols.length, Math.max(start + 1, Math.floor((b + 1) * cols.length / n)));
    const l = { low: 0, mid: 0, high: 0, peak: 0 };
    for (let i = start; i < end; i++) { const c = cols[i]; if (c.low > l.low) l.low = c.low; if (c.mid > l.mid) l.mid = c.mid; if (c.high > l.high) l.high = c.high; if (c.peak > l.peak) l.peak = c.peak; }
    out.push(l);
  }
  return out;
}
const band = (v) => Math.floor(v * BAND_FULL_SCALE / 255);
const bandHeight = (c, ceiling) => Math.min(ceiling, Math.floor(Math.max(band(c.low), band(c.mid), band(c.high)) * ceiling / BAND_FULL_SCALE));
function detailHeight(c) { const FULL = 255 * 255; return Math.min(DETAIL_CEILING, Math.floor((DETAIL_CEILING * c.peak * c.peak + Math.floor(FULL / 2)) / FULL)); }
function monoByte(c, height) {
  const total = c.low + c.mid + c.high;
  const white = total ? Math.floor((c.high * 7 + Math.floor(total / 2)) / total) : 0;
  return ((Math.min(white, 7) << 5) | Math.min(height, DETAIL_CEILING)) & 0xff;
}
const devicePreviewByte = (b) => (b & 0xe0) | Math.max(b & 0x1f, PWAV_FLOOR);
const deviceTinyByte = (b) => Math.min(PWV2_MAX, Math.max(PWV2_FLOOR, b & 0x1f));

const pwav = (cols) => Buffer.from(resample(cols, PREVIEW_COLUMNS).map((c) => devicePreviewByte(monoByte(c, bandHeight(c, PWAV_CEILING)))));
const pwv2 = (cols) => Buffer.from(resample(cols, TINY_COLUMNS).map((c) => deviceTinyByte(bandHeight(c, PWV2_CEILING))));
const pwv3 = (cols) => Buffer.from(cols.map((c) => monoByte(c, detailHeight(c))));
function pwv4(cols) {
  const weigh = (v, num, den) => Math.min(127, Math.floor((v >> 1) * num / den));
  const out = Buffer.alloc(OVERVIEW_COLUMNS * 6);
  resample(cols, OVERVIEW_COLUMNS).forEach((c, i) => { out[i * 6] = c.peak >> 1; out[i * 6 + 3] = c.low >> 1; out[i * 6 + 4] = weigh(c.mid, 4, 5); out[i * 6 + 5] = weigh(c.high, 13, 20); });
  return out;
}
function pwv5Colour(c) {
  const low = 2 * c.low; const mid = 2 * c.mid; const high = 3 * c.high;
  const s = Math.max(low, mid, high);
  if (!s) return [0, 0, 0];
  const share = (v, full) => Math.floor((2 * full * v + s) / (2 * s));
  return [share(low, 7), share(mid, 5), share(high, 7)];
}
function pwv5(cols) {
  const out = Buffer.alloc(cols.length * 2);
  cols.forEach((c, i) => { const [r, g, b] = pwv5Colour(c); out.writeUInt16BE(((r << 13) | (g << 10) | (b << 7) | (detailHeight(c) << 2)) & 0xffff, i * 2); });
  return out;
}
function pwv6(cols) { const out = Buffer.alloc(OVERVIEW_COLUMNS * 3); resample(cols, OVERVIEW_COLUMNS).forEach((c, i) => { out[i * 3] = band(c.low); out[i * 3 + 1] = band(c.mid); out[i * 3 + 2] = band(c.high); }); return out; }
function pwv7(cols) { const out = Buffer.alloc(cols.length * 3); cols.forEach((c, i) => { out[i * 3] = c.low >> 1; out[i * 3 + 1] = c.mid >> 1; out[i * 3 + 2] = c.high >> 1; }); return out; }

// ---------------------------------------------------------------------------
// Cues
// ---------------------------------------------------------------------------

/** Palette des couleurs de cues des platines (65 codes) [rbxport : CDJ-3000 3.20, et la table de la référence]. */
const PALETTE = ['000000', '0000ff', '001cff', '0038ff', '0054ff', '0070ff', '008cff', '00a8ff', '00c4ff', '00e0ff', '00ffff', '00ffe8', '00ffd1', '00ffba', '00ffa3', '00ff8c', '00ff75',
  '00ff5e', '00ff47', '00ff30', '00ff1a', '00ff00', '1aff00', '33ff00', '4dff00', '66ff00', '80ff00', '99ff00', 'b3ff00', 'ccff00', 'e6ff00', 'ffff00', 'ffe800', 'ffd100', 'ffba00',
  'ffa300', 'ff8c00', 'ff7500', 'ff5e00', 'ff4700', 'ff3000', 'ff1a00', 'ff0000', 'ff0017', 'ff002e', 'ff0045', 'ff005c', 'ff0073', 'ff008a', 'ff00a1', 'ff00b8', 'ff00cf', 'ff00e6',
  'ff00ff', 'e600ff', 'cc00ff', 'b300ff', '9900ff', '8000ff', '6600ff', '4d00ff', '3300ff', '1a00ff', '000000', 'ffffff'].map((h) => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4), 16)]);

function exportColour(code, slot) {
  const def = { 1: 43, 9: 43, 2: 8, 10: 8, 3: 23, 11: 23, 4: 60, 12: 60 }[slot] || 0;
  return PALETTE[code === 0 ? def : code] || [0, 0, 0];
}

/** Code de palette le plus proche d'une couleur « #rrggbb » (1 à 62, les vraies teintes). */
function nearestColourCode(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return 0;
  const n = parseInt(m[1], 16); const r = n >> 16; const g = (n >> 8) & 255; const b = n & 255;
  let best = 0; let bd = Infinity;
  for (let i = 1; i <= 62; i++) { const [pr, pg, pb] = PALETTE[i]; const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}

/**
 * Listes de cues. cue = { slot (0 mémoire, 1-16 = A-P), timeMs, loopTimeMs|null, colorId, colorCode, comment, activeLoop, loopNum, loopDen }.
 * .DAT : mémoire + hot cues A-C (PCOB). .EXT : hot cues D-P en PCOB, puis toutes les listes en PCO2 (couleur, commentaire).
 */
function cueSections(cues, extended) {
  const out = [];
  for (const modern of [false, true]) {
    if (modern && !extended) continue;
    for (const hot of [true, false]) {
      const list = cues.filter((c) => (c.slot !== 0) === hot && (modern || (extended ? hot && c.slot > 3 : c.slot <= 3)));
      const count = Math.min(0xffff, list.length);
      const header = Buffer.alloc(modern ? 8 : 12);
      header.writeUInt32BE(hot ? 1 : 0, 0);
      header.writeUInt16BE(count, modern ? 4 : 6);
      if (!modern) header.writeUInt32BE(hot || count === 0 ? 0xffffffff : count - 1, 8);
      const entries = list.map((c, index) => {
        const comment = c.comment ? Buffer.concat([Buffer.from(c.comment, 'utf16le').swap16(), Buffer.from([0, 0])]) : Buffer.alloc(0);
        const len = modern ? 88 + comment.length : 56;
        const e = Buffer.alloc(len);
        e.write(modern ? 'PCP2' : 'PCPT', 0, 'latin1');
        e.writeUInt32BE(modern ? 16 : 28, 4);
        e.writeUInt32BE(len, 8);
        e.writeUInt32BE(c.slot, 12);
        const at = modern ? 16 : 28;
        e[at] = c.loopTimeMs != null ? 2 : 1;
        e[at + 1] = 0; e[at + 2] = 3; e[at + 3] = 232;
        e.writeUInt32BE(c.timeMs >>> 0, at + 4);
        e.writeUInt32BE(c.loopTimeMs != null ? c.loopTimeMs >>> 0 : 0xffffffff, at + 8);
        if (modern) {
          e[28] = c.colorId || 0; e[29] = 1;
          e.writeUInt16BE(c.loopNum || 0, 36); e.writeUInt16BE(c.loopDen || 0, 38);
          e.writeUInt32BE(comment.length, 40);
          comment.copy(e, 44);
          e[44 + comment.length] = c.colorCode || 0;
          const rgb = exportColour(c.colorCode || 0, c.slot);
          e[45 + comment.length] = rgb[0]; e[46 + comment.length] = rgb[1]; e[47 + comment.length] = rgb[2];
        } else {
          e.writeUInt32BE(c.activeLoop ? 4 : 0, 16);
          e.writeUInt32BE(0x10000, 20);
          e.writeUInt16BE(hot || index === 0 ? 0xffff : index - 1, 24);
          e.writeUInt16BE(hot || index + 1 === count ? 0xffff : index + 1, 26);
        }
        return e;
      });
      out.push(section(modern ? 'PCO2' : 'PCOB', header, Buffer.concat(entries)));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fichiers
// ---------------------------------------------------------------------------

/**
 * Les trois fichiers d'un morceau pour la clé, dans l'ordre des sections de rekordbox.
 * @param {string} usbPath chemin de l'audio sur la clé (« /Contents/… »)
 * @param {{beatNumber, tempoX100, timeMs}[]} beats
 * @param {{low, mid, high, peak}[]} columns 150 colonnes par seconde
 * @param {object[]} cues voir cueSections
 */
function author(usbPath, beats, columns, cues) {
  const dat = render([pathSection(usbPath), vbrZero(), gridSection(beats), previewSection('PWAV', pwav(columns)), previewSection('PWV2', pwv2(columns)), ...cueSections(cues, false)]);
  const ext = render([pathSection(usbPath), scrollSection('PWV3', 1, pwv3(columns)), scrollSection('PWV5', 2, pwv5(columns)), scrollSection('PWV4', 6, pwv4(columns)), ...cueSections(cues, true)]);
  const twoEx = render([pathSection(usbPath), scrollSection('PWV7', 3, pwv7(columns)), scrollSection('PWV6', 3, pwv6(columns))]);
  return { dat, ext, twoEx };
}

/**
 * Dossier d'analyse calculé par la platine à partir du chemin de l'audio (CDJ-3000 3.20, vérifié sur 61 morceaux par rbxport) :
 * « /PIONEER/USBANLZ/P{shard}/{hash} ». Doit être calculé sur le chemin FINAL sur la clé.
 */
function analysisDirectory(audioPath, root = 'PIONEER') {
  let h = 0;
  for (let i = 0; i < audioPath.length; i++) {
    const c = audioPath.charCodeAt(i);
    if (c === 0) break;
    h = (Math.imul(h, 0x34f5501d) + Math.imul(c, 0x93b6)) >>> 0;
  }
  const hash = h % 0x30d43;
  const shard = [0, 2, 6, 7, 9, 13, 16].reduce((s, bit, i) => s | (((hash >>> bit) & 1) << i), 0);
  return `/${root}/USBANLZ/P${shard.toString(16).toUpperCase().padStart(3, '0')}/${hash.toString(16).toUpperCase().padStart(8, '0')}`;
}

module.exports = { author, analysisDirectory, cueSections, nearestColourCode, exportColour, gridSection, pwav, pwv2, pwv3, pwv4, pwv5, pwv6, pwv7 };
