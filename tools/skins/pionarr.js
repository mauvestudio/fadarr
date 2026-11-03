/**
 * Génère public/skins/pionarr.svg : façade de la « Pionarr » (mixeur 2 voies inspiré de la disposition d'une DJM-A9).
 * Tout est dessiné en vectoriel (aucune image, aucun logo ni police de marque) : net à toutes les tailles.
 * Les commandes branchées sur fadarr portent un id (data-ctl) : trim, hi, mid, low, color (filtre), fader, xfader, master…
 *
 * Usage : node tools/skins/pionarr.js  ->  public/skins/pionarr.svg
 */
'use strict';

const fs = require('fs');
const path = require('path');

const W = 893; const H = 1274;
const PANEL_TOP = 96;
const F = "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const out = [];
const add = (s) => out.push(s);
const r1 = (v) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function text(x, y, s, { size = 9.5, weight = 600, anchor = 'middle', fill = '#e9e9e9', spacing = 0.2, rot = 0, italic = false } = {}) {
  const t = rot ? ` transform="rotate(${rot} ${x} ${y})"` : '';
  add(`<text x="${r1(x)}" y="${r1(y)}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}" letter-spacing="${spacing}"${italic ? ' font-style="italic"' : ''}${t}>${s}</text>`);
}

const polar = (cx, cy, r, deg) => { const a = (deg - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };

/** Graduation de potard : points sur 300° (-150 à +150), gros points aux extrémités et au centre. */
function scaleDots(cx, cy, r, n = 11, { from = -150, to = 150, size = 1.25 } = {}) {
  for (let i = 0; i < n; i++) {
    const d = from + (to - from) * i / (n - 1);
    const [x, y] = polar(cx, cy, r, d);
    add(`<circle cx="${r1(x)}" cy="${r1(y)}" r="${size}" fill="#d8d8d8"/>`);
  }
}

/** Repères longs aux butées (comme « -26/-∞ » et « +6 »). */
function endTicks(cx, cy, r0, r1_) {
  for (const d of [-150, 150]) {
    const [x0, y0] = polar(cx, cy, r0, d); const [x1, y1] = polar(cx, cy, r1_, d);
    add(`<line x1="${r1(x0)}" y1="${r1(y0)}" x2="${r1(x1)}" y2="${r1(y1)}" stroke="#d8d8d8" stroke-width="1.4"/>`);
  }
}

/**
 * Potard. kind : 'eq' (anneau blanc), 'plain' (noir), 'trim' (gris), 'color' (gros, arc autour), 'small'.
 * Le groupe .rot tourne de -150° à +150° (valeur réglée par l'appli).
 */
/** Texture « métal tourné » : fins anneaux concentriques, très légers, sur le dessus du potard. */
function spun(cx, cy, rr, strength = 1) {
  let d = '';
  for (let k = 1.4, i = 0; k < rr; k += 1.15, i++) d += `<circle cx="${cx}" cy="${cy}" r="${r1(k)}" fill="none" stroke="${i % 2 ? '#000' : '#fff'}" stroke-opacity="${r1((i % 2 ? 0.05 : 0.045) * strength * 1000) / 1000}" stroke-width=".55"/>`;
  add(d);
}

function knob(cx, cy, r, kind = 'plain', ctl = '', value = 0) {
  const id = ctl ? ` data-ctl="${ctl}"` : '';
  const ang = value * 150;
  add(`<g class="knob ${kind}"${id} data-cx="${cx}" data-cy="${cy}">`);
  // ombre portée
  add(`<circle cx="${cx + 1.5}" cy="${cy + 3}" r="${r + 1.5}" fill="#000" opacity=".55" filter="url(#blur3)"/>`);
  if (kind === 'eq') add(`<circle cx="${cx}" cy="${cy}" r="${r + 1.6}" fill="url(#ring)"/>`);
  // jupe moletée
  add(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${kind === 'trim' ? 'skirtGrey' : 'skirt'})"/>`);
  add(`<circle cx="${cx}" cy="${cy}" r="${r - 0.8}" fill="none" stroke="${kind === 'trim' ? '#707274' : '#3c3d40'}" stroke-width="1.6" stroke-dasharray="0.9 1.3" opacity=".9"/>`);
  // dessus
  const top = r * 0.78;
  if (kind !== 'eq') add(`<circle cx="${cx}" cy="${cy}" r="${r1(top + 1.6)}" fill="url(#chromeRing)" opacity="${kind === 'color' ? 1 : 0.75}"/>`); // liseré chromé
  add(`<circle cx="${cx}" cy="${cy}" r="${top}" fill="url(#${kind === 'trim' ? 'capGrey' : kind === 'color' ? 'gunmetal' : 'cap'})"/>`);
  spun(cx, cy, top, kind === 'color' ? 1.6 : 1);
  add(`<circle cx="${cx}" cy="${cy}" r="${top}" fill="url(#spunSheen)"/>`);
  add(`<circle cx="${cx}" cy="${cy}" r="${top}" fill="url(#capShine)"/>`);
  add(`<g class="rot" transform="rotate(${ang} ${cx} ${cy})">`);
  add(`<rect x="${r1(cx - 1.6)}" y="${r1(cy - r - (kind === 'eq' ? 3 : 0.5))}" width="3.2" height="${r1(r * 0.92 + (kind === 'eq' ? 3 : 0.5))}" rx="1.4" fill="#f4f4f4"/>`);
  add('</g>');
  add(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#000" stroke-opacity=".6" stroke-width=".8"/>`);
  add('</g>');
}

/** Bouton rectangulaire. style : 'cueOn' (orange plein), 'cueOff' (contour orange), 'blue', 'blueOn', 'white', 'red', 'dark'. */
function button(cx, cy, w, h, label, style = 'dark', ctl = '', size = 9) {
  const id = ctl ? ` data-ctl="${ctl}"` : '';
  const x = cx - w / 2; const y = cy - h / 2;
  const S = {
    cueOn: { fill: 'url(#orangeLit)', stroke: '#ffb366', text: '#2a1300', glow: '#ff8a1f' },
    cueOff: { fill: 'url(#btnDark)', stroke: '#f08a2c', text: '#f6a04a', glow: null },
    blue: { fill: 'url(#btnDark)', stroke: '#2f7cf0', text: '#5aa2ff', glow: null },
    blueOn: { fill: 'url(#blueLit)', stroke: '#8cc2ff', text: '#ffffff', glow: '#2f7cf0' },
    white: { fill: 'url(#btnDark)', stroke: '#cfd2d6', text: '#e6e6e6', glow: null },
    red: { fill: 'url(#btnDark)', stroke: '#e0383a', text: '#ff5a5a', glow: null },
    dark: { fill: 'url(#btnDark)', stroke: '#4a4c50', text: '#e6e6e6', glow: null }
  }[style];
  add(`<g class="btn ${style}"${id}>`);
  add(`<rect x="${r1(x + 1)}" y="${r1(y + 2.5)}" width="${w}" height="${h}" rx="3" fill="#000" opacity=".6" filter="url(#blur2)"/>`);
  if (S.glow) add(`<rect x="${r1(x - 2)}" y="${r1(y - 2)}" width="${w + 4}" height="${h + 4}" rx="5" fill="${S.glow}" opacity=".45" filter="url(#blur4)"/>`);
  add(`<rect x="${r1(x)}" y="${r1(y)}" width="${w}" height="${h}" rx="3" fill="${S.fill}" stroke="${S.stroke}" stroke-width="1.6"/>`);
  add(`<rect x="${r1(x + 2)}" y="${r1(y + 1.5)}" width="${w - 4}" height="${h * 0.38}" rx="2" fill="#fff" opacity=".07"/>`);
  if (label) text(cx, cy + size * 0.36, label, { size, weight: 600, fill: S.text, spacing: 0 });
  add('</g>');
}

/** Bouton rond (TAP, ON/OFF, TALKOVER…). */
function roundButton(cx, cy, r, ring, label, ctl = '', lit = false, labelColor = '#e8e8e8') {
  const id = ctl ? ` data-ctl="${ctl}"` : '';
  add(`<g class="rbtn"${id}>`);
  add(`<circle cx="${cx + 1}" cy="${cy + 3}" r="${r + 2}" fill="#000" opacity=".6" filter="url(#blur3)"/>`);
  if (lit) add(`<circle cx="${cx}" cy="${cy}" r="${r + 4}" fill="${ring}" opacity=".45" filter="url(#blur4)"/>`);
  add(`<circle cx="${cx}" cy="${cy}" r="${r + 2.2}" fill="none" stroke="${ring}" stroke-width="2.6"/>`);
  add(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#rbtn)"/>`);
  add(`<ellipse cx="${cx - r * 0.25}" cy="${cy - r * 0.35}" rx="${r * 0.55}" ry="${r * 0.32}" fill="#fff" opacity=".08"/>`);
  if (label) text(cx, cy + 3.5, label, { size: 10, weight: 700, fill: labelColor, spacing: 0 });
  add('</g>');
}

function led(cx, cy, color = '#2f86ff', w = 9, h = 4) {
  add(`<rect x="${r1(cx - w / 2 - 1)}" y="${r1(cy - h / 2 - 1)}" width="${w + 2}" height="${h + 2}" rx="1" fill="#0a0a0a"/>`);
  add(`<rect x="${r1(cx - w / 2)}" y="${r1(cy - h / 2)}" width="${w}" height="${h}" rx=".8" fill="${color}" opacity=".9"/>`);
}

/** Vu-mètre vertical : 16 segments (12 … -30 dB). lit = nombre de segments allumés depuis le bas. */
function meter(x, yTop, ctl = '', lit = 0, seg = 16, step = 17) {
  const id = ctl ? ` data-ctl="${ctl}"` : '';
  add(`<g class="meter"${id}>`);
  add(`<rect x="${x - 3}" y="${yTop - 4}" width="15" height="${seg * step + 5}" rx="2" fill="#050505" stroke="#2a2b2d" stroke-width=".8"/>`);
  for (let i = 0; i < seg; i++) {
    const y = yTop + i * step;
    const c = i === 0 ? '#ff3b30' : i < 5 ? '#ffb020' : '#2fe05a';
    const on = seg - i <= lit;
    add(`<rect class="seg" data-i="${seg - 1 - i}" x="${x}" y="${y}" width="9" height="${step - 4.5}" rx="1" fill="${c}" opacity="${on ? 1 : 0.16}"/>`);
  }
  add('</g>');
}

function meterLabels(x, yTop, anchor = 'start', step = 17) {
  const L = ['12', '9', '6', '3', '0', '-3', '-6', '-9', '-12', '-15', '-18', '-21', '-24', '-27', '-30'];
  L.forEach((s, i) => text(x, yTop + i * step + 9, s, { size: 7.6, weight: 500, anchor, fill: '#d0d0d0', spacing: 0 }));
}

/** Fader vertical (curseur .cap déplaçable de 0 à 1). */
function fader(cx, yTop, len, ctl, value = 0.55, numbers = true) {
  add(`<g class="fader" data-ctl="${ctl}" data-top="${yTop}" data-len="${len}">`);
  for (let i = 0; i <= 10; i++) {
    const y = yTop + len * i / 10;
    add(`<line x1="${cx - 38}" y1="${r1(y)}" x2="${cx - 9}" y2="${r1(y)}" stroke="#cfcfcf" stroke-width="${i % 5 ? 0.8 : 1.3}"/>`);
    add(`<line x1="${cx + 9}" y1="${r1(y)}" x2="${cx + 38}" y2="${r1(y)}" stroke="#cfcfcf" stroke-width="${i % 5 ? 0.8 : 1.3}"/>`);
    if (numbers) text(cx + 58, y + 3, String(10 - i), { size: 8, weight: 500, fill: '#d6d6d6', spacing: 0 });
  }
  add(`<rect x="${cx - 3.5}" y="${yTop - 12}" width="7" height="${len + 24}" rx="3.5" fill="#030303" stroke="#2b2c2e" stroke-width=".8"/>`);
  const y = yTop + len * (1 - value);
  add(`<g class="cap" transform="translate(0 ${r1(y - yTop)})">`);
  add(`<rect x="${cx - 30}" y="${yTop - 7}" width="60" height="22" rx="2.5" fill="#000" opacity=".7" filter="url(#blur3)"/>`);
  add(`<rect x="${cx - 31}" y="${yTop - 11}" width="62" height="22" rx="2.5" fill="url(#faderCap)" stroke="#000" stroke-width=".8"/>`);
  add(`<rect x="${cx - 29}" y="${yTop - 9.5}" width="58" height="6" rx="2" fill="#fff" opacity=".07"/>`);
  add(`<rect x="${cx - 27}" y="${yTop - 1.5}" width="54" height="3" rx="1.5" fill="#f2f2f2"/>`);
  add('</g></g>');
}

/** Petit inverseur (A / THRU / B, courbes…). pos : -1, 0, 1. */
function toggle(cx, cy, w = 38, h = 22, pos = 0) {
  add(`<rect x="${cx - w / 2 + 1}" y="${cy - h / 2 + 2.5}" width="${w}" height="${h}" rx="3" fill="#000" opacity=".6" filter="url(#blur2)"/>`);
  add(`<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="3" fill="url(#btnDark)" stroke="#45474b" stroke-width="1"/>`);
  add(`<rect x="${cx - w / 2 + 4}" y="${cy - h / 2 + 4}" width="${w - 8}" height="${h - 8}" rx="2" fill="#070707"/>`);
  const lx = cx + pos * (w / 2 - 10);
  add(`<rect x="${lx - 5.5}" y="${cy - h / 2 + 2.5}" width="11" height="${h - 5}" rx="2" fill="url(#lever)" stroke="#000" stroke-width=".6"/>`);
  add(`<rect x="${lx - 1}" y="${cy - h / 2 + 4}" width="2" height="${h - 8}" rx="1" fill="#bfc2c6" opacity=".7"/>`);
}

function screw(cx, cy, r = 7.5) {
  add(`<circle cx="${cx}" cy="${cy + 1}" r="${r + 1}" fill="#000" opacity=".55" filter="url(#blur2)"/>`);
  add(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#screw)" stroke="#000" stroke-width=".6"/>`);
  add(`<path d="M${cx - r * 0.55} ${cy}H${cx + r * 0.55}M${cx} ${cy - r * 0.55}V${cy + r * 0.55}" stroke="#0b0b0b" stroke-width="1.6" stroke-linecap="round"/>`);
}

const vline = (x, y0, y1, c = '#7a7d81', w = 1.2) => add(`<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="${c}" stroke-width="${w}"/>`);
const hline = (x0, x1, y, c = '#7a7d81', w = 1.2) => add(`<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${c}" stroke-width="${w}"/>`);

// ---------------------------------------------------------------------------
// Façade
// ---------------------------------------------------------------------------

add(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${F}">`);
add(`<defs>
  <filter id="blur2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.4"/></filter>
  <filter id="blur3" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4"/></filter>
  <filter id="blur4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
  <filter id="grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .04 0"/>
  </filter>
  <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#18191b"/><stop offset=".5" stop-color="#121314"/><stop offset="1" stop-color="#0e0f10"/></linearGradient>
  <linearGradient id="bezel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2e3033"/><stop offset="1" stop-color="#080809"/></linearGradient>
  <radialGradient id="skirt" cx=".42" cy=".35" r=".75"><stop offset="0" stop-color="#3b3c40"/><stop offset=".7" stop-color="#1a1b1d"/><stop offset="1" stop-color="#0b0b0c"/></radialGradient>
  <radialGradient id="skirtGrey" cx=".42" cy=".35" r=".75"><stop offset="0" stop-color="#6a6c70"/><stop offset=".7" stop-color="#3c3e42"/><stop offset="1" stop-color="#202124"/></radialGradient>
  <radialGradient id="cap" cx=".4" cy=".3" r=".85"><stop offset="0" stop-color="#3d3e42"/><stop offset=".55" stop-color="#202124"/><stop offset="1" stop-color="#0e0e10"/></radialGradient>
  <radialGradient id="capGrey" cx=".4" cy=".3" r=".85"><stop offset="0" stop-color="#7a7c80"/><stop offset=".6" stop-color="#4b4d51"/><stop offset="1" stop-color="#2a2b2e"/></radialGradient>
  <radialGradient id="capShine" cx=".35" cy=".25" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#c9cbce"/><stop offset="1" stop-color="#8d9094"/></linearGradient>
  <linearGradient id="btnDark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2d31"/><stop offset="1" stop-color="#121315"/></linearGradient>
  <linearGradient id="orangeLit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb056"/><stop offset=".5" stop-color="#ff8c24"/><stop offset="1" stop-color="#e8700f"/></linearGradient>
  <linearGradient id="blueLit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5aa6ff"/><stop offset="1" stop-color="#1f66e0"/></linearGradient>
  <radialGradient id="rbtn" cx=".45" cy=".35" r=".8"><stop offset="0" stop-color="#2c2d31"/><stop offset="1" stop-color="#0b0b0c"/></radialGradient>
  <linearGradient id="faderCap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3b3f"/><stop offset=".45" stop-color="#1b1c1e"/><stop offset=".55" stop-color="#121314"/><stop offset="1" stop-color="#26272a"/></linearGradient>
  <linearGradient id="lever" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4a4c50"/><stop offset=".5" stop-color="#202124"/><stop offset="1" stop-color="#3c3e42"/></linearGradient>
  <radialGradient id="screw" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#5c5e62"/><stop offset="1" stop-color="#151617"/></radialGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7a5a1c"/><stop offset=".35" stop-color="#e9c46a"/><stop offset=".6" stop-color="#b8892e"/><stop offset="1" stop-color="#6d4f17"/></linearGradient>
  <linearGradient id="chromeRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7f8f9"/><stop offset=".18" stop-color="#9da0a4"/><stop offset=".36" stop-color="#eceef0"/><stop offset=".55" stop-color="#5f6266"/><stop offset=".72" stop-color="#d4d6d9"/><stop offset="1" stop-color="#6b6e72"/></linearGradient>
  <linearGradient id="chromeArc" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5d6064"/><stop offset=".25" stop-color="#e9ebed"/><stop offset=".5" stop-color="#9a9da1"/><stop offset=".75" stop-color="#f4f5f6"/><stop offset="1" stop-color="#6a6d71"/></linearGradient>
  <linearGradient id="gunmetal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6b6e73"/><stop offset=".3" stop-color="#2a2c2f"/><stop offset=".5" stop-color="#4f5256"/><stop offset=".7" stop-color="#1c1d1f"/><stop offset="1" stop-color="#3a3c40"/></linearGradient>
  <linearGradient id="spunSheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".12"/><stop offset=".65" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".1"/></linearGradient>
  <linearGradient id="chrome" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6d7075"/><stop offset=".4" stop-color="#f0f1f2"/><stop offset=".7" stop-color="#a7aaae"/><stop offset="1" stop-color="#5d6064"/></linearGradient>
  <linearGradient id="screen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d0e12"/><stop offset="1" stop-color="#050506"/></linearGradient>
  <linearGradient id="usbSlot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d3f43"/><stop offset=".55" stop-color="#242528"/><stop offset="1" stop-color="#111214"/></linearGradient>
</defs>`);

// --- connecteurs à l'arrière (dépassent en haut) ---
add(`<rect x="66" y="12" width="14" height="70" rx="6" fill="#151617"/><rect x="69" y="5" width="8" height="20" rx="4" fill="#232427"/>`); // antenne
for (const x of [190, 225, 262, 296, 330, 364, 400, 434, 470, 506, 540, 575, 610, 650]) {
  add(`<rect x="${x - 7}" y="66" width="14" height="30" rx="2" fill="url(#gold)"/><rect x="${x - 4.5}" y="64" width="9" height="6" rx="2" fill="#2a1f0a"/>`);
}
for (const x of [118, 690]) add(`<rect x="${x - 15}" y="56" width="30" height="40" rx="4" fill="url(#chrome)"/>`);
add('<rect x="720" y="70" width="60" height="26" rx="3" fill="#20365e"/><rect x="800" y="72" width="32" height="24" rx="3" fill="#151617"/>');

// --- plaque ---
add(`<rect x="0" y="${PANEL_TOP}" width="${W}" height="${H - PANEL_TOP}" rx="10" fill="url(#bezel)"/>`);
add(`<rect x="3" y="${PANEL_TOP + 3}" width="${W - 6}" height="${H - PANEL_TOP - 6}" rx="8" fill="url(#panel)"/>`);
add(`<rect x="3" y="${PANEL_TOP + 3}" width="${W - 6}" height="${H - PANEL_TOP - 6}" rx="8" filter="url(#grain)"/>`);
add(`<rect x="3.5" y="${PANEL_TOP + 3.5}" width="${W - 7}" height="${H - PANEL_TOP - 7}" rx="8" fill="none" stroke="#2c2e31" stroke-width="1"/>`);

// zones (comme la photo : séparations claires)
vline(140, 240, 1250); vline(277, 140, 1250); vline(400, 160, 600); vline(400, 625, 845); vline(400, 855, 1130);
vline(520, 140, 1250); vline(653, 140, 1250);
hline(277, 520, 612); hline(520, 653, 612, '#8c8f93', 0); hline(277, 650, 725);
hline(140, 277, 515); hline(140, 277, 885);

// --- marque ---
text(398, 132, 'PIONARR', { size: 25, weight: 800, fill: '#f2f2f2', spacing: 2.6, italic: true });
text(820, 1247, 'PNR-A2', { size: 15, weight: 800, fill: '#f0f0f0', spacing: 0.6, anchor: 'end' });
text(737, 1247, 'PROFESSIONAL MIXER', { size: 7.2, weight: 600, fill: '#d8d8d8', spacing: 0.4, anchor: 'end' });

// ============ colonne gauche : USB, micro ============
text(138, 140, 'USB', { size: 12.5, weight: 600 });
for (const [x0, lbl] of [[30, 'A'], [157, 'B']]) {
  text(x0 + 60, 157, `▭ ${lbl}`, { size: 9 });
  add(`<rect x="${x0}" y="166" width="90" height="62" rx="4" fill="#0a0a0b" stroke="#3c3e42"/><rect x="${x0 + 5}" y="171" width="80" height="44" rx="3" fill="url(#usbSlot)"/>`);
  add(`<rect x="${x0 + 8}" y="220" width="74" height="4" rx="2" fill="#2f86ff"/><rect x="${x0 + 4}" y="216" width="82" height="12" rx="4" fill="#2f86ff" opacity=".35" filter="url(#blur3)"/>`);
}
text(75, 260, 'MIC', { size: 12.5, weight: 600 });
for (const [y, n] of [[296, '1'], [355, '2']]) { text(36, y + 4, n, { size: 9 }); scaleDots(75, y, 29, 11); knob(75, y, 19, 'plain'); text(48, y + 27, '−∞', { size: 8 }); text(100, y + 27, '0', { size: 8 }); }
text(116, 335, 'LEVEL', { size: 8.5 });
add('<path d="M100 296H108V355H100" fill="none" stroke="#bdbdbd" stroke-width="1"/>');
for (const [y, n] of [[438, 'HI'], [505, 'LOW']]) { text(32, y + 4, n, { size: 9, anchor: 'end' }); scaleDots(75, y, 29, 11); knob(75, y, 18, 'plain'); text(50, y + 27, '−12', { size: 8 }); text(100, y + 27, '+12', { size: 8 }); }
text(116, 478, 'EQ', { size: 8.5 }); add('<path d="M100 438H108V505H100" fill="none" stroke="#bdbdbd" stroke-width="1"/>');
text(75, 558, 'TALKOVER', { size: 8.5 }); roundButton(75, 580, 8, '#3a3b3e', '', '', false); add('<circle cx="75" cy="580" r="4" fill="#ff3b30"/>');
text(75, 623, 'MIC FX', { size: 9.5 });
button(75, 647, 40, 26, 'ECHO', 'blue', '', 7.5); button(75, 704, 40, 26, 'PITCH', 'blue', '', 7.5); button(75, 760, 40, 26, 'MEGA', 'blue', '', 7.5);
text(75, 806, 'PARAMETER', { size: 9 }); scaleDots(75, 838, 34, 11); knob(75, 838, 24, 'plain'); text(48, 870, 'LOW', { size: 7.5 }); text(102, 870, 'HI', { size: 7.5 });
text(75, 909, 'MIC REVERB', { size: 9 }); button(75, 933, 34, 22, 'ON', 'blue', '', 8);
text(75, 969, 'PARAMETER', { size: 9 }); scaleDots(75, 1000, 32, 11); knob(75, 1000, 22, 'plain'); text(48, 1031, 'MIN', { size: 7.5 }); text(102, 1031, 'MAX', { size: 7.5 });
text(75, 1074, 'BEAT FX', { size: 7.5 }); led(75, 1090);
text(75, 1123, 'MIC', { size: 9.5 }); text(75, 1135, '— PUSH TO TALK', { size: 6.5 });
roundButton(75, 1163, 13, '#2f7cf0', 'ON', '', false, '#5aa2ff');

// ============ 2e colonne : alim, Sound Color FX, casque A ============
text(208, 260, '— MIC 1 PHANTOM —', { size: 8 }); text(208, 273, '— ON/OFF', { size: 7 }); button(208, 295, 36, 22, '+48V', 'red', '', 8);
text(208, 333, '— BLUETOOTH —', { size: 8.5 }); text(208, 345, '— PAIRING', { size: 7 }); button(208, 365, 36, 24, '✱', 'blue', '', 11);
text(208, 401, '— MIDI —', { size: 9.5 }); text(208, 418, 'ON / OFF', { size: 8 }); button(208, 438, 36, 24, '—', 'blue', '', 10);
text(208, 474, 'START/STOP', { size: 8 }); button(208, 495, 36, 24, '▸ ▮▮', 'blue', '', 7.5);
text(208, 540, 'SOUND COLOR FX', { size: 11, weight: 600 });
add('<rect x="160" y="550" width="102" height="15" rx="2" fill="none" stroke="#cfcfcf" stroke-width="1"/>'); text(203, 561, 'CENTER LOCK', { size: 8 }); add('<rect x="246" y="553.5" width="12" height="8" rx="1.5" fill="none" stroke="#cfcfcf"/>');
text(208, 577, 'OFF • • ON', { size: 7 }); toggle(208, 590, 28, 20, 1);
const scfx = [['SPACE', 180, 647], ['DUB\nECHO', 236, 647], ['CRUSH', 180, 704], ['SWEEP', 236, 704], ['NOISE', 180, 760], ['FILTER', 236, 760]];
for (const [l, x, y] of scfx) {
  if (l.includes('\n')) { button(x, y, 38, 26, '', 'white'); const [a, b] = l.split('\n'); text(x, y - 1.5, a, { size: 7 }); text(x, y + 7, b, { size: 7 }); } else button(x, y, 38, 26, l, 'white', l === 'FILTER' ? 'scfx-filter' : '', 7.2);
}
text(208, 806, 'PARAMETER', { size: 9 }); scaleDots(205, 838, 32, 11); knob(205, 838, 22, 'plain'); text(180, 870, 'MIN', { size: 7.5 }); text(232, 870, 'MAX', { size: 7.5 });
text(208, 909, 'HEADPHONES A', { size: 11, weight: 600 });
button(180, 935, 34, 24, '', 'cueOff'); text(180, 933, 'LINK', { size: 6.8, fill: '#f6a04a' }); text(180, 941, 'CUE', { size: 6.8, fill: '#f6a04a' });
button(236, 935, 34, 24, '', 'cueOff'); text(236, 933, 'MONO', { size: 6.8, fill: '#f6a04a' }); text(236, 941, 'SPLIT', { size: 6.8, fill: '#f6a04a' });
text(208, 972, 'MIX', { size: 9 }); scaleDots(205, 1000, 31, 11); knob(205, 1000, 20, 'plain', 'cuemix'); text(182, 1034, 'CUE', { size: 7.5 }); text(234, 1034, 'MASTER', { size: 7.5 });
text(208, 1052, 'LEVEL', { size: 9 }); scaleDots(205, 1080, 31, 11); knob(205, 1080, 20, 'plain', 'phones'); text(182, 1114, '−∞', { size: 8 }); text(230, 1114, '0', { size: 8 });
text(205, 1137, 'PHONES A', { size: 9 });
add('<circle cx="205" cy="1188" r="14" fill="url(#gold)"/><circle cx="205" cy="1188" r="9" fill="#2a2a2a"/><circle cx="205" cy="1188" r="5" fill="#050505"/>');

// ============ voies 1 et 2 ============
const INPUTS = [['DIGITAL', -30, -27, 'middle'], ['LINE', 0, -31, 'middle'], ['PHONO', 31, -27, 'middle'], ['▭ B', -25, -11, 'end'], ['▭ A', -26, 3, 'end'], ['✱', -24, 15, 'end'], ['RETURN', 25, -11, 'start'], ['▭ USB', 26, 3, 'start']];
for (const i of [0, 1]) {
  const cx = 343 + i * 119.5; const ch = String(i + 1); const c = `ch${ch}`;
  // sélecteur d'entrée
  for (const [l, dx, dy, an] of INPUTS) text(cx + dx, 200 + dy, l, { size: 7, anchor: an, spacing: 0 });
  for (const d of [-62, -28, 0, 28, 62, -90, 90, -118]) { const [x0, y0] = polar(cx, 200, 19, d); const [x1, y1] = polar(cx, 200, 26, d); add(`<line x1="${r1(x0)}" y1="${r1(y0)}" x2="${r1(x1)}" y2="${r1(y1)}" stroke="#cfcfcf" stroke-width="1"/>`); }
  knob(cx, 200, 17, 'plain', '', 0);
  text(cx - 34, 257, ch, { size: 36, weight: 600, fill: '#f3f3f3', spacing: 0 });
  text(cx, 253, 'TRIM', { size: 10.5 });
  scaleDots(cx, 283, 27, 11); knob(cx, 283, 18, 'trim', `${c}-trim`); text(cx - 19, 310, '−∞', { size: 7.6 }); text(cx + 22, 310, '+9', { size: 7.6 });
  meter(cx - 58, 263, `${c}-meter`, i === 0 ? 9 : 6);
  meterLabels(cx - 45.5, 263);
  text(cx - 53, 548, 'dB', { size: 7 });
  text(cx - 31, 325, 'EQ/', { size: 8, anchor: 'start' }); text(cx - 31, 335, 'ISO', { size: 8, anchor: 'start' });
  const bands = [['HI', 370], ['MID', 460], ['LOW', 550]];
  for (const [n, y] of bands) {
    text(cx, y - 41, n, { size: 10.5 });
    scaleDots(cx, y, 31, 11); endTicks(cx, y, 28, 33);
    knob(cx, y, 21, 'eq', `${c}-${n.toLowerCase()}`);
    text(cx - 10, y + 38, '-26/-∞', { size: 6.8, anchor: 'end', spacing: 0 }); text(cx + 26, y + 38, '+6', { size: 7.4 });
  }
  // COLOR (filtre de fadarr)
  text(cx, 623, 'COLOR', { size: 10 });
  add(`<rect x="${cx - 11}" y="627" width="22" height="8.5" rx="1.5" fill="#d8d8d8"/>`); text(cx, 633.6, 'LOCK', { size: 6, fill: '#111', spacing: 0 });
  const [ax, ay] = polar(cx, 673, 33, -135); const [bx, by] = polar(cx, 673, 33, 135);
  add(`<path d="M${r1(ax)} ${r1(ay + 1.5)}A33 33 0 1 1 ${r1(bx)} ${r1(by + 1.5)}" fill="none" stroke="#000" stroke-width="7" stroke-linecap="round" opacity=".6" filter="url(#blur2)"/>`);
  add(`<path d="M${r1(ax)} ${r1(ay)}A33 33 0 1 1 ${r1(bx)} ${r1(by)}" fill="none" stroke="url(#chromeArc)" stroke-width="5.5" stroke-linecap="round"/>`);
  add(`<path d="M${r1(ax)} ${r1(ay - 1.4)}A31.6 31.6 0 1 1 ${r1(bx)} ${r1(by - 1.4)}" fill="none" stroke="#fff" stroke-width=".8" stroke-linecap="round" opacity=".45"/>`);
  knob(cx, 673, 25, 'color', `${c}-color`);
  text(cx - 30, 714, 'LOW', { size: 7.6 }); text(cx + 30, 714, 'HI', { size: 7.6 });
  // CUE
  text(cx - 39, 758, 'A', { size: 9 }); text(cx + 15, 758, 'B', { size: 9 });
  button(cx - 23, 777, 50, 24, 'CUE', 'cueOn', `${c}-cue`, 9.5);
  button(cx + 30, 777, 32, 24, 'CUE', 'cueOff', '', 8.5);
  led(cx - 30, 818); text(cx + 4, 821, 'BEAT FX', { size: 7.6 });
  // fader
  add(`<rect x="${cx - 56}" y="850" width="${i === 0 ? 118 : 118}" height="0" />`);
  fader(cx, 900, 130, `${c}-fader`, 0.6 - i * 0.05, true);
  // A / THRU / B
  text(cx, 1083, 'A  THRU  B', { size: 8 }); text(cx, 1093, '•  •  •', { size: 8 });
  toggle(cx, 1107, 40, 22, 0);
}
// cadre de la zone des faders
add('<rect x="289" y="848" width="223" height="197" rx="4" fill="none" stroke="#2c2e31" stroke-width="1.2"/>');
add('<path d="M322 1130V1142H716" fill="none" stroke="#bdbdbd" stroke-width="1"/>'.replace('716', '478')); add('<path d="M478 1130V1142" fill="none" stroke="#bdbdbd" stroke-width="1"/>');
text(400, 1157, 'CROSSFADER ASSIGN', { size: 8.5 });
// crossfader
text(398, 1175, 'PRECISION GLIDE', { size: 9.5, weight: 800, spacing: 1.2, italic: true });
text(312, 1215, '‹A', { size: 13, weight: 600 }); text(486, 1215, 'B›', { size: 13, weight: 600 });
for (let k = -6; k <= 6; k++) add(`<line x1="${398 + k * 10}" y1="${k % 3 ? 1185 : 1180}" x2="${398 + k * 10}" y2="${k % 3 ? 1235 : 1240}" stroke="#cfcfcf" stroke-width="${k % 3 ? 0.8 : 1.3}"/>`);
add('<rect x="336" y="1206" width="124" height="8" rx="4" fill="#030303" stroke="#2b2c2e"/>');
add('<g class="xfader" data-ctl="xfader" data-x0="350" data-x1="446"><g class="cap"><rect x="384" y="1187" width="28" height="48" rx="3" fill="#000" opacity=".7" filter="url(#blur3)"/><rect x="384" y="1183" width="28" height="48" rx="3" fill="url(#faderCap)" stroke="#000"/><rect x="396.5" y="1186" width="3" height="42" rx="1.5" fill="#f2f2f2"/></g></g>');
screw(25, 122); screw(290, 160); screw(520, 290); screw(672, 122); screw(868, 122); screw(25, 1250); screw(868, 1250); screw(400, 600); screw(400, 860); screw(400, 1120);

// ============ master (décalé de 240 px : 2 voies au lieu de 4) ============
const M = 593;
text(M, 130, 'MASTER', { size: 12.5, weight: 600 }); text(M, 144, 'LEVEL', { size: 9 });
scaleDots(M, 183, 33, 11); knob(M, 183, 24, 'plain', 'master'); text(M - 28, 218, '−∞', { size: 8 }); text(M + 30, 218, '+5dB', { size: 7 }); text(M + 30, 168, '0dB', { size: 7 });
add(`<rect x="${M - 12}" y="227" width="24" height="10" rx="1.5" fill="#b3261e"/>`); text(M, 235, 'CLIP', { size: 6.5, fill: '#ffd7d2', spacing: 0 });
text(M - 30, 254, 'L', { size: 8 }); text(M, 254, 'dB', { size: 8 }); text(M + 30, 254, 'R', { size: 8 });
meter(M - 35, 263, 'master-l', 10); meter(M + 26, 263, 'master-r', 10);
meterLabels(M, 263, 'middle');
text(M, 556, 'BOOTH EQ', { size: 9 });
text(M - 37, 588, 'HI', { size: 9 }); scaleDots(M, 585, 23, 9); knob(M, 585, 15, 'plain'); text(M - 20, 607, '−12', { size: 7 }); text(M + 22, 607, '+6', { size: 7 });
text(M - 37, 641, 'LOW', { size: 9 }); scaleDots(M, 638, 23, 9); knob(M, 638, 15, 'plain'); text(M - 20, 660, '−12', { size: 7 }); text(M + 22, 660, '+6', { size: 7 });
text(M, 672, 'BOOTH LEVEL', { size: 9 }); scaleDots(M, 705, 28, 11); knob(M, 705, 19, 'plain'); text(M - 24, 734, '−∞', { size: 8 }); text(M + 24, 734, '0', { size: 8 });
text(M - 23, 758, 'A', { size: 9 }); text(M + 30, 758, 'B', { size: 9 });
button(M - 23, 777, 32, 24, 'CUE', 'cueOff', 'master-cue', 8.5); button(M + 30, 777, 32, 24, 'CUE', 'cueOff', '', 8.5);
led(M - 30, 818); text(M + 4, 821, 'BEAT FX', { size: 7.6 });
text(M, 855, 'HEADPHONES B', { size: 11, weight: 600 });
button(M - 30, 878, 30, 24, '', 'cueOff'); text(M - 30, 876, 'LINK', { size: 6.5, fill: '#f6a04a' }); text(M - 30, 884, 'CUE', { size: 6.5, fill: '#f6a04a' });
button(M + 30, 878, 30, 24, '', 'cueOff'); text(M + 30, 876, 'MONO', { size: 6.5, fill: '#f6a04a' }); text(M + 30, 884, 'SPLIT', { size: 6.5, fill: '#f6a04a' });
text(M, 912, 'MIX', { size: 9 }); scaleDots(M, 938, 25, 11); knob(M, 938, 16, 'plain'); text(M - 24, 963, 'CUE', { size: 7 }); text(M + 28, 963, 'MASTER', { size: 7 });
text(M, 980, 'LEVEL', { size: 9 }); scaleDots(M, 1003, 25, 11); knob(M, 1003, 16, 'plain'); text(M - 22, 1029, '−∞', { size: 8 }); text(M + 22, 1029, '0', { size: 8 });
hline(M - 60, M + 60, 1040);
text(M, 1052, 'EQ CURVE', { size: 9 }); text(M - 38, 1075, 'ISO', { size: 8.5 }); text(M + 38, 1075, 'EQ', { size: 8.5 }); toggle(M, 1072, 34, 20, 1);
text(M, 1096, 'CH FADER', { size: 9 });
add(`<path d="M${M - 26} 1110L${M - 12} 1102M${M - 8} 1110L${M + 2} 1103H${M + 8}M${M + 12} 1110L${M + 18} 1102H${M + 28}" fill="none" stroke="#e0e0e0" stroke-width="1.6"/>`);
toggle(M, 1126, 34, 20, 0);
text(M, 1150, 'CROSSFADER', { size: 9 });
add(`<path d="M${M - 26} 1166V1158H${M - 14}V1166M${M - 8} 1166L${M} 1158L${M + 8} 1166M${M + 14} 1158L${M + 28} 1166M${M + 14} 1166L${M + 28} 1158" fill="none" stroke="#e0e0e0" stroke-width="1.4"/>`);
toggle(M, 1182, 34, 20, -1);

// ============ effets (décalés de 240 px) ============
const X = 768; // centre de la colonne effets (1008 sur la photo)
text(X, 137, 'MULTI I/O', { size: 12.5, weight: 600 });
text(X - 73, 159, 'SEND CH', { size: 8.5 }); scaleDots(X - 73, 196, 22, 6, { from: -120, to: 60 }); knob(X - 73, 196, 15, 'plain');
text(X - 98, 184, '4', { size: 7 }); text(X - 99, 200, '3', { size: 7 }); text(X - 96, 214, '2', { size: 7 }); text(X - 86, 224, '1', { size: 7 }); text(X - 70, 172, 'MIC', { size: 6.5 }); text(X - 50, 178, 'CF.B', { size: 6.5 }); text(X - 44, 192, 'MASTER', { size: 6.5, anchor: 'start' });
text(X, 159, 'INSERT SOURCE', { size: 8 }); text(X, 170, 'RETURN', { size: 7.5 }); text(X, 225, '▭ USB', { size: 7.5 });
text(X + 65, 159, '▭ USB', { size: 9 }); add(`<rect x="${X + 43}" y="166" width="44" height="58" rx="3" fill="#0a0a0b" stroke="#3c3e42"/><rect x="${X + 48}" y="171" width="34" height="48" rx="2" fill="url(#usbSlot)"/>`);
text(X + 52, 240, '5V⎓2.1A', { size: 6.5, anchor: 'start' }); led(X + 65, 254, '#2f86ff', 8, 3.5);
text(X - 73, 244, 'SEND LEVEL', { size: 8.5 }); scaleDots(X - 73, 272, 24, 11); knob(X - 73, 272, 16, 'plain'); text(X - 92, 300, 'MIN', { size: 7 }); text(X - 52, 300, 'MAX', { size: 7 });
text(X, 252, 'INSERT', { size: 9 }); roundButton(X, 276, 12, '#2f7cf0', '', '', true); add(`<circle cx="${X}" cy="276" r="6" fill="#3d8bff"/>`);
text(X, 321, 'BEAT FX', { size: 12.5, weight: 600 });
// écran (nos propres textes)
add(`<rect x="${X - 98}" y="330" width="196" height="160" rx="3" fill="#000" stroke="#3a3b3e"/><rect x="${X - 94}" y="334" width="188" height="152" rx="2" fill="url(#screen)"/>`);
add(`<g class="screen" data-ctl="fx-screen" font-family="${F}">`);
add(`<rect x="${X - 76}" y="356" width="44" height="12" fill="none" stroke="#e0533a" stroke-width="1"/>`); text(X - 54, 365, 'QUANTIZE', { size: 6.8, fill: '#e0533a', spacing: 0 });
add(`<rect x="${X - 28}" y="356" width="24" height="12" fill="#e8e8e8"/>`); text(X - 16, 365, 'AUTO', { size: 6.8, fill: '#111', spacing: 0 });
text(X + 40, 369, '<tspan class="bpm">124.0</tspan><tspan font-size="7"> BPM</tspan>', { size: 18, weight: 500, fill: '#fff', spacing: 0 });
text(X, 389, '<tspan class="fxname">ECHO</tspan>', { size: 18, weight: 600, fill: '#fff', spacing: 0.3 });
add(`<rect x="${X - 76}" y="396" width="152" height="24" fill="none" stroke="#8a8a8a"/><rect x="${X - 25}" y="396" width="50" height="24" fill="#fff"/>`);
text(X - 50, 413, '1/2', { size: 14, weight: 500, fill: '#e8e8e8', spacing: 0 }); text(X, 413, '1', { size: 14, weight: 500, fill: '#111', spacing: 0 }); text(X + 50, 413, '2', { size: 14, weight: 500, fill: '#e8e8e8', spacing: 0 });
text(X, 438, 'TIME <tspan font-size="13" fill="#fff">484</tspan> msec', { size: 7, weight: 500, fill: '#bbb', spacing: 0 });
add(`<rect x="${X - 76}" y="446" width="152" height="11" fill="#6a2bff"/>`); text(X, 454.5, 'X-PAD', { size: 6.8, fill: '#fff', spacing: 0 });
add(`<rect x="${X - 76}" y="459" width="152" height="22" fill="none" stroke="#555"/>`);
add(`<path d="M${X - 64} 476V466H${X - 58}V476H${X - 52}V466" fill="none" stroke="#fff" stroke-width="1.6"/><path d="M${X - 8} 466L${X + 8} 476" stroke="#fff" stroke-width="1.6"/><path d="M${X + 52} 476L${X + 58} 466L${X + 64} 476" fill="none" stroke="#fff" stroke-width="1.6"/>`);
add('</g>');
// X-PAD
add(`<rect x="${X - 97}" y="494" width="194" height="94" rx="3" fill="none" stroke="#3a3b3e"/>`);
text(X, 508, 'X-PAD', { size: 9.5 });
add(`<rect x="${X - 90}" y="516" width="180" height="56" rx="3" fill="#0b0c0e" stroke="#2a2b2e"/><rect x="${X - 86}" y="521" width="172" height="40" rx="2" fill="#15161a"/>`);
add(`<rect x="${X - 86}" y="521" width="172" height="40" rx="2" filter="url(#grain)" opacity=".9"/>`);
add(`<line x1="${X - 78}" y1="541" x2="${X + 78}" y2="541" stroke="#3d6cff" stroke-width="1.2" stroke-dasharray="2 3" opacity=".9"/>`);
for (let k = -3; k <= 3; k++) add(`<line x1="${X + k * 24}" y1="556" x2="${X + k * 24}" y2="565" stroke="#555" stroke-width="1"/>`);
button(X - 47, 600, 44, 22, '◀', 'dark', 'fx-beat-down', 10); button(X, 600, 46, 22, 'BEAT', 'dark', '', 8.5); button(X + 47, 600, 44, 22, '▶', 'dark', 'fx-beat-up', 10);
text(X - 54, 633, 'AUTO', { size: 7.5 }); text(X - 54, 643, '/TAP', { size: 7.5 }); roundButton(X - 54, 660, 10, '#2a2b2e', '');
roundButton(X, 648, 17, '#22c55e', 'TAP', 'fx-tap', true, '#3ee07a');
text(X + 55, 627, 'QUANTIZE', { size: 7.5 }); text(X + 55, 637, '— UTILITY', { size: 7.5 }); roundButton(X + 55, 653, 8, '#2a2b2e', ''); add(`<circle cx="${X + 55}" cy="653" r="3.5" fill="#ff3b30"/>`);
add(`<rect x="${X + 39}" y="665" width="34" height="9" rx="1.5" fill="none" stroke="#cfcfcf" stroke-width=".8"/>`); text(X + 56, 672, 'WAKE UP', { size: 5.5 });
text(X, 693, 'FX FREQUENCY', { size: 9.5 });
button(X - 55, 713, 40, 24, 'LOW', 'blueOn', 'fx-low', 9); button(X, 713, 40, 24, 'MID', 'blueOn', 'fx-mid', 9); button(X + 55, 713, 40, 24, 'HI', 'blueOn', 'fx-hi', 9);
const FX = ['DELAY', 'ECHO', 'PING PONG', 'SPIRAL', 'REVERB', 'FLANGER', 'PHASER', 'FILTER', 'TRANS', 'ROLL', 'GLIDE'];
FX.forEach((n, i) => { const d = -135 + i * 27; const [x, y] = polar(X, 788, 38, d); text(x + (d < -8 ? -2 : d > 8 ? 2 : 0), y + 3, n, { size: 7, anchor: d < -8 ? 'end' : d > 8 ? 'start' : 'middle', spacing: 0 }); });
knob(X, 788, 20, 'plain', 'fx-select', -0.7);
for (const [k, l] of [[-1.5, '1'], [-0.5, '2'], [0.5, 'MIC'], [1.5, 'MST']]) button(X + k * 45, 866, 32, 18, l, 'blue', `fx-ch-${l.toLowerCase()}`, 8.5);
text(X, 893, 'CH SELECT', { size: 9 });
text(X, 966, 'TIME', { size: 9.5 }); knob(X, 997, 22, 'plain', 'fx-time');
text(X, 1059, 'LEVEL / DEPTH', { size: 9.5 }); scaleDots(X, 1092, 32, 11); knob(X, 1092, 21, 'plain', 'fx-depth'); text(X - 26, 1124, 'MIN', { size: 7 }); text(X + 26, 1124, 'MAX', { size: 7 });
text(X, 1153, 'ON/OFF', { size: 9.5 });
add(`<circle cx="${X}" cy="1196" r="30" fill="#2f86ff" opacity=".35" filter="url(#blur4)"/>`);
add(`<g data-ctl="fx-on"><circle cx="${X}" cy="1196" r="25" fill="#0f1830" stroke="#3a3c40" stroke-width="2"/><circle cx="${X}" cy="1196" r="21" fill="url(#blueLit)"/><ellipse cx="${X - 5}" cy="1188" rx="11" ry="6" fill="#fff" opacity=".25"/></g>`);

add('</svg>');

const dest = path.join(__dirname, '..', '..', 'public', 'skins', 'pionarr.svg');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out.join('\n'));
console.log(`${dest} (${(fs.statSync(dest).size / 1024).toFixed(0)} Ko)`);
