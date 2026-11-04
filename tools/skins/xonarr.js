/**
 * Génère public/skins/xonarr.svg : façade de la « Xonarr :26 » (table 2 voies inspirée de la disposition d'une Xone:96).
 * Vectoriel, sans logo ni police de marque. Coordonnées reprises d'une photo de face (1216 × 1444), voies 1-2 et les deux
 * sections de filtres gardées ; les voies stéréo A/B, les retours C/D et les voies 3-4 sont retirées.
 * Commandes branchées : data-ctl (ch1-gain, ch1-hi, ch1-himid, ch1-lomid, ch1-low, ch1-fader, ch1-filt, ch1-xfa, f1-res, f1-freq…).
 *
 * Usage : node tools/skins/xonarr.js  ->  public/skins/xonarr.svg
 */
'use strict';

const fs = require('fs');
const path = require('path');

// photo -> façade : 290-670 (filtre 1 + voies 1-2) puis 915-1216 (vu-mètres, filtre 2, master)
const X = (x) => (x <= 680 ? x - 280 : x - 530);
const Y = (y) => y - 15;
const W = 1216 - 530 + 8; const H = 1425 - 15;
const F = "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const out = []; const add = (s) => out.push(s);
const r1 = (v) => Math.round(v * 10) / 10;
const INK = '#141414';

function text(x, y, s, { size = 9.5, weight = 700, anchor = 'middle', fill = INK, spacing = 0.1, rot = 0 } = {}) {
  const t = rot ? ` transform="rotate(${rot} ${r1(x)} ${r1(y)})"` : '';
  add(`<text x="${r1(x)}" y="${r1(y)}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}" letter-spacing="${spacing}"${t}>${s}</text>`);
}
const T = (px, py, s, o) => text(X(px), Y(py), s, o);
const polar = (cx, cy, r, deg) => { const a = (deg - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };

/** Graduation : traits noirs fins sur 300°, traits plus longs aux butées et au centre. */
function ticks(cx, cy, r0, len, n = 11, { from = -150, to = 150, center = true } = {}) {
  for (let i = 0; i < n; i++) {
    const d = from + (to - from) * i / (n - 1);
    const long = i === 0 || i === n - 1 || (center && i === (n - 1) / 2);
    const [x0, y0] = polar(cx, cy, r0, d); const [x1, y1] = polar(cx, cy, r0 + (long ? len * 1.6 : len), d);
    add(`<line x1="${r1(x0)}" y1="${r1(y0)}" x2="${r1(x1)}" y2="${r1(y1)}" stroke="${INK}" stroke-width="${long ? 1.5 : 1.1}"/>`);
  }
}

/**
 * Potard noir cranté façon table anglaise. size : rayon. kind : 'eq' (gros, cannelé), 'small'.
 * Le groupe .rot tourne de -150° à +150°.
 */
function knob(px, py, r, ctl = '', value = 0, { kind = 'eq', tick = true, n = 11, dot = true } = {}) {
  const cx = X(px); const cy = Y(py);
  if (tick) ticks(cx, cy, r + 3, kind === 'eq' ? 5 : 4, n);
  if (dot) { const [x, y] = polar(cx, cy, r + 3, 0); add(`<circle cx="${r1(x)}" cy="${r1(y - 4)}" r="2.6" fill="${INK}"/>`); }
  add(`<g class="knob"${ctl ? ` data-ctl="${ctl}"` : ''} data-cx="${r1(cx)}" data-cy="${r1(cy)}">`);
  add(`<circle cx="${r1(cx + 2)}" cy="${r1(cy + 4)}" r="${r + 2}" fill="#000" opacity=".38" filter="url(#blur3)"/>`);
  // jupe cannelée
  const flutes = kind === 'eq' ? 28 : 22;
  let d = '';
  for (let i = 0; i < flutes; i++) {
    const a0 = (i / flutes) * 360; const a1 = ((i + 0.55) / flutes) * 360;
    const [x0, y0] = polar(cx, cy, r, a0); const [x1, y1] = polar(cx, cy, r, a1);
    const [x2, y2] = polar(cx, cy, r - 2.2, a1); const [x3, y3] = polar(cx, cy, r - 2.2, a0);
    d += `M${r1(x0)} ${r1(y0)}L${r1(x1)} ${r1(y1)}L${r1(x2)} ${r1(y2)}L${r1(x3)} ${r1(y3)}Z`;
  }
  add(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r - 1}" fill="url(#skirt)"/>`);
  add(`<path d="${d}" fill="#2c2d30"/>`);
  add(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r * 0.74)}" fill="url(#cap)" stroke="#000" stroke-width=".8"/>`);
  add(`<ellipse cx="${r1(cx - r * 0.2)}" cy="${r1(cy - r * 0.32)}" rx="${r1(r * 0.42)}" ry="${r1(r * 0.24)}" fill="#fff" opacity=".1"/>`);
  add(`<g class="rot" transform="rotate(${value * 150} ${r1(cx)} ${r1(cy)})"><rect x="${r1(cx - 1.5)}" y="${r1(cy - r + 1)}" width="3" height="${r1(r * 0.72)}" rx="1.3" fill="#f4f4f4"/></g>`);
  add('</g>');
}

/** Gros bouton rond (CUE, HPF/BPF/LPF, FILTER, MIDI…) avec anneau lumineux. ring : null (éteint) ou couleur. */
function rbtn(px, py, r, ctl = '', ring = null, { inner = null } = {}) {
  const cx = X(px); const cy = Y(py);
  add(`<g class="rbtn"${ctl ? ` data-ctl="${ctl}"` : ''}>`);
  add(`<circle cx="${r1(cx + 1.5)}" cy="${r1(cy + 4)}" r="${r + 3}" fill="#000" opacity=".4" filter="url(#blur3)"/>`);
  add(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r + 3.5}" fill="#9a9a9a"/>`);
  // anneau lumineux : data-col = couleur allumée ; le skin l'allume / l'éteint (stroke et halo)
  const col = ring || (/^f\d-(hpf|bpf|lpf)$/.test(ctl) ? '#f5a623' : /^f\d-on$/.test(ctl) ? '#3b82f6' : '#e5e5e5');
  add(`<circle class="glow" cx="${r1(cx)}" cy="${r1(cy)}" r="${r + 6}" fill="${col}" opacity="${ring ? 0.45 : 0}" filter="url(#blur4)"/>`);
  add(`<circle class="ring" data-col="${col}" cx="${r1(cx)}" cy="${r1(cy)}" r="${r + 2.4}" fill="none" stroke="${ring || '#111'}" stroke-width="4"/>`);
  add(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r}" fill="url(#rbtn)"/>`);
  add(`<ellipse cx="${r1(cx - r * 0.15)}" cy="${r1(cy - r * 0.4)}" rx="${r1(r * 0.6)}" ry="${r1(r * 0.3)}" fill="#fff" opacity=".09"/>`);
  if (inner) add(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(r * 0.45)}" fill="none" stroke="${inner}" stroke-width="3"/>`);
  add('</g>');
}

function smallBtn(px, py, r, ctl = '') { const cx = X(px); const cy = Y(py); add(`<g class="sbtn"${ctl ? ` data-ctl="${ctl}"` : ''}><circle cx="${r1(cx + 1)}" cy="${r1(cy + 2)}" r="${r + 1.5}" fill="#000" opacity=".4" filter="url(#blur2)"/><circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r}" fill="url(#rbtn)" stroke="#000"/><ellipse cx="${r1(cx)}" cy="${r1(cy - r * 0.4)}" rx="${r1(r * 0.55)}" ry="${r1(r * 0.28)}" fill="#fff" opacity=".12"/></g>`); }

/** Inverseur à levier (3 positions : -1, 0, 1), chromé, vu de dessus. */
function toggle(px, py, ctl = '', pos = 0) {
  const cx = X(px); const cy = Y(py);
  add(`<g class="tgl"${ctl ? ` data-ctl="${ctl}"` : ''} data-cx="${r1(cx)}" data-cy="${r1(cy)}">`);
  add(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="9" fill="url(#nut)" stroke="#666" stroke-width=".8"/><circle cx="${r1(cx)}" cy="${r1(cy)}" r="5" fill="#2a2a2a"/>`);
  add(`<g class="lever" transform="rotate(${pos * 35} ${r1(cx)} ${r1(cy)})"><rect x="${r1(cx - 2.6)}" y="${r1(cy - 13)}" width="5.2" height="13" rx="2.6" fill="url(#lever)"/><circle cx="${r1(cx)}" cy="${r1(cy - 12)}" r="3.4" fill="url(#lever)"/></g>`);
  add('</g>');
}

/** Colonne de LED (une par seuil en dB, de haut en bas). colours : seuil -> couleur allumée. */
function ledColumn(px, pyTop, step, dbs, ctl = '', lit = 0) {
  const cx = X(px);
  add(`<g class="meter"${ctl ? ` data-ctl="${ctl}"` : ''}>`);
  dbs.forEach((db, i) => {
    const y = Y(pyTop + i * step);
    const c = db >= 6 ? '#ff3b30' : db >= -3 ? '#3b9bff' : '#4ade80';
    const on = dbs.length - i <= lit;
    add(`<circle cx="${r1(cx)}" cy="${r1(y)}" r="4.6" fill="#1b1b1b"/><circle class="seg" data-db="${db}" cx="${r1(cx)}" cy="${r1(y)}" r="4" fill="${c}" opacity="${on ? 1 : 0}"/>`);
  });
  add('</g>');
}

function fader(px, pyTop, len, ctl, value) {
  const cx = X(px); const yTop = Y(pyTop);
  add(`<g class="fader" data-ctl="${ctl}" data-top="${r1(yTop)}" data-len="${len}">`);
  for (let i = 0; i <= 12; i++) { const y = yTop + len * i / 12; add(`<line x1="${r1(cx - 32)}" y1="${r1(y)}" x2="${r1(cx - 18)}" y2="${r1(y)}" stroke="${INK}" stroke-width="1.1"/>`); }
  add(`<rect x="${r1(cx - 4)}" y="${r1(yTop - 14)}" width="8" height="${len + 28}" rx="4" fill="#0b0b0b"/>`);
  add(`<circle cx="${r1(cx)}" cy="${r1(yTop - 26)}" r="6" fill="#1a1a1a"/><circle cx="${r1(cx)}" cy="${r1(yTop + len + 26)}" r="6" fill="#1a1a1a"/>`);
  const y = yTop + len * (1 - value);
  add(`<g class="cap" transform="translate(0 ${r1(y - yTop)})">`);
  add(`<rect x="${r1(cx - 34)}" y="${r1(yTop - 9)}" width="68" height="26" rx="4" fill="#000" opacity=".45" filter="url(#blur3)"/>`);
  add(`<path d="M${r1(cx - 35)} ${r1(yTop - 12)}h70l-4 22h-62z" fill="url(#faderCap)" stroke="#000" stroke-width=".8"/>`);
  add(`<rect x="${r1(cx - 33)}" y="${r1(yTop - 10.5)}" width="66" height="5" rx="2" fill="#fff" opacity=".14"/>`);
  add(`<rect x="${r1(cx - 30)}" y="${r1(yTop - 1.5)}" width="60" height="2.6" rx="1.3" fill="#e8e8e8"/>`);
  add('</g></g>');
}

function screw(px, py) { const cx = X(px); const cy = Y(py); add(`<circle cx="${r1(cx)}" cy="${r1(cy + 1)}" r="8" fill="#000" opacity=".35" filter="url(#blur2)"/><circle cx="${r1(cx)}" cy="${r1(cy)}" r="7" fill="url(#screw)"/><circle cx="${r1(cx)}" cy="${r1(cy)}" r="2.6" fill="#0a0a0a"/>`); }
const line = (x0, y0, x1, y1, w = 1.6) => add(`<line x1="${r1(X(x0))}" y1="${r1(Y(y0))}" x2="${r1(X(x1))}" y2="${r1(Y(y1))}" stroke="${INK}" stroke-width="${w}" stroke-linecap="round"/>`);
const path_ = (d, w = 1.6) => add(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`);

// ---------------------------------------------------------------------------
add(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${F}">`);
add(`<defs>
  <filter id="blur2" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.4"/></filter>
  <filter id="blur3" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.6"/></filter>
  <filter id="blur4" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4.5"/></filter>
  <filter id="brushed" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".003 .95" numOctaves="2" seed="5" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .09 0"/></filter>
  <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="9" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .05 0"/></filter>
  <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cfd0d2"/><stop offset=".5" stop-color="#c2c3c5"/><stop offset="1" stop-color="#b4b5b7"/></linearGradient>
  <linearGradient id="bezel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2e3e5"/><stop offset="1" stop-color="#77797c"/></linearGradient>
  <radialGradient id="skirt" cx=".42" cy=".35" r=".8"><stop offset="0" stop-color="#3a3b3e"/><stop offset=".75" stop-color="#151617"/><stop offset="1" stop-color="#050505"/></radialGradient>
  <radialGradient id="cap" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#3b3c40"/><stop offset=".6" stop-color="#18191b"/><stop offset="1" stop-color="#070708"/></radialGradient>
  <radialGradient id="rbtn" cx=".45" cy=".35" r=".85"><stop offset="0" stop-color="#3a3b3f"/><stop offset=".7" stop-color="#151618"/><stop offset="1" stop-color="#050506"/></radialGradient>
  <linearGradient id="faderCap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4b4f"/><stop offset=".45" stop-color="#1d1e20"/><stop offset=".55" stop-color="#111213"/><stop offset="1" stop-color="#2b2c2f"/></linearGradient>
  <radialGradient id="screw" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#555"/><stop offset="1" stop-color="#0e0e0e"/></radialGradient>
  <radialGradient id="nut" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#b9bbbe"/><stop offset="1" stop-color="#7d8084"/></radialGradient>
  <linearGradient id="lever" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a8d91"/><stop offset=".45" stop-color="#ffffff"/><stop offset="1" stop-color="#9da0a4"/></linearGradient>
  <radialGradient id="jack" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000"/><stop offset=".55" stop-color="#111"/><stop offset=".7" stop-color="#d5d6d8"/><stop offset=".85" stop-color="#8c8f93"/><stop offset="1" stop-color="#2a2a2a"/></radialGradient>
</defs>`);

// --- plaque grise ---
add(`<rect x="0" y="0" width="${W}" height="${H}" rx="12" fill="url(#bezel)"/>`);
add(`<rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="10" fill="url(#panel)"/>`);
add(`<rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="10" filter="url(#brushed)"/>`);
add(`<rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="10" filter="url(#grain)"/>`);
add(`<rect x="3.5" y="3.5" width="${W - 7}" height="${H - 7}" rx="10" fill="none" stroke="#f2f2f3" stroke-opacity=".7"/>`);

// séparations
for (const x of [415, 540, 665]) line(x, 88, x, 1236, 1.4);
line(1060, 88, 1060, 1420, 1.4);
path_(`M${X(298)} ${Y(625)}V${Y(612)}H${X(305)}`); // coin CRUNCH 1

// marque
T(478, 66, 'XONARR', { size: 25, weight: 800, spacing: 3 });
T(985, 282, ':26', { size: 56, weight: 300, spacing: -1 });

// ============ filtre 1 ============
add(`<circle cx="${X(311)}" cy="${Y(618)}" r="4.5" fill="#e11d1d"/>`); T(352, 624, 'CRUNCH', { size: 12 });
knob(352, 668, 16, 'f1-crunch', -0.2, { kind: 'small', n: 11, dot: false });
['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].forEach((s, i) => { const [x, y] = polar(X(352), Y(668), 30, -150 + i * 30); text(x, y + 2.5, s, { size: 6.5, weight: 600 }); });
path_(`M${X(298)} ${Y(1076)}V${Y(718)}Q${X(298)} ${Y(712)} ${X(304)} ${Y(712)}H${X(350)}`);
T(385, 742, 'RES', { size: 8.5 }); knob(355, 763, 22, 'f1-res', 0.1, { n: 7 }); T(322, 806, 'MILD', { size: 7.5 }); T(392, 806, 'WILD', { size: 7.5 });
T(323, 838, 'HPF', { size: 9 }); path_(`M${X(313)} ${Y(851)}H${X(318)}L${X(325)} ${Y(843)}H${X(336)}`, 1.2);
rbtn(357, 868, 22, 'f1-hpf');
line(357, 897, 357, 912); T(323, 918, 'BPF', { size: 9 }); path_(`M${X(313)} ${Y(931)}H${X(318)}L${X(322)} ${Y(922)}L${X(328)} ${Y(922)}L${X(332)} ${Y(931)}H${X(336)}`, 1.2);
rbtn(357, 948, 22, 'f1-bpf');
line(357, 977, 357, 993); T(323, 1000, 'LPF', { size: 9 }); path_(`M${X(313)} ${Y(1004)}H${X(326)}L${X(333)} ${Y(1012)}`, 1.2);
rbtn(357, 1030, 22, 'f1-lpf');
T(322, 1100, 'FREQ', { size: 9 });
for (const [d, rr] of [[-150, 2.5], [-110, 3.2], [-70, 4], [-30, 4.8], [10, 5.6], [50, 6.4], [90, 7.2], [130, 8]]) { const [x, y] = polar(X(346), Y(1140), 36, d); add(`<circle cx="${r1(x)}" cy="${r1(y)}" r="${rr}" fill="${INK}"/>`); }
knob(346, 1140, 22, 'f1-freq', 0.4, { tick: false, dot: false });
path_(`M${X(298)} ${Y(1168)}V${Y(1310)}H${X(318)}`); path_(`M${X(298)} ${Y(1168)}Q${X(298)} ${Y(1162)} ${X(304)} ${Y(1162)}H${X(318)}`);
rbtn(357, 1250, 24, 'f1-on'); T(357, 1307, 'FILTER 1', { size: 11 });

// ============ voies 1 et 2 ============
for (const i of [0, 1]) {
  const cx = 475 + i * 125; const n = String(i + 1); const c = `ch${n}`;
  add(`<rect x="${X(cx - 53)}" y="${Y(87)}" width="15" height="15" fill="none" stroke="${INK}" stroke-width="1.3"/>`); T(cx - 45.5, 99, n, { size: 10 });
  T(cx - 25, 92, 'SEND', { size: 8 }); T(cx - 25, 101, '1', { size: 8 });
  knob(cx + 14, 106, 17, '', -0.6, { kind: 'small', n: 7, dot: false }); T(cx - 4, 133, '∞', { size: 10 }); T(cx + 33, 133, '+6', { size: 7.5 });
  path_(`M${X(cx - 40)} ${Y(106)}V${Y(147)}H${X(cx + 5)}`, 1.1); smallBtn(cx + 23, 152, 7); T(cx + 44, 156, 'PRE', { size: 7.5 });
  T(cx - 35, 180, 'SEND', { size: 8 }); T(cx - 35, 189, '2', { size: 8 });
  knob(cx, 188, 17, '', -0.6, { kind: 'small', n: 7, dot: false }); T(cx - 18, 214, '∞', { size: 10 }); T(cx + 20, 214, '+6', { size: 7.5 });
  // sélecteur de source
  T(cx - 45, 264, '⟜', { size: 12 }); T(cx - 45, 280, `${i * 2 + 1} - ${i * 2 + 2}`, { size: 7.5 });
  { const sx = X(cx); const sy = Y(266); add(`<g transform="rotate(-28 ${sx} ${sy})"><rect x="${sx - 21}" y="${sy - 9}" width="42" height="18" rx="8" fill="url(#cap)" stroke="#000"/><rect x="${sx + 4}" y="${sy - 2}" width="15" height="4" rx="2" fill="#e11d1d"/></g>`); }
  T(cx + 48, 258, 'USB 1', { size: 7, anchor: 'start' }); T(cx + 48, 270, 'PH', { size: 7, anchor: 'start' }); T(cx + 48, 282, 'LN', { size: 7, anchor: 'start' }); T(cx + 48, 294, 'USB 2', { size: 7, anchor: 'start' });
  add(`<circle cx="${X(cx - 42)}" cy="${Y(328)}" r="4.5" fill="${INK}"/>`); T(cx - 25, 331, 'PK!', { size: 7.5 }); T(cx + 26, 331, 'GAIN', { size: 9.5 });
  knob(cx, 352, 17, `${c}-gain`, 0, { kind: 'small', n: 9 }); T(cx - 19, 383, '∞', { size: 10 }); T(cx + 22, 383, '+10', { size: 7.5 });
  const EQ = [['HI', 432, 'hi', '∞', '+6'], ['HI\nMID', 515, 'himid', '-27', '+10'], ['LO\nMID', 600, 'lomid', '-27', '+10'], ['LO', 700, 'low', '∞', '+6']];
  for (const [lab, y, key, lo, hi] of EQ) {
    if (lab.includes('\n')) { const [a, b] = lab.split('\n'); T(cx - 42, y - 22, a, { size: 9, anchor: 'start' }); T(cx - 42, y - 12, b, { size: 9, anchor: 'start' }); } else T(cx - 42, y - 20, lab, { size: 9, anchor: 'start' });
    knob(cx, y, 22, `${c}-${key}`, 0, { n: key === 'hi' || key === 'low' ? 9 : 21 });
    T(cx - 25, y + 37, lo, { size: lo === '∞' ? 10 : 7.5 }); T(cx + 28, y + 37, hi, { size: 7.5 });
  }
  // affectations filtre / crossfader
  T(cx - 12, 772, '1', { size: 7 }); T(cx + 12, 772, '2', { size: 7 }); toggle(cx, 776, `${c}-filt`, 0); T(cx, 793, 'OFF', { size: 6.8 });
  T(cx - 16, 810, 'X', { size: 7 }); T(cx + 16, 810, 'Y', { size: 7 }); toggle(cx, 808, `${c}-xfa`, i === 0 ? -1 : 1); T(cx, 826, 'OFF', { size: 6.8 });
  T(cx - 37, 852, 'CUE', { size: 9 }); rbtn(cx, 880, 24, '');
  // LED + fader
  ['+10', '+6', '+3', '0', '-3', '-6', '-10', '-15', '-20'].forEach((s, k) => T(cx - 50, 990 + k * 19.6, s, { size: 6.8, anchor: 'end' }));
  ledColumn(cx - 42, 987, 19.6, [10, 6, 3, 0, -3, -6, -10, -15, -20], `${c}-meter`, i === 0 ? 5 : 6);
  fader(cx + 15, 958, 250, `${c}-fader`, i === 0 ? 0.78 : 0.82);
  T(cx - 32, 1198, n, { size: 18, weight: 600 }); T(cx - 8, 1216, '∞', { size: 11 });
}
// cadre des voies et crossfader
line(415, 1236, 665, 1236, 1.4);
T(1000 - 530 + 280, 0, ''); // (rien)
{
  const cx = (X(475) + X(600)) / 2; const cy = Y(1322);
  text(cx - 120, cy + 6, 'X', { size: 14, weight: 800 }); text(cx + 120, cy + 6, 'Y', { size: 14, weight: 800 });
  add(`<circle cx="${r1(cx - 104)}" cy="${cy}" r="6" fill="#1a1a1a"/><circle cx="${r1(cx + 104)}" cy="${cy}" r="6" fill="#1a1a1a"/>`);
  add(`<rect x="${r1(cx - 96)}" y="${cy - 4}" width="192" height="8" rx="4" fill="#0b0b0b"/>`);
  add(`<g class="xfader" data-ctl="xfader" data-x0="${r1(cx - 86)}" data-x1="${r1(cx + 86)}"><g class="cap"><rect x="${r1(cx - 13)}" y="${cy - 26}" width="26" height="56" rx="4" fill="#000" opacity=".45" filter="url(#blur3)"/><path d="M${r1(cx - 14)} ${cy - 30}h28v56h-28z" fill="url(#faderCap)" stroke="#000"/><rect x="${r1(cx - 1.5)}" y="${cy - 27}" width="3" height="50" rx="1.5" fill="#e8e8e8"/></g></g>`);
}

// ============ colonne centrale : USB / MIDI, logo, vu-mètres ============
T(944, 98, 'USB 1', { size: 6.5, rot: -90 }); T(1014, 98, 'USB 2', { size: 6.5, rot: -90 });
path_(`M${X(950)} ${Y(103)}V${Y(96)}H${X(1008)}V${Y(103)}`, 1.1); T(979, 100, 'ACTIVE', { size: 8.5 });
add(`<circle cx="${X(944)}" cy="${Y(119)}" r="4.5" fill="${INK}"/><circle cx="${X(1014)}" cy="${Y(119)}" r="4.5" fill="${INK}"/>`); T(979, 124, '⇆', { size: 12 });
path_(`M${X(935)} ${Y(140)}V${Y(134)}H${X(1024)}V${Y(140)}`, 1.1); T(979, 138, 'MIDI', { size: 9 });
rbtn(948, 166, 20, '', '#4ade80'); T(948, 171, '1', { size: 14, weight: 800, fill: '#7ef0a4' });
rbtn(1013, 166, 20, '', '#4ade80'); T(1013, 171, '2', { size: 14, weight: 800, fill: '#7ef0a4' });
const MDB = [99, 6, 3, 0, -3, -6, -10, -15, -20, -25, -35];
['PK!', '+6', '+3', '0', '-3', '-6', '-10', '-15', '-20', '-25', '-35'].forEach((s, k) => T(979, 331 + k * 19.6, `— ${s} —`, { size: 7, weight: 600 }));
ledColumn(945, 327, 19.6, MDB.map((d) => (d === 99 ? 12 : d)), 'master-l', 7); ledColumn(1013, 327, 19.6, MDB.map((d) => (d === 99 ? 12 : d)), 'master-r', 7);
T(945, 548, 'L', { size: 8 }); T(979, 548, 'MIX', { size: 7 }); T(1013, 548, 'R', { size: 8 });
T(945, 562, 'CUE', { size: 8 }); T(979, 562, '— SPLIT —', { size: 6.5 }); T(1013, 562, 'PRG', { size: 8 });

// ============ filtre 2 ============
add(`<circle cx="${X(942)}" cy="${Y(618)}" r="4.5" fill="${INK}"/>`); T(985, 624, 'CRUNCH', { size: 12 });
knob(985, 668, 16, 'f2-crunch', -0.3, { kind: 'small', n: 11, dot: false });
['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].forEach((s, i) => { const [x, y] = polar(X(985), Y(668), 30, -150 + i * 30); text(x, y + 2.5, s, { size: 6.5, weight: 600 }); });
path_(`M${X(930)} ${Y(1076)}V${Y(718)}Q${X(930)} ${Y(712)} ${X(936)} ${Y(712)}H${X(970)}`);
T(1027, 742, 'RES', { size: 8.5 }); knob(990, 763, 22, 'f2-res', 0, { n: 7 }); T(958, 806, 'MILD', { size: 7.5 }); T(1022, 806, 'WILD', { size: 7.5 });
T(958, 838, 'HPF', { size: 9 }); rbtn(998, 868, 22, 'f2-hpf');
line(998, 897, 998, 912); T(958, 918, 'BPF', { size: 9 }); rbtn(998, 948, 22, 'f2-bpf');
line(998, 977, 998, 993); T(958, 1000, 'LPF', { size: 9 }); rbtn(998, 1030, 22, 'f2-lpf');
T(955, 1100, 'FREQ', { size: 9 });
for (const [d, rr] of [[-150, 2.5], [-110, 3.2], [-70, 4], [-30, 4.8], [10, 5.6], [50, 6.4], [90, 7.2], [130, 8]]) { const [x, y] = polar(X(985), Y(1140), 36, d); add(`<circle cx="${r1(x)}" cy="${r1(y)}" r="${rr}" fill="${INK}"/>`); }
knob(985, 1140, 22, 'f2-freq', 0.5, { tick: false, dot: false });
path_(`M${X(930)} ${Y(1168)}V${Y(1310)}H${X(950)}`); path_(`M${X(930)} ${Y(1168)}Q${X(930)} ${Y(1162)} ${X(936)} ${Y(1162)}H${X(950)}`);
rbtn(998, 1250, 24, 'f2-on'); T(998, 1307, 'FILTER 2', { size: 11 });

// ============ master / booth / casque ============
const M = 1124;
T(M, 89, 'MASTER 1', { size: 9.5 }); knob(M, 124, 18, 'master', 0.6, { kind: 'small', n: 11, dot: false });
['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].forEach((s, i) => { const [x, y] = polar(X(M), Y(124), 30, -150 + i * 30); text(x, y + 2.5, s, { size: 6.2, weight: 600 }); });
T(M, 180, 'MASTER 2', { size: 9.5 }); knob(M, 214, 18, '', 0.5, { kind: 'small', n: 11, dot: false });
['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].forEach((s, i) => { const [x, y] = polar(X(M), Y(214), 30, -150 + i * 30); text(x, y + 2.5, s, { size: 6.2, weight: 600 }); });
T(M - 12, 266, 'USB', { size: 7.5 }); T(M - 12, 276, '11/12', { size: 7.5 }); smallBtn(M - 12, 293, 9);
T(M - 12, 322, 'MST/SEND2', { size: 7.5 }); smallBtn(M - 12, 348, 9); T(M - 12, 372, 'STEREO/MONO', { size: 7.5 });
path_(`M${X(M + 4)} ${Y(353)}H${X(M + 40)}V${Y(712)}H${X(M + 4)}`, 1.2); T(M + 47, 540, 'BOOTH', { size: 9, rot: 90 });
for (const [lab, y] of [['HI', 408], ['MID', 478], ['LO', 548]]) { T(M - 40, y - 12, lab, { size: 9, anchor: 'start' }); knob(M, y, 16, '', 0, { kind: 'small', n: 9 }); T(M - 18, y + 30, '-8', { size: 7 }); T(M + 20, y + 30, '+8', { size: 7 }); }
knob(M, 632, 18, '', 0.2, { kind: 'small', n: 11, dot: false });
['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].forEach((s, i) => { const [x, y] = polar(X(M), Y(632), 30, -150 + i * 30); text(x, y + 2.5, s, { size: 6.2, weight: 600 }); });
add(`<circle cx="${X(M - 12)}" cy="${Y(700)}" r="22" fill="url(#rbtn)"/><circle cx="${X(M - 12)}" cy="${Y(700)}" r="12" fill="#f2f2f2"/><circle cx="${X(M - 12)}" cy="${Y(700)}" r="8" fill="#0a0a0a"/>`); T(M + 18, 718, 'MUTE', { size: 7.5 });
T(M - 12, 768, '╱  ╱  ╯', { size: 9 }); toggle(M - 12, 784, '', 0); T(M - 12, 805, 'CHANNEL FADER', { size: 7.5 });
toggle(M - 12, 822, '', 0); T(M - 12, 842, 'XFADER', { size: 7.5 });
add(`<circle cx="${X(M - 35)}" cy="${Y(868)}" r="5.5" fill="#7f1d1d" stroke="#3a0a0a"/><circle cx="${X(M - 35)}" cy="${Y(868)}" r="3" fill="#ff5a4a"/>`); T(M - 35, 890, 'ACTIVE', { size: 7.5 });
path_(`M${X(M - 20)} ${Y(872)}H${X(M + 40)}V${Y(1210)}H${X(M + 4)}`, 1.2); T(M + 47, 1030, 'MONITOR', { size: 9, rot: 90 });
smallBtn(M - 12, 913, 9, ''); T(M + 8, 910, 'POST', { size: 7, anchor: 'start' }); T(M + 8, 919, 'EQ', { size: 7, anchor: 'start' });
smallBtn(M - 12, 961, 9, ''); T(M + 8, 958, 'SPLIT', { size: 7, anchor: 'start' }); T(M + 8, 967, 'CUE', { size: 7, anchor: 'start' });
knob(M, 1024, 18, '', 0.5, { kind: 'small', n: 9 }); T(M - 20, 1056, 'CUE', { size: 7.5 }); T(M + 22, 1056, 'MST', { size: 7.5 });
knob(M, 1124, 18, '', 0.3, { kind: 'small', n: 12, dot: false });
['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'].forEach((s, i) => { const [x, y] = polar(X(M), Y(1124), 30, -150 + i * (300 / 11)); text(x, y + 2.5, s, { size: 6, weight: 600 }); });
add(`<circle cx="${X(M - 4)}" cy="${Y(1188)}" r="25" fill="url(#jack)"/><circle cx="${X(M - 4)}" cy="${Y(1188)}" r="10" fill="#000"/>`);
add(`<circle cx="${X(M - 22)}" cy="${Y(1290)}" r="11" fill="url(#jack)"/><circle cx="${X(M - 22)}" cy="${Y(1290)}" r="4" fill="#000"/>`); T(M + 8, 1294, '🎧', { size: 13 });

// vis
for (const [x, y] of [[300, 38], [660, 38], [1060, 38], [1185, 280], [1185, 1140], [300, 1395], [660, 1395], [1060, 1395], [915, 38], [915, 1395]]) screw(x, y);

add('</svg>');
const dest = path.join(__dirname, '..', '..', 'public', 'skins', 'xonarr.svg');
fs.mkdirSync(path.dirname(dest), { recursive: true });
// identifiants préfixés : la table est posée dans la même page que les platines, dont les dégradés portent les mêmes noms
fs.writeFileSync(dest, out.join('\n').replace(/id="([\w-]+)"/g, 'id="xo-$1"').replace(/url\(#([\w-]+)\)/g, 'url(#xo-$1)'));
console.log(`${dest} (${(fs.statSync(dest).size / 1024).toFixed(0)} Ko)`);
