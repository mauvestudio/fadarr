/**
 * Génère public/skins/deckarr.svg : façade de la platine « Deckarr DKR-3000 » (inspirée de la disposition d'une CDJ-3000).
 * Vectoriel, à la même échelle que la table Pionarr (les deux se posent côte à côte à la même hauteur).
 * Les commandes branchées sur fadarr portent data-ctl ; la zone d'écran (data-ctl="screen") accueillera les vraies formes
 * d'onde et infos de fadarr : ce qui y est dessiné ici n'est qu'un aperçu.
 *
 * Usage : node tools/skins/deckarr.js  ->  public/skins/deckarr.svg
 */
'use strict';

const fs = require('fs');
const path = require('path');

const S = 1.5; // échelle par rapport à la photo de référence (900 px de haut)
const P = (x, y) => [(x - 150) * S, (y - 30) * S]; // coordonnées de la photo -> façade
const W = 600 * S; const H = 840 * S;
const F = "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const out = []; const add = (s) => out.push(s);
const r1 = (v) => Math.round(v * 10) / 10;

function text(x, y, s, { size = 9, weight = 600, anchor = 'middle', fill = '#e6e6e6', spacing = 0.2, italic = false } = {}) {
  add(`<text x="${r1(x)}" y="${r1(y)}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}" letter-spacing="${spacing}"${italic ? ' font-style="italic"' : ''}>${s}</text>`);
}
const T = (px, py, s, o) => { const [x, y] = P(px, py); text(x, y, s, o); };
const polar = (cx, cy, r, deg) => { const a = (deg - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };

function spun(cx, cy, rr, strength = 1, step = 1.15) {
  let d = '';
  for (let k = 1.4, i = 0; k < rr; k += step, i++) d += `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(k)}" fill="none" stroke="${i % 2 ? '#000' : '#fff'}" stroke-opacity="${r1((i % 2 ? 0.05 : 0.045) * strength * 1000) / 1000}" stroke-width=".55"/>`;
  add(d);
}

/** Petit potard (VINYL SPEED ADJ., JOG ADJUST) avec liseré chromé. */
function knob(px, py, r, ctl = '', value = 0) {
  const [cx, cy] = P(px, py);
  add(`<g class="knob"${ctl ? ` data-ctl="${ctl}"` : ''}>`);
  for (let i = 0; i < 9; i++) { const [x, y] = polar(cx, cy, r + 7, -135 + i * 33.75); add(`<circle cx="${r1(x)}" cy="${r1(y)}" r="1.1" fill="#d6d6d6"/>`); }
  add(`<circle cx="${cx + 1.5}" cy="${cy + 3}" r="${r + 1.5}" fill="#000" opacity=".55" filter="url(#blur3)"/>`);
  add(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#skirt)"/><circle cx="${cx}" cy="${cy}" r="${r - 0.8}" fill="none" stroke="#3c3d40" stroke-width="1.6" stroke-dasharray="0.9 1.3"/>`);
  add(`<circle cx="${cx}" cy="${cy}" r="${r1(r * 0.78 + 1.4)}" fill="url(#chromeRing)" opacity=".75"/><circle cx="${cx}" cy="${cy}" r="${r1(r * 0.78)}" fill="url(#cap)"/>`);
  spun(cx, cy, r * 0.78);
  add(`<circle cx="${cx}" cy="${cy}" r="${r1(r * 0.78)}" fill="url(#spunSheen)"/>`);
  add(`<g class="rot" transform="rotate(${value * 135} ${cx} ${cy})"><rect x="${r1(cx - 1.4)}" y="${r1(cy - r)}" width="2.8" height="${r1(r * 0.9)}" rx="1.2" fill="#f2f2f2"/></g></g>`);
}

/** Bouton rectangulaire. */
function btn(px, py, w, h, label, { style = 'dark', ctl = '', size = 8, bar = null, label2 = '' } = {}) {
  const [cx, cy] = P(px, py); w *= S; h *= S;
  const x = cx - w / 2; const y = cy - h / 2;
  const fill = { dark: 'url(#btnDark)', yellow: 'url(#yellowLit)', blue: 'url(#btnDark)', red: 'url(#redLit)', white: 'url(#btnDark)' }[style];
  const stroke = { dark: '#46484c', yellow: '#ffe27a', blue: '#3b82f6', red: '#ff7a6e', white: '#d8d8d8' }[style];
  const tc = { dark: '#e8e8e8', yellow: '#2b2200', blue: '#6fb0ff', red: '#2a0603', white: '#eee' }[style];
  add(`<g class="btn ${style}"${ctl ? ` data-ctl="${ctl}"` : ''}>`);
  add(`<rect x="${r1(x + 1)}" y="${r1(y + 2.5)}" width="${r1(w)}" height="${r1(h)}" rx="3" fill="#000" opacity=".65" filter="url(#blur2)"/>`);
  if (style === 'yellow' || style === 'red') add(`<rect x="${r1(x - 2)}" y="${r1(y - 2)}" width="${r1(w + 4)}" height="${r1(h + 4)}" rx="5" fill="${style === 'yellow' ? '#ffd23a' : '#ff4a3a'}" opacity=".35" filter="url(#blur4)"/>`);
  add(`<rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1.3"/>`);
  add(`<rect x="${r1(x + 2)}" y="${r1(y + 1.5)}" width="${r1(w - 4)}" height="${r1(h * 0.36)}" rx="2" fill="#fff" opacity=".06"/>`);
  if (bar) { add(`<rect x="${r1(x + 4)}" y="${r1(y + h - 6)}" width="${r1(w - 8)}" height="3" rx="1.5" fill="${bar}"/><rect x="${r1(x + 2)}" y="${r1(y + h - 9)}" width="${r1(w - 4)}" height="8" rx="3" fill="${bar}" opacity=".35" filter="url(#blur3)"/>`); }
  if (label) text(cx, cy + size * 0.36 - (bar ? 2 : 0) - (label2 ? 4 : 0), label, { size, fill: bar || tc, spacing: 0 });
  if (label2) text(cx, cy + size * 0.36 + 5, label2, { size, fill: tc, spacing: 0 });
  add('</g>');
}

/** Bouton rond éclairé (IN/CUE, OUT, CUE, PLAY…). ring : couleur de l'anneau ; fill : 'lit' pour un bouton plein éclairé. */
function rbtn(px, py, r, ring, label, { ctl = '', lit = false, solid = null, size = 10, labelColor = '#e8e8e8' } = {}) {
  const [cx, cy] = P(px, py); r *= S;
  add(`<g class="rbtn"${ctl ? ` data-ctl="${ctl}"` : ''}>`);
  add(`<circle cx="${cx + 1}" cy="${cy + 3}" r="${r1(r + 3)}" fill="#000" opacity=".6" filter="url(#blur3)"/>`);
  if (lit) add(`<circle cx="${cx}" cy="${cy}" r="${r1(r + 7)}" fill="${ring}" opacity=".45" filter="url(#blur5)"/>`);
  add(`<circle cx="${cx}" cy="${cy}" r="${r1(r + 3.5)}" fill="#0a0a0b"/>`);
  add(`<circle cx="${cx}" cy="${cy}" r="${r1(r + 2)}" fill="none" stroke="${ring}" stroke-width="${r > 25 ? 5 : 2.6}"/>`);
  add(`<circle cx="${cx}" cy="${cy}" r="${r1(r - (r > 25 ? 1.5 : 0))}" fill="${solid || 'url(#rbtn)'}"/>`);
  if (!solid) { add(`<circle cx="${cx}" cy="${cy}" r="${r1(r - 2)}" fill="url(#chromeDisc)" opacity=".55"/>`); spun(cx, cy, r - 2, 0.9, 1.3); }
  add(`<ellipse cx="${r1(cx - r * 0.2)}" cy="${r1(cy - r * 0.38)}" rx="${r1(r * 0.55)}" ry="${r1(r * 0.28)}" fill="#fff" opacity="${solid ? 0.35 : r > 25 ? 0.04 : 0.08}"/>`);
  if (label) text(cx, cy + size * 0.36, label, { size, weight: 700, fill: labelColor, spacing: 0 });
  add('</g>');
}

function screw(px, py) { const [cx, cy] = P(px, py); add(`<circle cx="${cx}" cy="${cy + 1}" r="7" fill="#000" opacity=".5" filter="url(#blur2)"/><circle cx="${cx}" cy="${cy}" r="6" fill="url(#screw)" stroke="#000" stroke-width=".6"/><path d="M${cx - 3.3} ${cy}H${cx + 3.3}M${cx} ${cy - 3.3}V${cy + 3.3}" stroke="#0b0b0b" stroke-width="1.4" stroke-linecap="round"/>`); }

/** Forme d'onde d'aperçu (bandes de couleur), déterministe. */
function fakeWave(x, y, w, h, n, seed, colors) {
  let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  let d = ['', '', ''];
  for (let i = 0; i < n; i++) {
    const t = i / n; const env = 0.35 + 0.65 * Math.abs(Math.sin(t * Math.PI * 3.1 + 0.4)) * (t > 0.08 && t < 0.92 ? 1 : 0.35);
    const xs = x + (i / n) * w; const bw = w / n + 0.2;
    const a = env * (0.55 + rnd() * 0.45);
    const parts = [a, a * (0.45 + rnd() * 0.3), a * (0.2 + rnd() * 0.25)];
    parts.forEach((v, k) => { const hh = v * h / 2; d[k] += `M${r1(xs)} ${r1(y - hh)}h${r1(bw)}v${r1(hh * 2)}h${r1(-bw)}Z`; });
  }
  d.forEach((p, k) => add(`<path d="${p}" fill="${colors[k]}"/>`));
}

// ---------------------------------------------------------------------------
add(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${F}">`);
add(`<defs>
  <filter id="blur2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.4"/></filter>
  <filter id="blur3" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4"/></filter>
  <filter id="blur4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
  <filter id="blur5" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7"/></filter>
  <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="11" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .04 0"/></filter>
  <filter id="brushed" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".002 .9" numOctaves="2" seed="3" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .07 0"/></filter>
  <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1d20"/><stop offset=".5" stop-color="#151618"/><stop offset="1" stop-color="#101112"/></linearGradient>
  <linearGradient id="bezel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2e3033"/><stop offset="1" stop-color="#080809"/></linearGradient>
  <radialGradient id="skirt" cx=".42" cy=".35" r=".75"><stop offset="0" stop-color="#3b3c40"/><stop offset=".7" stop-color="#1a1b1d"/><stop offset="1" stop-color="#0b0b0c"/></radialGradient>
  <radialGradient id="cap" cx=".4" cy=".3" r=".85"><stop offset="0" stop-color="#3d3e42"/><stop offset=".55" stop-color="#202124"/><stop offset="1" stop-color="#0e0e10"/></radialGradient>
  <linearGradient id="chromeRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7f8f9"/><stop offset=".18" stop-color="#9da0a4"/><stop offset=".36" stop-color="#eceef0"/><stop offset=".55" stop-color="#5f6266"/><stop offset=".72" stop-color="#d4d6d9"/><stop offset="1" stop-color="#6b6e72"/></linearGradient>
  <linearGradient id="chromeDisc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d7075"/><stop offset=".3" stop-color="#2a2c2f"/><stop offset=".5" stop-color="#55585c"/><stop offset=".7" stop-color="#1c1d1f"/><stop offset="1" stop-color="#3a3c40"/></linearGradient>
  <linearGradient id="spunSheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".12"/><stop offset=".65" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".1"/></linearGradient>
  <linearGradient id="btnDark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2d31"/><stop offset="1" stop-color="#121315"/></linearGradient>
  <linearGradient id="yellowLit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe36a"/><stop offset="1" stop-color="#f2b80f"/></linearGradient>
  <linearGradient id="redLit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6a5a"/><stop offset="1" stop-color="#d9261b"/></linearGradient>
  <radialGradient id="rbtn" cx=".45" cy=".35" r=".8"><stop offset="0" stop-color="#2c2d31"/><stop offset="1" stop-color="#0b0b0c"/></radialGradient>
  <radialGradient id="yellowBall" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#fff2a8"/><stop offset=".5" stop-color="#ffd33a"/><stop offset="1" stop-color="#d99a00"/></radialGradient>
  <radialGradient id="screw" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#5c5e62"/><stop offset="1" stop-color="#151617"/></radialGradient>
  <linearGradient id="screen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0b0e"/><stop offset="1" stop-color="#040405"/></linearGradient>
  <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".09"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".03"/></linearGradient>
  <radialGradient id="platter" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#101113"/><stop offset=".8" stop-color="#0c0d0f"/><stop offset="1" stop-color="#1b1c1f"/></radialGradient>
  <linearGradient id="platterSheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/><stop offset=".6" stop-color="#fff" stop-opacity=".04"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="jogChrome" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".2" stop-color="#9ea1a5"/><stop offset=".4" stop-color="#e8eaec"/><stop offset=".6" stop-color="#54575b"/><stop offset=".8" stop-color="#d0d2d5"/><stop offset="1" stop-color="#75787c"/></linearGradient>
  <radialGradient id="bump" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#3a3b3f"/><stop offset=".7" stop-color="#18191b"/><stop offset="1" stop-color="#0c0c0d"/></radialGradient>
  <linearGradient id="faderCap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3b3f"/><stop offset=".45" stop-color="#1b1c1e"/><stop offset=".55" stop-color="#121314"/><stop offset="1" stop-color="#26272a"/></linearGradient>
  <linearGradient id="slot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d3f43"/><stop offset=".55" stop-color="#242528"/><stop offset="1" stop-color="#111214"/></linearGradient>
</defs>`);

// --- boîtier : écran qui dépasse en haut, puis le corps ---
{
  const [sx, sy] = P(232, 30); const [sx2, sy2] = P(668, 310);
  add(`<rect x="${sx}" y="${sy}" width="${sx2 - sx}" height="${sy2 - sy}" rx="10" fill="url(#bezel)"/>`);
  const [bx, by] = P(150, 88); const [bx2, by2] = P(750, 868);
  add(`<rect x="${bx}" y="${by}" width="${bx2 - bx}" height="${by2 - by}" rx="12" fill="url(#bezel)"/>`);
  add(`<rect x="${bx + 3}" y="${by + 3}" width="${bx2 - bx - 6}" height="${by2 - by - 6}" rx="10" fill="url(#panel)"/>`);
  add(`<rect x="${bx + 3}" y="${by + 3}" width="${bx2 - bx - 6}" height="${by2 - by - 6}" rx="10" filter="url(#brushed)"/>`);
  add(`<rect x="${bx + 3}" y="${by + 3}" width="${bx2 - bx - 6}" height="${by2 - by - 6}" rx="10" filter="url(#grain)"/>`);
  add(`<rect x="${sx + 3}" y="${sy + 3}" width="${sx2 - sx - 6}" height="${sy2 - sy - 6}" rx="8" fill="#141517"/>`);
}

// --- touches au-dessus de l'écran ---
['SOURCE', 'BROWSE', 'TAG LIST', 'PLAYLIST', 'SEARCH', 'MENU'].forEach((l, i) => {
  const px = 270 + i * 72;
  btn(px, 60, 62, 14, l, { style: 'dark', size: 7.5, ctl: `nav-${l.toLowerCase().replace(' ', '')}` });
  if (i > 0 && i < 5) { const [x, y] = P(px, 66); add(`<rect x="${x - 30}" y="${y}" width="60" height="2" fill="#2f7cf0" opacity=".8"/>`); }
});
T(645, 46, '— UTILITY', { size: 7 });

// --- écran (aperçu ; remplacé par les vraies infos de fadarr) ---
{
  const [x, y] = P(256, 84); const [x2, y2] = P(646, 300);
  add(`<rect x="${x - 4}" y="${y - 4}" width="${x2 - x + 8}" height="${y2 - y + 8}" rx="4" fill="#000"/>`);
  add(`<g data-ctl="screen" data-x="${x}" data-y="${y}" data-w="${x2 - x}" data-h="${y2 - y}">`);
  add(`<rect x="${x}" y="${y}" width="${x2 - x}" height="${y2 - y}" fill="url(#screen)"/>`);
  const w = x2 - x;
  // en-tête : source, pochette, titre
  add(`<rect x="${x + 6}" y="${y + 6}" width="22" height="30" rx="2" fill="#1d4ed8"/>`); text(x + 17, y + 31, 'USB', { size: 6.5, fill: '#fff', spacing: 0 });
  add(`<rect x="${x + 34}" y="${y + 6}" width="30" height="30" rx="2" fill="#7f1d1d"/><circle cx="${x + 49}" cy="${y + 21}" r="9" fill="#f97316" opacity=".8"/>`);
  text(x + 72, y + 20, '♪  Titre du morceau (Original Mix)', { size: 13, weight: 600, fill: '#fff', anchor: 'start', spacing: 0 });
  text(x + 72, y + 36, '07:29   124.0   Cm', { size: 12, weight: 500, fill: '#fff', anchor: 'start', spacing: 0 });
  for (const [k, l] of [[0, 'BEAT\nLOOP'], [1, 'KEY\nSHIFT'], [2, 'BEAT\nJUMP']]) {
    const bx = x + w - 132 + k * 44;
    add(`<rect x="${bx}" y="${y + 6}" width="40" height="30" fill="#101114" stroke="#2a2b30"/>`);
    const [a, b] = l.split('\n'); text(bx + 20, y + 18, a, { size: 7, fill: '#ddd', spacing: 0 }); text(bx + 20, y + 28, b, { size: 7, fill: '#ddd', spacing: 0 });
  }
  // forme d'onde zoomée
  add(`<rect x="${x}" y="${y + 44}" width="${w}" height="112" fill="#050506"/>`);
  fakeWave(x + 4, y + 100, w - 8, 92, 220, 7, ['#1d4ed8', '#e8a23a', '#f4efe4']);
  for (let k = 0; k < 16; k++) add(`<rect x="${r1(x + 12 + k * (w - 24) / 16)}" y="${y + 46}" width="1" height="7" fill="#fff" opacity=".7"/>`);
  add(`<rect x="${r1(x + w * 0.36)}" y="${y + 44}" width="2" height="112" fill="#ff3b30"/>`);
  // compteurs
  const cy = y + 168;
  const box = (bx, bw, top, big, cls = '') => { add(`<rect x="${bx}" y="${cy}" width="${bw}" height="34" fill="#0b0c0f" stroke="#2a2b30"/>`); text(bx + 4, cy + 9, top, { size: 6, fill: '#aaa', anchor: 'start', spacing: 0 }); text(bx + bw / 2, cy + 28, big, { size: 15, weight: 500, fill: '#fff', spacing: 0, ...(cls ? {} : {}) }); };
  box(x + 6, 40, 'PLAYER', '1'); box(x + 50, 40, 'TRACK', '15');
  text(x + 200, cy + 9, 'SINGLE', { size: 6, fill: '#aaa', spacing: 0 }); text(x + 200, cy + 30, '02:35<tspan font-size="11">.350</tspan>', { size: 24, weight: 500, fill: '#fff', spacing: 0 });
  text(x + 330, cy + 9, 'TEMPO  ±16', { size: 6, fill: '#aaa', spacing: 0 }); text(x + 330, cy + 30, '+0.55<tspan font-size="10">%</tspan>', { size: 20, weight: 500, fill: '#fff', spacing: 0 });
  add(`<rect x="${x + w - 82}" y="${cy}" width="76" height="34" fill="#0b0c0f" stroke="#f97316"/>`); text(x + w - 78, cy + 9, 'BPM', { size: 6, fill: '#f97316', anchor: 'start', spacing: 0 }); text(x + w - 44, cy + 30, '124<tspan font-size="12">.7</tspan>', { size: 22, weight: 600, fill: '#f97316', spacing: 0 });
  // aperçu complet
  add(`<rect x="${x}" y="${cy + 42}" width="${w}" height="${y2 - cy - 42}" fill="#050506"/>`);
  fakeWave(x + 70, cy + 66, w - 120, 34, 160, 3, ['#1d4ed8', '#e8a23a', '#f4efe4']);
  add(`<rect x="${x + 6}" y="${cy + 46}" width="56" height="20" fill="#3b0d0d" stroke="#ef4444"/>`); text(x + 34, cy + 59, 'QUANTIZE', { size: 6.5, fill: '#ef4444', spacing: 0 });
  add(`<rect x="${x + 6}" y="${cy + 70}" width="56" height="20" fill="#0b0c0f" stroke="#2a2b30"/>`); text(x + 34, cy + 84, 'BEAT JUMP 64', { size: 5.8, fill: '#ddd', spacing: 0 });
  text(x + w - 22, cy + 82, 'Cm', { size: 15, weight: 600, fill: '#fff', spacing: 0 });
  add(`<rect x="${x}" y="${y}" width="${w}" height="${y2 - y}" fill="url(#glass)"/>`);
  add('</g>');
}

// --- colonne gauche (haut) ---
{
  const [x, y] = P(160, 100); add(`<rect x="${x}" y="${y}" width="${48 * S}" height="${44 * S}" rx="3" fill="#0a0a0b" stroke="#3c3e42"/><rect x="${x + 4}" y="${y + 4}" width="${48 * S - 8}" height="${32 * S}" rx="2" fill="url(#slot)"/><rect x="${x + 6}" y="${y + 36 * S + 2}" width="${48 * S - 12}" height="3" rx="1.5" fill="#38bdf8"/><rect x="${x + 2}" y="${y + 36 * S - 2}" width="${48 * S - 4}" height="10" rx="3" fill="#38bdf8" opacity=".4" filter="url(#blur3)"/>`);
  T(184, 154, '5V ⎓ 0.5A', { size: 5.2 }); T(212, 118, 'USB', { size: 6.5, anchor: 'start' }); T(212, 126, 'STOP', { size: 6.5, anchor: 'start' });
  rbtn(212, 140, 7, '#3a3b3e', '', { ctl: 'usb-stop' });
  const [sx, sy] = P(160, 160); add(`<rect x="${sx}" y="${sy}" width="${66 * S}" height="${36 * S}" rx="3" fill="#0a0a0b" stroke="#3c3e42"/><rect x="${sx + 6}" y="${sy + 14}" width="${66 * S - 12}" height="10" rx="2" fill="#050505"/>`);
  T(193, 215, '▭ SD', { size: 7 });
  T(176, 238, 'TIME', { size: 6.5 }); T(176, 246, 'MODE', { size: 6.5 }); T(212, 238, 'AUTO', { size: 6.5 }); T(212, 246, 'CUE', { size: 6.5 });
  rbtn(176, 258, 6.5, '#3a3b3e', '', { ctl: 'time-mode' }); rbtn(212, 258, 6.5, '#3a3b3e', '', { ctl: 'auto-cue' });
  btn(176, 285, 24, 12, '', { style: 'red' }); btn(212, 285, 24, 12, '', { style: 'red' });
  T(176, 288, 'SLIP', { size: 6, fill: '#2a0603' }); T(212, 288, 'QUANTIZE', { size: 4.8, fill: '#2a0603' });
}

// --- à droite de l'écran : BACK, TAG TRACK, sélecteur, TRACK FILTER, SHORTCUT ---
T(705, 102, '⏻', { size: 10 });
btn(683, 128, 26, 26, 'BACK', { size: 6.5, ctl: 'back' }); btn(722, 128, 26, 26, 'TAG TRACK', { size: 5, label2: '/REMOVE', ctl: 'tag' });
{
  const [cx, cy] = P(706, 183);
  add(`<circle cx="${cx + 2}" cy="${cy + 4}" r="40" fill="#000" opacity=".6" filter="url(#blur3)"/><circle cx="${cx}" cy="${cy}" r="38" fill="url(#rbtn)" stroke="#2a2b2e" stroke-width="1.5"/>`);
  add(`<circle cx="${cx}" cy="${cy}" r="27" fill="url(#jogChrome)"/><circle cx="${cx}" cy="${cy}" r="23" fill="url(#cap)"/>`); spun(cx, cy, 23, 1.4);
  add(`<g data-ctl="rotary"><circle cx="${cx}" cy="${cy}" r="23" fill="url(#spunSheen)"/></g>`);
}
btn(683, 240, 26, 26, '◂TRACK', { size: 5.2, label2: 'FILTER', ctl: 'filter' }); btn(722, 240, 26, 26, 'SHORT', { size: 6, label2: 'CUT', ctl: 'shortcut' });
T(718, 282, 'MP3/AAC/WAV/', { size: 6.5, italic: true }); T(718, 291, 'AIFF/FLAC/ALAC', { size: 6.5, italic: true });

// --- hot cues ---
T(195, 327, '•CALL/<tspan fill="#111">DELETE</tspan>', { size: 6 });
{ const [x, y] = P(185, 345); add(`<rect x="${x - 22}" y="${y - 12}" width="44" height="24" rx="3" fill="url(#btnDark)" stroke="#45474b"/><rect x="${x - 16}" y="${y - 7}" width="16" height="14" rx="2" fill="#3a3c40"/>`); }
T(482, 326, 'HOT CUE', { size: 7.5 });
{ const [x0, y0] = P(258, 326); const [x1] = P(650, 326); add(`<path d="M${x0} ${y0 - 3}H${P(452, 0)[0]}M${P(512, 0)[0]} ${y0 - 3}H${x1}" stroke="#bdbdbd" stroke-width=".8"/>`); }
const HC = ['#ef4444', '#22d3ee', '#a3e635', '#a855f7', '#22c55e', '#f97316', '#3b82f6', '#facc15'];
'ABCDEFGH'.split('').forEach((l, i) => btn(258 + i * 55.5, 345, 44, 21, l, { size: 7.5, bar: HC[i], ctl: `hot-${i}` }));
T(718, 318, 'VINYL SPEED ADJ.', { size: 6.5 }); T(718, 326, 'TOUCH / BRAKE', { size: 5.5 }); knob(705, 350, 11, 'vinyl-speed', 0.35);

// --- boucles ---
T(182, 368, 'IN/CUE', { size: 7.5 }); T(224, 368, 'OUT', { size: 7.5 }); T(282, 368, 'RELOOP/EXIT', { size: 7.5 });
{ const [cx, cy] = P(185, 390); add(`<circle cx="${cx}" cy="${cy}" r="24" fill="#facc15" opacity=".35" filter="url(#blur5)"/>`); }
rbtn(185, 390, 13, '#a88b20', '', { ctl: 'loop-in', solid: 'url(#yellowBall)' }); rbtn(225, 390, 13, '#a88b20', '', { ctl: 'loop-out', solid: 'url(#yellowBall)' });
rbtn(280, 390, 11, '#facc15', '', { ctl: 'reloop', lit: true }); { const [cx, cy] = P(280, 390); add(`<circle cx="${cx}" cy="${cy}" r="4" fill="#facc15"/>`); }
{ const [x, y] = P(300, 390); add(`<line x1="${x}" y1="${y}" x2="${x + 30}" y2="${y}" stroke="#bdbdbd"/>`); } T(338, 393, 'LOOP', { size: 7.5, anchor: 'start' });
btn(185, 411, 28, 9, 'IN ADJUST', { size: 4.5 }); btn(225, 411, 28, 9, 'OUT ADJUST', { size: 4.2 });
rbtn(180, 440, 9, '#facc15', '4', { ctl: 'beatloop-4', size: 10, labelColor: '#facc15' }); rbtn(222, 440, 9, '#facc15', '8', { ctl: 'beatloop-8', size: 10, labelColor: '#facc15' });
{ const [x, y] = P(240, 440); add(`<line x1="${x}" y1="${y}" x2="${x + 20}" y2="${y}" stroke="#bdbdbd"/>`); } T(255, 443, 'BEAT LOOP', { size: 7.5, anchor: 'start' });
btn(180, 458, 22, 8, '1/2X', { size: 4.8 }); btn(222, 458, 22, 8, '2X', { size: 4.8 });
btn(178, 482, 24, 22, '◀', { size: 9, ctl: 'jump-back' }); btn(226, 482, 24, 22, '▶', { size: 9, ctl: 'jump-fwd' }); T(203, 480, 'BEAT', { size: 6 }); T(203, 488, 'JUMP', { size: 6 });
T(200, 518, 'DIRECTION', { size: 7.5 });
{ const [x, y] = P(170, 527); add(`<rect x="${x}" y="${y}" width="${64 * S}" height="${44 * S}" rx="3" fill="#0b0b0c" stroke="#45474b"/><rect x="${x + 5}" y="${y + 5}" width="${22 * S}" height="${44 * S - 10}" rx="2" fill="#2a2b2e"/><rect x="${x + 5}" y="${y + 30}" width="${22 * S}" height="20" rx="2" fill="url(#btnDark)" stroke="#555"/>`); }
T(225, 542, 'SLIP REV', { size: 6.2 }); T(225, 555, 'FWD', { size: 6.5 }); T(225, 568, 'REV', { size: 6.5, fill: '#ef4444' });
T(200, 595, 'TRACK SEARCH', { size: 7 }); btn(180, 612, 26, 22, '⏮', { size: 8, ctl: 'prev' }); btn(222, 612, 26, 22, '⏭', { size: 8, ctl: 'next' });
T(200, 643, 'SEARCH', { size: 7 }); btn(180, 660, 26, 22, '◀◀', { size: 7.5, ctl: 'search-back' }); btn(222, 660, 26, 22, '▶▶', { size: 7.5, ctl: 'search-fwd' });
rbtn(198, 732, 27, '#f59e0b', 'CUE', { ctl: 'cue', lit: true, size: 11 });
T(198, 778, 'PLAY / PAUSE', { size: 7.5 });
rbtn(198, 810, 27, '#22c55e', '▶❙❙', { ctl: 'play', lit: true, size: 12 });

// --- à droite : CUE/LOOP CALL, DELETE, MEMORY, VINYL/CDJ, JOG MODE, JOG ADJUST, SYNC, TEMPO ---
T(560, 372, 'CUE/LOOP', { size: 7 }); T(560, 380, 'CALL', { size: 7 }); T(615, 375, 'DELETE', { size: 7 }); T(642, 375, 'MEMORY', { size: 7 });
rbtn(548, 392, 7, '#3a3b3e', '◂', { size: 8, ctl: 'call-prev', labelColor: '#facc15' }); rbtn(572, 392, 7, '#3a3b3e', '▸', { size: 8, ctl: 'call-next', labelColor: '#facc15' });
rbtn(612, 392, 10, '#3a3b3e', '', { ctl: 'mem-delete' }); rbtn(642, 392, 7, '#3a3b3e', '', { ctl: 'memory' });
btn(690, 392, 28, 26, 'VINYL', { size: 6.5, style: 'blue', label2: '<tspan fill="#facc15">CDJ</tspan>', ctl: 'vinyl' }); btn(722, 392, 26, 26, 'JOG', { size: 6.2, label2: 'MODE', ctl: 'jogmode' });
T(620, 420, 'JOG ADJUST', { size: 7 }); knob(620, 442, 10, 'jog-adjust', -0.3); T(608, 462, 'LIGHT', { size: 4.5 }); T(632, 462, 'HEAVY', { size: 4.5 });
T(700, 422, '┌ INST. DOUBLES', { size: 6.5 });
btn(685, 446, 28, 28, 'BEAT', { size: 6.5, label2: 'SYNC', ctl: 'sync' }); btn(720, 446, 28, 28, 'MASTER', { size: 5.8, style: 'yellow', ctl: 'master' });
btn(702, 475, 40, 14, 'KEY SYNC', { size: 6, style: 'blue', ctl: 'keysync' });
T(705, 516, 'TEMPO', { size: 7 }); T(705, 524, '±6/±10/±16/WIDE', { size: 5.2 }); rbtn(705, 538, 6.5, '#3a3b3e', '', { ctl: 'tempo-range' });
T(705, 560, 'MASTER', { size: 7 }); T(705, 568, 'TEMPO', { size: 7 }); rbtn(705, 582, 6.5, '#3a3b3e', '', { ctl: 'master-tempo' }); { const [cx, cy] = P(705, 582); add(`<circle cx="${cx}" cy="${cy}" r="3.5" fill="#ef4444"/>`); }
// fader de tempo
{
  const [x, y] = P(684, 604); const w = 42 * S; const h = 236 * S;
  add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#0b0b0c" stroke="#3a3c40"/>`);
  const [cx] = P(705, 0);
  add(`<rect x="${cx - 3.5}" y="${y + 14}" width="7" height="${h - 28}" rx="3.5" fill="#030303" stroke="#2b2c2e"/>`);
  for (let k = 0; k <= 16; k++) add(`<line x1="${cx - 20}" y1="${r1(y + 14 + k * (h - 28) / 16)}" x2="${cx - 12}" y2="${r1(y + 14 + k * (h - 28) / 16)}" stroke="#bdbdbd" stroke-width=".7"/>`);
  text(cx - 30, y + 28, '−', { size: 9 }); text(cx - 30, y + h - 22, '+', { size: 9 });
  const [, zy] = P(0, 720);
  add(`<rect x="${cx - 36}" y="${zy - 1.5}" width="10" height="3" rx="1.5" fill="#a3e635"/><rect x="${cx - 40}" y="${zy - 5}" width="18" height="10" rx="3" fill="#a3e635" opacity=".4" filter="url(#blur3)"/>`); text(cx - 22, zy + 3, '0', { size: 7, fill: '#a3e635' });
  add(`<g class="fader" data-ctl="tempo" data-top="${y + 14}" data-len="${h - 28}"><g class="cap"><rect x="${cx - 26}" y="${zy - 15}" width="52" height="32" rx="3" fill="#000" opacity=".7" filter="url(#blur3)"/><rect x="${cx - 26}" y="${zy - 18}" width="52" height="34" rx="3" fill="url(#faderCap)" stroke="#000"/><rect x="${cx - 23}" y="${zy - 1.5}" width="46" height="3" rx="1.5" fill="#f2f2f2"/></g></g>`);
  text(cx, y + h - 6, 'TEMPO', { size: 7 });
}
T(648, 742, 'TEMPO', { size: 6.5 }); T(648, 750, 'RESET', { size: 6.5 }); rbtn(648, 722, 7, '#3a3b3e', '', { ctl: 'tempo-reset' }); { const [cx, cy] = P(648, 722); add(`<circle cx="${cx}" cy="${cy}" r="3" fill="#facc15" opacity=".8"/>`); }

// --- jog ---
{
  const [cx, cy] = P(455, 600); const R = 205 * S;
  add(`<circle cx="${cx}" cy="${cy + 6}" r="${R + 6}" fill="#000" opacity=".7" filter="url(#blur5)"/>`);
  add(`<circle cx="${cx}" cy="${cy}" r="${R}" fill="#0d0e10" stroke="#2a2b2e" stroke-width="2"/>`);
  // anneau de bossages
  const n = 40; const rb = R - 15 * S;
  for (let i = 0; i < n; i++) {
    const [x, y] = polar(cx, cy, rb, i * 360 / n);
    add(`<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(9 * S)}" ry="${r1(7 * S)}" transform="rotate(${r1(i * 360 / n)} ${r1(x)} ${r1(y)})" fill="url(#bump)"/>`);
    add(`<ellipse cx="${r1(x - 2)}" cy="${r1(y - 2)}" rx="${r1(4 * S)}" ry="${r1(2.6 * S)}" transform="rotate(${r1(i * 360 / n)} ${r1(x)} ${r1(y)})" fill="#fff" opacity=".07"/>`);
  }
  // anneau chromé
  add(`<circle cx="${cx}" cy="${cy}" r="${R - 30 * S}" fill="none" stroke="url(#jogChrome)" stroke-width="${7 * S}"/>`);
  add(`<circle cx="${cx}" cy="${cy}" r="${R - 30 * S - 3.5 * S}" fill="none" stroke="#000" stroke-width="1.2" opacity=".7"/>`);
  // plateau (tourne)
  const Rp = R - 34 * S;
  add(`<g class="platter" data-ctl="jog" data-cx="${cx}" data-cy="${cy}" data-r="${Rp}">`);
  add(`<circle cx="${cx}" cy="${cy}" r="${Rp}" fill="url(#platter)"/>`);
  spun(cx, cy, Rp, 0.6, 1.6);
  add(`<line x1="${cx}" y1="${cy - Rp + 6}" x2="${cx}" y2="${cy - Rp + 26}" stroke="#fff" stroke-width="2" opacity=".35"/>`); // repère de rotation
  add('</g>');
  add(`<circle cx="${cx}" cy="${cy}" r="${Rp}" fill="url(#platterSheen)"/>`);
  // écran central du jog
  const Rc = 62 * S;
  add(`<circle cx="${cx}" cy="${cy}" r="${Rc + 4}" fill="#050505"/><circle cx="${cx}" cy="${cy}" r="${Rc}" fill="#0a0a0c" stroke="#2a2b30"/>`);
  add(`<path d="M${cx - Rc + 8} ${cy - 14}H${cx + Rc - 8}V${cy + 14}H${cx - Rc + 8}Z" fill="#2b8fd8"/>`);
  add(`<g data-ctl="jog-display"><circle cx="${cx}" cy="${cy}" r="${36 * S}" fill="#ffffff"/><circle cx="${cx}" cy="${cy}" r="${32 * S}" fill="#c81e3a"/><circle cx="${cx}" cy="${cy}" r="${24 * S}" fill="#be123c"/><circle cx="${cx}" cy="${cy}" r="${24 * S}" fill="#e11d48"/><circle cx="${cx}" cy="${cy}" r="${14 * S}" fill="#f97316" opacity=".85"/><circle cx="${cx}" cy="${cy}" r="${6 * S}" fill="#7c2d12"/></g>`);
  text(cx, cy - Rc + 16, 'MODE', { size: 6.5, fill: '#ddd' }); text(cx - 34, cy - Rc + 26, 'SLIP', { size: 6, fill: '#ef4444' }); text(cx + 34, cy - Rc + 26, 'VINYL', { size: 6, fill: '#38bdf8' });
  text(cx - 36, cy + Rc - 20, 'SYNC', { size: 6, fill: '#ddd' }); text(cx + 36, cy + Rc - 20, 'MASTER', { size: 6, fill: '#f59e0b' }); text(cx, cy + Rc - 10, 'BEAT SYNC', { size: 6, fill: '#ddd' });
  // REV / FWD
  const [lx, ly] = P(300, 770); const [rx, ry] = P(612, 770);
  add(`<path d="M${lx - 10} ${ly - 30}Q${lx} ${ly - 5} ${lx + 30} ${ly + 5}" fill="none" stroke="#cfcfcf" stroke-width="1"/><path d="M${rx + 10} ${ry - 30}Q${rx} ${ry - 5} ${rx - 30} ${ry + 5}" fill="none" stroke="#cfcfcf" stroke-width="1"/>`);
  T(295, 790, '−', { size: 9 }); T(295, 800, 'REV', { size: 7.5 }); T(615, 790, '+', { size: 9 }); T(615, 800, 'FWD', { size: 7.5 });
}

// --- marque ---
T(455, 832, 'DECKARR', { size: 23, weight: 800, fill: '#f2f2f2', spacing: 2.6, italic: true });
T(675, 856, 'MULTI PLAYER', { size: 6.5, anchor: 'end' }); T(740, 856, 'DKR-3000', { size: 12, weight: 800, anchor: 'end', spacing: 0.4 });
screw(158, 96); screw(742, 96); screw(158, 860); screw(742, 860);

add('</svg>');
const dest = path.join(__dirname, '..', '..', 'public', 'skins', 'deckarr.svg');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out.join('\n'));
console.log(`${dest} (${(fs.statSync(dest).size / 1024).toFixed(0)} Ko)`);
