/**
 * Technicarr : platine vinyle à entraînement direct (dessin et physique repris de la maquette « platinarr » de Ludovic),
 * branchée sur un deck de fadarr. Utilisée par le skin « Technicarr + Xonarr » (public/hwskin.js).
 *
 * Le son ne passe plus par l'AudioBufferSourceNode du deck : un petit lecteur à vitesse variable lit le morceau du deck
 * à la vitesse du disque (y compris en arrière, pour le scratch), puis entre dans la chaîne du deck (gain, EQ, filtres,
 * fader, crossfader), exactement comme le lecteur normal. Le deck garde la main sur le reste : play / pause = START · STOP,
 * seek et hot cues = le bras se déplace, fader de pitch = tempo du deck (SYNC compris).
 *
 * Gestes : bouton rond = marche ; START · STOP ; glisser la tête de lecture pour poser le diamant ; levier CUE = lever /
 * poser ; attraper le vinyle = scratch ; fader de pitch (+ vers soi, comme sur la vraie) ; RESET = 0 % ; clic sur « ±8 »
 * = plage du pitch ; 33 / 45 ; lampe.
 */
(function () {
  'use strict';

  // ===================================================================== géométrie (unités logiques, plinthe 1000 × 760)
  const W = 1000; const H = 760;
  const C = { x: 400, y: 380 };
  const PR = 334; const RR = 300; const LABEL = 96;
  const P = { x: 832, y: 172 }; const L = 470;
  const R_OUT = 288; const R_END = 122; const R_RUN = 108; const R_EDGE = 297;
  const TH_REST = 86 * Math.PI / 180; const TH_MIN = 83 * Math.PI / 180; const TH_MAX = 146 * Math.PI / 180;
  const OMEGA0 = 33.3333 / 60 * 2 * Math.PI;
  const KNOB = { x: 96, y: 580, r: 31 }; const STARTSTOP = { x: 38, y: 636, w: 124, h: 96 };
  const SP33 = { x: 180, y: 684, w: 68, h: 26 }; const SP45 = { x: 180, y: 714, w: 68, h: 26 };
  const PITCH = { x: 950, y0: 318, y1: 690 }; const RESET = { x: 893, y: 700, r: 15 };
  const CUE = { x: 912, y: 262 }; const LAMP = { x: 748, y: 108, r: 14 };
  const RANGE_LBL = { x: 950, y: 296 };
  const STROBE_ANG = Math.atan2(KNOB.y - C.y, KNOB.x - C.x);
  const STROBE_ROWS = [{ r: 309, pct: 6 }, { r: 315.5, pct: 3 }, { r: 322, pct: 0 }, { r: 328.5, pct: -3 }];
  const LIGHT = -2.25;
  const LEADIN = 2.2; const RUNOUT = 2.0;
  const F_DISP = 'Michroma, Eurostile, "Arial Black", sans-serif';
  const F_MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
  const F_BODY = '"IBM Plex Sans Condensed", "Arial Narrow", system-ui, sans-serif';

  const D_PC = Math.hypot(C.x - P.x, C.y - P.y); const A_PC = Math.atan2(C.y - P.y, C.x - P.x);
  const thetaOf = (r) => { const c = (L * L + D_PC * D_PC - r * r) / (2 * L * D_PC); return A_PC - Math.acos(Math.max(-1, Math.min(1, c))); };
  const stylusAt = (th) => ({ x: P.x + L * Math.cos(th), y: P.y + L * Math.sin(th) });
  const radiusAtTheta = (th) => { const s = stylusAt(th); return Math.hypot(s.x - C.x, s.y - C.y); };
  const inR = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  const distSeg = (p, a, b) => { const dx = b.x - a.x; const dy = b.y - a.y; const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))); return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); };
  function rr(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }

  /** Aléatoire reproductible de bonne qualité (mulberry32) : un LCG simple aligne ses tirages et dessine des anneaux. */
  function rng(seed) { let t = seed >>> 0; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
  let grainTile = null;
  function grain(size, seed) {
    const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'); const im = x.createImageData(size, size);
    let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < size * size; i++) { const v = 128 + (rnd() - 0.5) * 70; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
    x.putImageData(im, 0, 0); return c;
  }
  function grainFill(x, alpha, comp) {
    if (!grainTile) grainTile = grain(256, 9);
    x.save(); x.globalAlpha = alpha; x.globalCompositeOperation = comp || 'overlay';
    x.fillStyle = x.createPattern(grainTile, 'repeat'); x.fill(); x.restore();
  }
  function metalKnob(x, cx, cy, r) {
    const kg = x.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
    kg.addColorStop(0, '#f4f5f6'); kg.addColorStop(0.6, '#a8abb0'); kg.addColorStop(1, '#5d6065');
    x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fillStyle = kg; x.fill();
    if (x.createConicGradient) {
      const cg = x.createConicGradient(LIGHT, cx, cy);
      [[0, 0.35], [0.1, 0], [0.4, 0], [0.5, 0.25], [0.6, 0], [0.9, 0], [1, 0.35]].forEach(([o, a]) => cg.addColorStop(o, `rgba(255,255,255,${a})`));
      x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fillStyle = cg; x.fill();
    }
  }
  function tube(x, path, w) {
    path(); x.strokeStyle = '#2a2b2f'; x.lineWidth = w + 3; x.stroke();
    path(); x.strokeStyle = '#8d9095'; x.lineWidth = w; x.stroke();
    path(); x.strokeStyle = '#d7d9dc'; x.lineWidth = w * 0.55; x.stroke();
    path(); x.strokeStyle = 'rgba(255,255,255,.95)'; x.lineWidth = 1.4; x.stroke();
  }

  // ===================================================================== une platine
  class Turntable {
    /** unit : conteneur (.hw-tt) ; d : deck fadarr ; app : window.fadarrApp. */
    constructor(unit, d, app) {
      this.unit = unit; this.d = d; this.app = app;
      this.canvas = unit.querySelector('canvas.tt-canvas'); this.g = this.canvas.getContext('2d');
      this.scale = 1; this.dpr = 1; this.base = null; this.recordImg = null; this.recordKey = '';
      this.S = {
        power: true, running: false, rpm: 33.3333,
        omega: 0, rec: 0, platAng: 0, recAng: 0,
        armTh: TH_REST, armH: 0, cueUp: false, lamp: true,
        drag: null, held: null, pos: d.offset || 0, needleDown: false, auto: null, autoReturn: true,
        lastRev: 0, hover: null, ssPressed: 0, lastDrop: null, strobeT: 0
      };
      this.A = { pos: 0, rate: 0, target: 0, gain: 0, gainT: 0, seek: null, thump: 0, tick: 0, click: 0, hissLp: 0 };
      this.buf = d.buffer || null; this.node = null; this.last = 0;
      // le deck jouait : on reprend au même endroit, diamant posé, plateau lancé (pas de coupure au changement de skin)
      if (d.playing && d.buffer) {
        const p = d.position; d.stopSource();
        this.S.running = true; this.S.omega = this.S.rec = d.rate; this.S.pos = p;
        this.S.armTh = thetaOf(this.radiusOf(p)); this.S.needleDown = true; this.A.pos = p * d.buffer.sampleRate; this.A.rate = this.A.target = d.rate; this.A.gain = this.A.gainT = 1;
        this.ensureNode();
      }
      d.vinyl = this;
      this.bind();
      this.resize();
    }

    get dur() { return this.d.duration || 120; }
    radiusOf(pos) {
      const dur = this.dur;
      if (pos < 0) return R_OUT + Math.min(1, -pos / LEADIN) * (R_EDGE - R_OUT);
      if (pos <= dur) return R_OUT - pos / dur * (R_OUT - R_END);
      return R_END - Math.min(1, (pos - dur) / RUNOUT) * (R_END - R_RUN);
    }
    posOf(r) {
      const dur = this.dur;
      if (r > R_OUT) return -LEADIN * (r - R_OUT) / (R_EDGE - R_OUT);
      if (r >= R_END) return (R_OUT - r) / (R_OUT - R_END) * dur;
      return dur + RUNOUT * Math.min(1, (R_END - r) / (R_END - R_RUN));
    }

    // ------------------------------------------------------------------ interface avec le deck
    /** Position lue par le deck (formes d'onde, temps, SYNC). */
    get pos() { return Math.max(0, Math.min(this.dur, this.S.pos)); }
    /** START (deck.play / startAt) : plateau lancé ; bras au repos -> il vient se poser sur `pos` (le cue). */
    start(pos) {
      const S = this.S; S.power = true; S.running = true; S.ssPressed = 0.15;
      const atRest = !S.needleDown && S.armTh <= TH_REST + 0.02 && !S.auto;
      if (atRest) { S.pos = pos; S.auto = { dir: 'in', phase: 0, h: 1, th: thetaOf(this.radiusOf(pos)) }; }
      else if (Math.abs(pos - S.pos) > 0.08) this.locate(pos);
      this.ensureNode();
    }
    /** STOP (deck.pause) : frein électronique. */
    stop() { this.S.running = false; this.S.ssPressed = 0.15; }
    /** Hot cue, clic dans la forme d'onde : le diamant saute à cet endroit. */
    locate(pos) {
      const S = this.S; S.pos = pos;
      if (S.needleDown || S.armTh > TH_REST + 0.02) { S.armTh = thetaOf(this.radiusOf(pos)); if (S.needleDown) this.A.seek = pos * (this.buf ? this.buf.sampleRate : 44100); }
    }

    ensureNode() {
      if (this.node) return;
      const d = this.d; if (!d.auto) { if (this.app.audio) this.app.audio(); if (!d.auto) return; }
      const ctx = d.auto.context;
      this.node = ctx.createScriptProcessor(1024, 0, 2);
      this.node.onaudioprocess = (e) => this.process(e, ctx.sampleRate);
      this.node.connect(d.auto);
    }

    process(e, sr) {
      const L0 = e.outputBuffer.getChannelData(0); const R0 = e.outputBuffer.getChannelData(1); const n = L0.length;
      const b = this.buf; const A = this.A; const d = this.d;
      if (!b) { L0.fill(0); R0.fill(0); return; }
      const bsr = b.sampleRate; const len = b.length; const step = bsr / sr;
      const dL = b.getChannelData(0); const dR = b.numberOfChannels > 1 ? b.getChannelData(1) : dL;
      if (A.seek !== null) { A.pos = A.seek; A.seek = null; }
      const ks = 1 - Math.exp(-1 / (0.006 * sr)); const kg = 1 - Math.exp(-1 / (0.004 * sr));
      const loop = d.loop && d.loop.active ? { s: d.loop.start * bsr, e: d.loop.end * bsr } : null;
      for (let i = 0; i < n; i++) {
        A.rate += (A.target - A.rate) * ks; A.gain += (A.gainT - A.gain) * kg;
        let l = 0; let r = 0; const p = A.pos;
        if (p >= 0 && p < len - 1) { const i0 = Math.floor(p); const f = p - i0; l = dL[i0] + (dL[i0 + 1] - dL[i0]) * f; r = dR[i0] + (dR[i0 + 1] - dR[i0]) * f; }
        const ar = Math.abs(A.rate);
        // craquements, souffle, choc du diamant, « tic » du sillon fermé : discrets, proportionnels à la vitesse
        if (Math.random() < 0.00002 * ar) A.click = 0.04 + Math.random() * 0.12;
        let noise = 0;
        if (A.click > 0.001) { noise += (Math.random() * 2 - 1) * A.click; A.click *= 0.82; }
        A.hissLp += ((Math.random() * 2 - 1) - A.hissLp) * 0.25; noise += A.hissLp * 0.003 * Math.min(1.5, ar);
        if (A.thump > 0.0005) { noise += Math.sin(A.thump * 900) * A.thump * 0.6 + (Math.random() * 2 - 1) * A.thump * 0.1; A.thump *= 0.9985; }
        if (A.tick > 0.001) { noise += (Math.random() * 2 - 1) * A.tick; A.tick *= 0.7; }
        const k = Math.min(1, ar * 1.2) * A.gain; const nz = noise * A.gain;
        L0[i] = l * k + nz; R0[i] = r * k + nz;
        A.pos += A.rate * step;
        if (loop && A.rate > 0 && A.pos >= loop.e) A.pos -= loop.e - loop.s;
        if (A.pos > len + RUNOUT * bsr) A.pos = len + RUNOUT * bsr;
      }
    }

    // ------------------------------------------------------------------ physique (une image)
    step(dt) {
      const S = this.S; const A = this.A; const d = this.d;
      S.strobeT += dt;
      if (this.buf !== d.buffer) { // nouveau disque : le bras se lève et retourne au repos ; START le reposera sur le cue
        this.buf = d.buffer; this.recordKey = '';
        if (S.needleDown || S.armTh > TH_REST + 0.02) S.auto = { dir: 'out', phase: 0, h: 1 };
        S.pos = d.offset || 0;
      }
      const target = S.power && S.running ? (S.rpm / 33.3333) * d.rate : 0;
      const diff = target - S.omega;
      if (S.power) S.omega += Math.sign(diff) * Math.min(Math.abs(diff), dt * (diff > 0 ? 1.6 : 1.25));
      else S.omega += Math.sign(diff) * Math.min(Math.abs(diff), dt * 0.12);
      S.platAng += S.omega * OMEGA0 * dt;
      if (S.drag === 'rec' && S.held) { S.rec += (S.held.vel - S.rec) * Math.min(1, dt * 30); S.held.vel *= Math.pow(0.02, dt); }
      else S.rec += (S.omega - S.rec) * Math.min(1, dt * 14);
      if (S.drag !== 'rec') S.recAng += S.rec * OMEGA0 * dt;

      if (S.auto) this.autoStep(dt);
      const wantH = S.drag === 'arm' || S.cueUp || (S.auto && S.auto.h > 0.5) ? 1 : 0;
      const hs = wantH > S.armH ? (S.drag === 'arm' ? 8 : 1.6) : (!S.cueUp && S.drag !== 'arm' && S.lastDrop === 'hand' ? 9 : 1.6);
      S.armH += Math.sign(wantH - S.armH) * Math.min(Math.abs(wantH - S.armH), dt * hs);
      const r = radiusAtTheta(S.armTh); const onRec = r <= R_EDGE + 2 && r >= R_RUN - 4;
      const down = S.armH < 0.04 && onRec && Boolean(this.buf);
      if (down && !S.needleDown) {
        S.needleDown = true; S.pos = this.posOf(r); this.ensureNode();
        A.seek = S.pos * this.buf.sampleRate; A.thump = S.lastDrop === 'hand' ? 0.9 : 0.35;
      }
      if (!down && S.needleDown) { S.needleDown = false; S.lastDrop = null; }
      if (S.needleDown) {
        S.pos = this.node ? A.pos / this.buf.sampleRate : S.pos + S.rec * dt;
        S.armTh = thetaOf(this.radiusOf(S.pos));
        if (S.pos > this.dur + 0.1) {
          const rev = Math.floor(S.recAng / (Math.PI * 2)); if (rev !== S.lastRev) A.tick = 0.3; S.lastRev = rev;
          if (S.autoReturn && !S.auto && S.pos > this.dur + RUNOUT - 0.05 && S.rec > 0.3) S.auto = { dir: 'out', phase: 0, h: 1, end: true };
        }
      } else if (onRec && this.buf && S.drag === 'arm') S.pos = this.posOf(r); // le temps affiché suit le bras
      A.target = S.needleDown ? S.rec : 0; A.gainT = S.needleDown ? 1 : 0;
    }
    autoStep(dt) {
      const S = this.S; const a = S.auto; const sp = 0.9 * dt;
      const go = (th) => { const dd = th - S.armTh; S.armTh += Math.sign(dd) * Math.min(Math.abs(dd), sp); return Math.abs(dd) < 0.002; };
      if (a.phase === 0) { a.h = 1; if (S.armH > 0.95) a.phase = 1; }
      else if (a.phase === 1) { if (go(a.dir === 'in' ? a.th : TH_REST)) a.phase = 2; }
      else if (a.phase === 2) {
        a.h = 0; S.lastDrop = 'auto';
        if (S.armH < 0.04) { if (a.end) { S.running = false; if (this.d.playing) this.d.pause(); this.d.offset = 0; S.pos = 0; } S.auto = null; }
      }
    }

    // ------------------------------------------------------------------ dessin
    resize() {
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = this.canvas.clientWidth || W;
      this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(w * H / W * this.dpr);
      this.scale = this.canvas.width / W;
      this.buildBase(); this.recordKey = ''; this.sheenKey = '';
    }
    off(w, h) { const c = document.createElement('canvas'); c.width = Math.ceil(w * this.scale); c.height = Math.ceil(h * this.scale); const x = c.getContext('2d'); x.scale(this.scale, this.scale); return [c, x]; }

    buildBase() {
      const [c, x] = this.off(W, H);
      x.save(); x.shadowColor = 'rgba(0,0,0,.75)'; x.shadowBlur = 40; x.shadowOffsetY = 18;
      rr(x, 6, 6, W - 12, H - 12, 22); x.fillStyle = '#0b0b0c'; x.fill(); x.restore();
      rr(x, 6, 6, W - 12, H - 12, 22);
      const edge = x.createLinearGradient(0, 0, 0, H); edge.addColorStop(0, '#2a2a2d'); edge.addColorStop(1, '#050506'); x.fillStyle = edge; x.fill();
      rr(x, 10, 8, W - 20, H - 22, 19);
      const top = x.createLinearGradient(0, 0, W * 0.7, H); top.addColorStop(0, '#232326'); top.addColorStop(0.5, '#17171a'); top.addColorStop(1, '#101012');
      x.fillStyle = top; x.fill(); grainFill(x, 0.55, 'overlay');
      rr(x, 10, 8, W - 20, H - 22, 19); grainFill(x, 0.06, 'screen');
      x.strokeStyle = 'rgba(255,255,255,.10)'; x.lineWidth = 1.2; rr(x, 11, 9, W - 22, H - 24, 18); x.stroke();
      [[36, 32], [W - 36, 32], [36, H - 44], [W - 36, H - 44]].forEach(([sx, sy]) => {
        const sg = x.createRadialGradient(sx - 1.5, sy - 1.5, 0.5, sx, sy, 6); sg.addColorStop(0, '#6a6a70'); sg.addColorStop(1, '#1a1a1d');
        x.fillStyle = sg; x.beginPath(); x.arc(sx, sy, 5.5, 0, Math.PI * 2); x.fill();
        x.strokeStyle = '#0a0a0b'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(sx - 3.5, sy); x.lineTo(sx + 3.5, sy); x.stroke();
      });
      x.save(); x.beginPath(); x.arc(C.x, C.y, PR + 9, 0, Math.PI * 2); x.fillStyle = '#050506'; x.fill();
      x.beginPath(); x.arc(C.x, C.y, PR + 9, 0, Math.PI * 2); x.strokeStyle = 'rgba(255,255,255,.08)'; x.lineWidth = 1.5; x.stroke(); x.restore();
      x.save(); x.shadowColor = 'rgba(0,0,0,.8)'; x.shadowBlur = 16; x.shadowOffsetX = 5; x.shadowOffsetY = 8;
      x.beginPath(); x.arc(C.x, C.y, PR, 0, Math.PI * 2); x.fillStyle = '#8a8c90'; x.fill(); x.restore();
      for (let r = RR + 4; r <= PR; r += 0.6) {
        const t = (r - RR) / (PR - RR); const b = 120 + 70 * Math.sin(t * Math.PI) + ((r * 7.13) % 1) * 18;
        x.strokeStyle = `rgb(${b | 0},${b + 2 | 0},${b + 6 | 0})`; x.lineWidth = 0.7; x.beginPath(); x.arc(C.x, C.y, r, 0, Math.PI * 2); x.stroke();
      }
      if (x.createConicGradient) {
        const cg = x.createConicGradient(LIGHT, C.x, C.y);
        [[0, 0], [0.04, 0.55], [0.09, 0], [0.46, 0], [0.5, 0.35], [0.55, 0], [1, 0]].forEach(([o, a]) => cg.addColorStop(o, `rgba(255,255,255,${a})`));
        x.beginPath(); x.arc(C.x, C.y, PR, 0, Math.PI * 2); x.arc(C.x, C.y, RR + 4, 0, Math.PI * 2, true); x.fillStyle = cg; x.fill('evenodd');
        const cd = x.createConicGradient(LIGHT + 1.6, C.x, C.y);
        [[0, 0], [0.12, 0.35], [0.25, 0], [1, 0]].forEach(([o, a]) => cd.addColorStop(o, `rgba(0,0,0,${a})`));
        x.beginPath(); x.arc(C.x, C.y, PR, 0, Math.PI * 2); x.arc(C.x, C.y, RR + 4, 0, Math.PI * 2, true); x.fillStyle = cd; x.fill('evenodd');
      }
      x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 1; x.beginPath(); x.arc(C.x, C.y, PR - 0.5, LIGHT - 0.9, LIGHT + 0.9); x.stroke();
      x.beginPath(); x.arc(C.x, C.y, RR + 4, 0, Math.PI * 2); x.fillStyle = '#121214'; x.fill();
      x.save(); x.shadowColor = 'rgba(0,0,0,.7)'; x.shadowBlur = 14; x.shadowOffsetX = 4; x.shadowOffsetY = 6;
      x.beginPath(); x.arc(P.x, P.y, 88, 0, Math.PI * 2); x.fillStyle = '#1b1b1e'; x.fill(); x.restore();
      x.beginPath(); x.arc(P.x, P.y, 88, 0, Math.PI * 2); grainFill(x, 0.4, 'overlay');
      const ring = x.createLinearGradient(P.x - 70, P.y - 70, P.x + 70, P.y + 70); ring.addColorStop(0, '#d9dadd'); ring.addColorStop(0.5, '#5b5d62'); ring.addColorStop(1, '#b4b6ba');
      x.beginPath(); x.arc(P.x, P.y, 70, 0, Math.PI * 2); x.strokeStyle = ring; x.lineWidth = 3; x.stroke();
      x.beginPath(); x.arc(P.x, P.y, 88, 0, Math.PI * 2); x.strokeStyle = 'rgba(255,255,255,.09)'; x.lineWidth = 1; x.stroke();
      const rest = stylusAt(TH_REST); const rp = { x: rest.x - 22, y: rest.y - 46 };
      x.save(); x.shadowColor = 'rgba(0,0,0,.8)'; x.shadowBlur = 8; x.shadowOffsetX = 3; x.shadowOffsetY = 4;
      x.beginPath(); x.arc(rp.x, rp.y, 12, 0, Math.PI * 2); x.fillStyle = '#2a2a2e'; x.fill(); x.restore();
      const rg = x.createRadialGradient(rp.x - 3, rp.y - 3, 1, rp.x, rp.y, 9); rg.addColorStop(0, '#c9cbcf'); rg.addColorStop(1, '#45474c');
      x.beginPath(); x.arc(rp.x, rp.y, 8, 0, Math.PI * 2); x.fillStyle = rg; x.fill();
      rr(x, PITCH.x - 24, PITCH.y0 - 30, 48, PITCH.y1 - PITCH.y0 + 60, 9); x.fillStyle = '#0e0e10'; x.fill();
      rr(x, PITCH.x - 24, PITCH.y0 - 30, 48, PITCH.y1 - PITCH.y0 + 60, 9); x.strokeStyle = 'rgba(255,255,255,.06)'; x.stroke();
      rr(x, PITCH.x - 3.5, PITCH.y0 - 10, 7, PITCH.y1 - PITCH.y0 + 20, 3.5); x.fillStyle = '#000'; x.fill();
      for (let i = -8; i <= 8; i++) {
        const y = PITCH.y0 + (PITCH.y1 - PITCH.y0) * (i + 8) / 16; const big = i % 4 === 0;
        x.fillStyle = big ? 'rgba(235,235,240,.75)' : 'rgba(235,235,240,.35)'; x.fillRect(PITCH.x - 38, y - 0.5, big ? 10 : 6, 1);
      }
      x.fillStyle = 'rgba(240,240,244,.85)'; x.textAlign = 'left'; x.font = `9px ${F_DISP}`;
      x.fillText('CUE', CUE.x - 12, CUE.y - 30); x.fillText('RESET', RESET.x - 18, RESET.y + 32);
      x.font = `8.5px ${F_MONO}`; x.textAlign = 'center'; x.fillText('PITCH ADJ.', PITCH.x, PITCH.y1 + 46);
      x.textAlign = 'left'; x.font = `300 21px ${F_DISP}`; const w1 = x.measureText('Technic').width;
      x.fillStyle = 'rgba(240,240,244,.92)'; x.fillText('Technic', 610, 714);
      x.font = `700 21px ${F_DISP}`; x.fillStyle = '#e8e8ec'; x.fillText('arr', 610 + w1, 714);
      x.font = `8px ${F_DISP}`; x.fillStyle = 'rgba(240,240,244,.55)'; x.fillText('DIRECT DRIVE  ·  QUARTZ LOCK  ·  DD-1', 611, 732);
      x.font = `8.5px ${F_MONO}`; x.fillStyle = 'rgba(240,240,244,.6)';
      ['+6', '+3', ' 0', '−3'].forEach((t, i) => { x.beginPath(); x.arc(146, 618 + i * 11, i === 2 ? 2.4 : 1.5, 0, Math.PI * 2); x.fill(); x.fillText(t + (i === 2 ? ' %' : ''), 154, 621 + i * 11); });
      rr(x, STARTSTOP.x - 5, STARTSTOP.y - 5, STARTSTOP.w + 10, STARTSTOP.h + 10, 8); x.fillStyle = '#050506'; x.fill();
      rr(x, SP33.x - 4, SP33.y - 4, SP33.w + 8, SP45.y + SP45.h - SP33.y + 8, 6); x.fillStyle = '#050506'; x.fill();
      this.base = c;
    }

    /** Plages du disque (entre les morceaux) : rayons des sillons plus larges et lisses. */
    bands() { return [0.17, 0.39, 0.62, 0.81].map((f) => R_OUT - f * (R_OUT - R_END)); }

    /**
     * Le disque (tourne avec le plateau) : vinyle noir profond, sillons très fins, plages lisses entre les morceaux,
     * rebord biseauté, zone de sortie miroir, étiquette rouge pressée (anneaux en relief) avec le titre en encre sombre.
     */
    buildRecord() {
      const tr = this.d.track;
      const title = tr ? (tr.title || tr.path.split('/').pop().replace(/\.[a-z0-9]+$/i, '')) : '';
      const artist = tr ? tr.artist || '' : '';
      const key = `${this.scale}|${title}|${artist}|${this.S.rpm}`;
      if (key === this.recordKey) return; this.recordKey = key;
      const [c, x] = this.off(RR * 2, RR * 2); const cx = RR; const cy = RR;
      const rnd = rng(11);
      // corps
      const body = x.createRadialGradient(cx, cy, LABEL, cx, cy, RR); body.addColorStop(0, '#060607'); body.addColorStop(0.92, '#09090a'); body.addColorStop(1, '#131315');
      x.beginPath(); x.arc(cx, cy, RR, 0, Math.PI * 2); x.fillStyle = body; x.fill();
      // sillons : un trait par ~0,45 unité, intensité qui varie doucement (modulation de la gravure)
      const bands = this.bands();
      // sillons : de fins arcs clairs semés au hasard (des cercles réguliers d'un pixel feraient du moiré)
      for (let i = 0; i < 5200; i++) {
        const r = R_END - 1 + rnd() * (R_OUT - R_END + 3); if (Math.min(...bands.map((b) => Math.abs(r - b))) < 1.4) continue;
        const a0 = rnd() * Math.PI * 2; x.strokeStyle = `rgba(255,255,255,${0.01 + rnd() * 0.025})`; x.lineWidth = 0.35 + rnd() * 0.35;
        x.beginPath(); x.arc(cx, cy, r, a0, a0 + 0.3 + rnd() * 1.6); x.stroke();
      }
      bands.forEach((b) => { x.strokeStyle = 'rgba(0,0,0,.95)'; x.lineWidth = 2.4; x.beginPath(); x.arc(cx, cy, b, 0, Math.PI * 2); x.stroke(); });
      // entrée (bord) et sortie (vers l'étiquette) : quelques sillons espacés, puis le miroir
      for (const [r0, r1] of [[R_OUT + 3, RR - 4], [LABEL + 14, R_END - 3]]) for (let r = r0; r < r1; r += 3.1) { x.strokeStyle = 'rgba(255,255,255,.03)'; x.lineWidth = 0.6; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke(); }
      // rebord biseauté
      x.strokeStyle = 'rgba(255,255,255,.10)'; x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, RR - 2, 0, Math.PI * 2); x.stroke();
      x.strokeStyle = 'rgba(0,0,0,.9)'; x.lineWidth = 1.2; x.beginPath(); x.arc(cx, cy, RR - 3.6, 0, Math.PI * 2); x.stroke();
      // poussières (rares)
      for (let i = 0; i < 45; i++) { const a = rnd() * Math.PI * 2; const r = LABEL + 12 + rnd() * (RR - LABEL - 18); x.fillStyle = `rgba(255,255,255,${0.12 + rnd() * 0.28})`; x.fillRect(cx + r * Math.cos(a), cy + r * Math.sin(a), 0.5 + rnd() * 0.8, 0.5); }
      // anneau mat autour de l'étiquette
      x.strokeStyle = 'rgba(255,255,255,.05)'; x.lineWidth = 6; x.beginPath(); x.arc(cx, cy, LABEL + 6, 0, Math.PI * 2); x.stroke();
      // étiquette rouge pressée
      x.save(); x.beginPath(); x.arc(cx, cy, LABEL, 0, Math.PI * 2); x.clip();
      const lab = x.createRadialGradient(cx - 20, cy - 24, 8, cx, cy, LABEL); lab.addColorStop(0, '#f2453a'); lab.addColorStop(0.7, '#e2342b'); lab.addColorStop(1, '#c92a22');
      x.fillStyle = lab; x.fillRect(0, 0, RR * 2, RR * 2);
      x.beginPath(); x.arc(cx, cy, LABEL, 0, Math.PI * 2); grainFill(x, 0.22, 'overlay');
      // anneaux en relief (pressage) : un trait clair + un trait sombre décalés, éclairés du même côté que le plateau
      for (const rr0 of [LABEL * 0.8, LABEL * 0.47, LABEL * 0.2]) {
        x.lineWidth = 1.1;
        x.strokeStyle = 'rgba(255,190,180,.35)'; x.beginPath(); x.arc(cx - 0.6, cy - 0.6, rr0, 0, Math.PI * 2); x.stroke();
        x.strokeStyle = 'rgba(90,10,8,.45)'; x.beginPath(); x.arc(cx + 0.6, cy + 0.6, rr0, 0, Math.PI * 2); x.stroke();
      }
      x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, LABEL - 1, 0, Math.PI * 2); x.stroke();
      // texte imprimé en encre sombre, discret, entre les anneaux
      const ink = 'rgba(40,6,5,.78)';
      const fit = (t, max) => { let u = t; while (u.length > 3 && x.measureText(u).width > max) u = u.slice(0, -2); return u === t ? t : `${u.trim()}…`; };
      x.textAlign = 'center'; x.fillStyle = ink;
      x.font = `300 11px ${F_DISP}`; const wA = x.measureText('Technic').width; x.font = `700 11px ${F_DISP}`; const wB = x.measureText('arr').width;
      x.textAlign = 'left'; x.font = `300 11px ${F_DISP}`; x.fillText('Technic', cx - (wA + wB) / 2, cy - 54); x.font = `700 11px ${F_DISP}`; x.fillText('arr', cx - (wA + wB) / 2 + wA, cy - 54);
      x.textAlign = 'center';
      x.font = `600 11.5px ${F_BODY}`; x.fillText(fit(title || 'fadarr', 120), cx, cy + 58);
      if (artist) { x.font = `500 9.5px ${F_BODY}`; x.fillStyle = 'rgba(40,6,5,.62)'; x.fillText(fit(artist, 110), cx, cy + 70); }
      x.font = `7px ${F_MONO}`; x.fillStyle = 'rgba(40,6,5,.55)';
      x.fillText(`A  ·  ${this.S.rpm < 40 ? '33⅓' : '45'}`, cx + 62, cy + 3); x.fillText('LC-001', cx - 62, cy + 3);
      x.restore();
      // trou central
      x.beginPath(); x.arc(cx, cy, 5.2, 0, Math.PI * 2); x.fillStyle = '#000'; x.fill();
      x.strokeStyle = 'rgba(255,220,210,.5)'; x.lineWidth = 0.8; x.beginPath(); x.arc(cx, cy, 5.6, 0, Math.PI * 2); x.stroke();
      this.recordImg = c;
    }

    /**
     * Reflet du vinyle (fixe : c'est la lumière de la pièce, il ne tourne pas avec le disque) : les sillons accrochent la
     * lumière en deux grands éventails opposés. Les sillons étant circulaires, le calque est construit une fois.
     */
    buildSheen() {
      const key = `${this.scale}`; if (this.sheenKey === key) return; this.sheenKey = key;
      const [c, x] = this.off(RR * 2, RR * 2); const cx = RR; const cy = RR;
      const rnd = rng(7);
      // profil radial : sillons brillants (légère variation d'un morceau à l'autre), plages sombres, entrée / sortie plus mates
      const bands = this.bands(); const prof = x.createRadialGradient(cx, cy, LABEL + 8, cx, cy, RR - 2);
      const span = RR - 2 - (LABEL + 8); const at = (rad) => Math.max(0, Math.min(1, (rad - LABEL - 8) / span));
      prof.addColorStop(0, 'rgba(255,255,255,.18)'); prof.addColorStop(at(R_END - 3), 'rgba(255,255,255,.22)');
      const edges = [R_END, ...bands.slice().reverse(), R_OUT];
      for (let i = 0; i < edges.length - 1; i++) {
        const r0 = edges[i]; const r1 = edges[i + 1]; const lv = 0.75 + rnd() * 0.25;
        prof.addColorStop(at(r0 + 1.6), `rgba(255,255,255,${lv})`); prof.addColorStop(at(r1 - 1.6), `rgba(255,255,255,${lv * (0.9 + rnd() * 0.1)})`);
        if (i < edges.length - 2) prof.addColorStop(at(r1), 'rgba(255,255,255,.06)');
      }
      prof.addColorStop(at(R_OUT + 3), 'rgba(255,255,255,.35)'); prof.addColorStop(1, 'rgba(255,255,255,.3)');
      x.beginPath(); x.arc(cx, cy, RR - 2, 0, Math.PI * 2); x.arc(cx, cy, LABEL + 8, 0, Math.PI * 2, true); x.fillStyle = prof; x.fill('evenodd');
      // grain fin des sillons dans le reflet : bruit tourné en anneaux (pas de traits réguliers, donc pas de moiré)
      x.save(); x.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 2600; i++) { const rad = LABEL + 10 + rnd() * (RR - LABEL - 13); const a0 = rnd() * Math.PI * 2; x.strokeStyle = `rgba(0,0,0,${0.15 + rnd() * 0.35})`; x.lineWidth = 0.4 + rnd() * 0.6; x.beginPath(); x.arc(cx, cy, rad, a0, a0 + 0.2 + rnd() * 1.2); x.stroke(); }
      x.restore();
      // masque : deux éventails (haut-droite et bas-gauche), plus un léger troisième, comme sur la photo
      x.globalCompositeOperation = 'destination-in';
      if (x.createConicGradient) {
        const g = x.createConicGradient(-Math.PI * 0.32, cx, cy);
        [[0, 0], [0.03, 0.12], [0.085, 0.75], [0.105, 0.55], [0.17, 0.12], [0.26, 0], [0.47, 0], [0.5, 0.1], [0.565, 0.6], [0.585, 0.4], [0.65, 0.07], [0.74, 0], [0.9, 0], [0.95, 0.05], [1, 0]]
          .forEach(([o, al]) => g.addColorStop(o, `rgba(0,0,0,${al})`));
        x.fillStyle = g; x.fillRect(0, 0, RR * 2, RR * 2);
      }
      x.globalCompositeOperation = 'source-over';
      // voile brillant très doux sur tout le disque (vernis du vinyle)
      const v = x.createLinearGradient(RR * 2, 0, 0, RR * 2); v.addColorStop(0, 'rgba(255,255,255,.05)'); v.addColorStop(0.5, 'rgba(255,255,255,0)'); v.addColorStop(1, 'rgba(255,255,255,.03)');
      x.beginPath(); x.arc(cx, cy, RR - 2, 0, Math.PI * 2); x.arc(cx, cy, LABEL + 2, 0, Math.PI * 2, true); x.fillStyle = v; x.fill('evenodd');
      this.sheenImg = c;
    }

    drawStrobe(x) {
      const S = this.S;
      STROBE_ROWS.forEach((row, ri) => {
        const nDots = 90; const step = Math.PI * 2 / nDots; const rad = ri % 2 ? 1.9 : 2.4;
        for (let k = 0; k < nDots; k++) {
          const a0 = S.platAng + k * step; let a = a0; let inLight = false;
          if (S.power) {
            const dd = Math.atan2(Math.sin(a0 - STROBE_ANG), Math.cos(a0 - STROBE_ANG));
            if (Math.abs(dd) < 0.42) { inLight = true; const nominal = OMEGA0 * (1 + row.pct / 100) * (S.rpm / 33.3333) * S.strobeT; a = a0 - nominal + Math.round(nominal / step) * step; }
          }
          const px = C.x + row.r * Math.cos(a); const py = C.y + row.r * Math.sin(a);
          x.beginPath(); x.arc(px, py, rad, 0, Math.PI * 2); x.fillStyle = inLight ? 'rgba(185,228,255,.98)' : '#2b2c30'; x.fill();
          if (!inLight) { x.beginPath(); x.arc(px + 0.6, py + 0.7, rad * 0.7, 0, Math.PI * 2); x.fillStyle = 'rgba(255,255,255,.18)'; x.fill(); }
        }
      });
    }

    drawPlatter(x) {
      const S = this.S;
      this.drawStrobe(x);
      if (S.power) {
        const lx = C.x + 318 * Math.cos(STROBE_ANG); const ly = C.y + 318 * Math.sin(STROBE_ANG);
        const gl = x.createRadialGradient(lx, ly, 0, lx, ly, 100); gl.addColorStop(0, 'rgba(95,180,255,.45)'); gl.addColorStop(1, 'rgba(95,180,255,0)');
        x.save(); x.globalCompositeOperation = 'screen'; x.fillStyle = gl; x.beginPath(); x.arc(lx, ly, 100, 0, Math.PI * 2); x.fill(); x.restore();
      }
      if (this.d.buffer) { // pas de disque sans morceau chargé : on voit la feutrine
        this.buildRecord();
        x.save(); x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 6; x.shadowOffsetY = 2;
        x.translate(C.x, C.y); x.rotate(S.recAng); x.drawImage(this.recordImg, -RR, -RR, RR * 2, RR * 2); x.restore();
        this.buildSheen();
        x.save(); x.globalCompositeOperation = 'screen'; x.globalAlpha = 0.68; x.drawImage(this.sheenImg, C.x - RR, C.y - RR, RR * 2, RR * 2); x.restore();
      } else {
        x.save(); x.translate(C.x, C.y); x.rotate(S.recAng);
        for (let r = 60; r < RR; r += 14) { x.strokeStyle = 'rgba(255,255,255,.035)'; x.lineWidth = 6; x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.stroke(); }
        x.restore();
      }
      const sg = x.createRadialGradient(C.x - 2, C.y - 2, 0, C.x, C.y, 6); sg.addColorStop(0, '#fff'); sg.addColorStop(1, '#6d6f74');
      x.beginPath(); x.arc(C.x, C.y, 5.5, 0, Math.PI * 2); x.fillStyle = sg; x.fill();
    }

    pitchPct() { return (this.d.rate - 1) * 100; }

    drawControls(x) {
      const S = this.S; const k = KNOB;
      if (S.power) { const gl = x.createRadialGradient(k.x, k.y, k.r, k.x, k.y, k.r + 20); gl.addColorStop(0, 'rgba(95,180,255,.85)'); gl.addColorStop(1, 'rgba(95,180,255,0)'); x.fillStyle = gl; x.beginPath(); x.arc(k.x, k.y, k.r + 20, 0, Math.PI * 2); x.fill(); }
      x.save(); x.shadowColor = 'rgba(0,0,0,.8)'; x.shadowBlur = 8; x.shadowOffsetX = 3; x.shadowOffsetY = 5;
      x.beginPath(); x.arc(k.x, k.y, k.r + 3, 0, Math.PI * 2); x.fillStyle = '#111'; x.fill(); x.restore();
      for (let i = 0; i < 48; i++) {
        const a = i / 48 * Math.PI * 2; const l = 0.5 + 0.5 * Math.cos(a - LIGHT); x.strokeStyle = `rgb(${90 + 150 * l | 0},${92 + 150 * l | 0},${98 + 150 * l | 0})`; x.lineWidth = 2.6;
        x.beginPath(); x.moveTo(k.x + (k.r - 6) * Math.cos(a), k.y + (k.r - 6) * Math.sin(a)); x.lineTo(k.x + (k.r + 1) * Math.cos(a), k.y + (k.r + 1) * Math.sin(a)); x.stroke();
      }
      metalKnob(x, k.x, k.y, k.r - 7);
      const ka = S.power ? 0.9 : -0.2;
      x.strokeStyle = '#1d1e21'; x.lineWidth = 2; x.beginPath(); x.moveTo(k.x, k.y); x.lineTo(k.x + (k.r - 12) * Math.cos(ka - Math.PI / 2), k.y + (k.r - 12) * Math.sin(ka - Math.PI / 2)); x.stroke();
      x.font = `7.5px ${F_DISP}`; x.fillStyle = 'rgba(240,240,244,.8)'; x.textAlign = 'center';
      x.fillText('OFF', k.x - 24, k.y - 40); x.fillText('ON', k.x + 28, k.y - 32);
      const b = STARTSTOP; const pr = S.ssPressed > 0 ? 2 : 0;
      x.save(); if (!pr) { x.shadowColor = 'rgba(0,0,0,.9)'; x.shadowBlur = 6; x.shadowOffsetY = 3; }
      const bg = x.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h); bg.addColorStop(0, '#3a3a3f'); bg.addColorStop(1, '#18181b');
      rr(x, b.x, b.y + pr, b.w, b.h - pr, 5); x.fillStyle = bg; x.fill(); x.restore();
      rr(x, b.x, b.y + pr, b.w, b.h - pr, 5); grainFill(x, 0.3, 'overlay');
      rr(x, b.x + 0.5, b.y + pr + 0.5, b.w - 1, b.h - pr - 1, 5); x.strokeStyle = 'rgba(255,255,255,.14)'; x.lineWidth = 1; x.stroke();
      x.fillStyle = 'rgba(240,240,244,.9)'; x.font = `10px ${F_DISP}`; x.fillText('START · STOP', b.x + b.w / 2, b.y + b.h / 2 + 4 + pr);
      [[SP33, S.rpm < 40], [SP45, S.rpm > 40]].forEach(([r, on]) => {
        const gg = x.createLinearGradient(r.x, r.y, r.x, r.y + r.h); gg.addColorStop(0, '#343438'); gg.addColorStop(1, '#1a1a1d');
        rr(x, r.x, r.y, r.w, r.h, 4); x.fillStyle = gg; x.fill(); x.strokeStyle = 'rgba(255,255,255,.12)'; x.stroke();
        x.fillStyle = 'rgba(240,240,244,.9)'; x.textAlign = 'left'; x.font = `10px ${F_DISP}`; x.fillText(r === SP33 ? '33' : '45', r.x + 9, r.y + 19);
        rr(x, r.x + 40, r.y + 11, 20, 6, 2); x.fillStyle = on && S.power ? '#5fb4ff' : '#0c0c0e'; x.fill();
        if (on && S.power) { x.save(); x.shadowColor = '#5fb4ff'; x.shadowBlur = 10; x.fill(); x.restore(); }
      });
      // pitch : + vers soi (en bas), comme sur une vraie platine ; LED verte au zéro
      const range = this.d.range || 8; const pct = this.pitchPct();
      const py = PITCH.y0 + (PITCH.y1 - PITCH.y0) * (0.5 + Math.max(-1, Math.min(1, pct / range)) / 2);
      const zero = Math.abs(pct) < 0.05 && S.power;
      x.save(); x.fillStyle = zero ? '#7dffa8' : '#1d2a22'; if (zero) { x.shadowColor = '#7dffa8'; x.shadowBlur = 8; }
      x.beginPath(); x.arc(PITCH.x - 31, (PITCH.y0 + PITCH.y1) / 2, 2.6, 0, Math.PI * 2); x.fill(); x.restore();
      x.save(); x.shadowColor = 'rgba(0,0,0,.85)'; x.shadowBlur = 8; x.shadowOffsetY = 5;
      const fg = x.createLinearGradient(0, py - 15, 0, py + 15); fg.addColorStop(0, '#f2f3f4'); fg.addColorStop(0.45, '#9ea1a6'); fg.addColorStop(0.55, '#808388'); fg.addColorStop(1, '#d9dadd');
      rr(x, PITCH.x - 19, py - 15, 38, 30, 4); x.fillStyle = fg; x.fill(); x.restore();
      x.fillStyle = 'rgba(0,0,0,.35)'; for (let i = -11; i <= 11; i += 4) x.fillRect(PITCH.x - 15, py + i - 0.4, 30, 0.8);
      x.fillStyle = '#111'; x.fillRect(PITCH.x - 17, py - 1, 34, 2);
      x.font = `10px ${F_MONO}`; x.fillStyle = S.hover === 'range' ? '#fff' : 'rgba(240,240,244,.85)'; x.textAlign = 'center';
      x.fillText(`−${range}`, PITCH.x, PITCH.y0 - 15); x.fillText(`+${range}`, PITCH.x, PITCH.y1 + 25);
      x.save(); x.shadowColor = 'rgba(0,0,0,.8)'; x.shadowBlur = 5; x.shadowOffsetY = 3; x.beginPath(); x.arc(RESET.x, RESET.y, RESET.r, 0, Math.PI * 2); x.fillStyle = '#111'; x.fill(); x.restore();
      metalKnob(x, RESET.x, RESET.y, RESET.r - 1);
      x.save(); x.translate(CUE.x, CUE.y);
      x.fillStyle = '#0d0d0f'; rr(x, -13, -17, 26, 34, 5); x.fill(); x.strokeStyle = 'rgba(255,255,255,.1)'; x.stroke();
      x.rotate(S.cueUp ? -0.55 : 0.25);
      x.shadowColor = 'rgba(0,0,0,.8)'; x.shadowBlur = 5; x.shadowOffsetY = 3;
      const lv = x.createLinearGradient(0, -4, 0, 4); lv.addColorStop(0, '#f0f1f2'); lv.addColorStop(1, '#7d8085');
      rr(x, -4, -4, 38, 8, 4); x.fillStyle = lv; x.fill(); x.fillStyle = '#0a0a0b'; x.beginPath(); x.arc(34, 0, 6.5, 0, Math.PI * 2); x.fill();
      x.restore();
      x.font = `8px ${F_MONO}`; x.fillStyle = 'rgba(240,240,244,.75)'; x.textAlign = 'center'; x.fillText(S.cueUp ? '▲ levé' : '▼ posé', CUE.x + 10, CUE.y + 32);
      x.save(); x.translate(LAMP.x, LAMP.y);
      x.fillStyle = '#0b0b0c'; x.beginPath(); x.arc(0, 0, LAMP.r, 0, Math.PI * 2); x.fill(); x.strokeStyle = 'rgba(255,255,255,.12)'; x.stroke();
      const on = S.lamp && S.power; if (on) { x.shadowColor = '#ffd89a'; x.shadowBlur = 14; }
      x.fillStyle = on ? '#ffe2ad' : '#3a3a3f'; x.beginPath(); x.arc(0, 0, 6, 0, Math.PI * 2); x.fill();
      x.restore();
    }

    drawArm(x) {
      const S = this.S; const th = S.armTh; const h = S.armH; const st = stylusAt(th);
      const offA = th + 0.36; const head = { x: st.x - 56 * Math.cos(offA), y: st.y - 56 * Math.sin(offA) };
      const back = { x: P.x - 92 * Math.cos(th), y: P.y - 92 * Math.sin(th) };
      if (S.lamp && S.power) {
        const gl = x.createRadialGradient(st.x, st.y, 0, st.x, st.y, 130); gl.addColorStop(0, 'rgba(255,214,150,.26)'); gl.addColorStop(1, 'rgba(255,214,150,0)');
        x.save(); x.globalCompositeOperation = 'screen'; x.fillStyle = gl; x.beginPath(); x.arc(st.x, st.y, 130, 0, Math.PI * 2); x.fill(); x.restore();
      }
      const path = () => {
        x.beginPath(); x.moveTo(P.x, P.y);
        const nx = -Math.sin(th); const ny = Math.cos(th); const dd = Math.hypot(head.x - P.x, head.y - P.y);
        x.bezierCurveTo(P.x + Math.cos(th) * dd * 0.35 + nx * 26, P.y + Math.sin(th) * dd * 0.35 + ny * 26, P.x + Math.cos(th) * dd * 0.7 - nx * 22, P.y + Math.sin(th) * dd * 0.7 - ny * 22, head.x, head.y);
      };
      x.save(); x.translate(9 + h * 24, 12 + h * 26); x.globalAlpha = 0.55 - h * 0.2; x.strokeStyle = '#000'; x.lineWidth = 11; x.lineCap = 'round';
      x.filter = `blur(${2.5 + h * 6}px)`; path(); x.stroke();
      x.save(); x.translate(head.x, head.y); x.rotate(offA); x.fillStyle = '#000'; x.fillRect(-6, -15, 72, 30); x.restore();
      x.restore(); x.filter = 'none';
      x.save(); x.translate(back.x, back.y); x.rotate(th);
      x.shadowColor = 'rgba(0,0,0,.8)'; x.shadowBlur = 10; x.shadowOffsetX = 6; x.shadowOffsetY = 8;
      const cw = x.createLinearGradient(0, -21, 0, 21); cw.addColorStop(0, '#f3f4f5'); cw.addColorStop(0.35, '#c6c8cb'); cw.addColorStop(0.6, '#6e7176'); cw.addColorStop(1, '#b5b7bb');
      rr(x, -27, -21, 54, 42, 7); x.fillStyle = cw; x.fill(); x.shadowColor = 'transparent';
      x.fillStyle = 'rgba(0,0,0,.45)'; for (let i = -23; i <= 23; i += 3) x.fillRect(i, -21, 1, 42);
      x.fillStyle = '#0d0d0f'; x.fillRect(-27, -3, 54, 6);
      x.restore();
      x.lineCap = 'round';
      tube(x, () => { x.beginPath(); x.moveTo(back.x, back.y); x.lineTo(P.x, P.y); }, 8);
      x.save(); x.shadowColor = 'rgba(0,0,0,.8)'; x.shadowBlur = 8; x.shadowOffsetX = 4; x.shadowOffsetY = 5;
      x.beginPath(); x.arc(P.x, P.y, 34, 0, Math.PI * 2); x.fillStyle = '#121214'; x.fill(); x.restore();
      metalKnob(x, P.x, P.y, 30);
      x.beginPath(); x.arc(P.x, P.y, 13, 0, Math.PI * 2); x.fillStyle = '#111114'; x.fill();
      tube(x, path, 8);
      x.save(); x.translate(head.x, head.y); x.rotate(offA);
      x.shadowColor = 'rgba(0,0,0,.7)'; x.shadowBlur = 4; x.shadowOffsetY = 2;
      const hs = x.createLinearGradient(0, -15, 0, 15); hs.addColorStop(0, '#38383d'); hs.addColorStop(1, '#0e0e10');
      rr(x, -4, -15, 64, 30, 4); x.fillStyle = hs; x.fill(); x.shadowColor = 'transparent';
      x.strokeStyle = 'rgba(255,255,255,.18)'; x.lineWidth = 0.8; rr(x, -3.5, -14.5, 63, 29, 4); x.stroke();
      const fl = x.createLinearGradient(0, -27, 0, -13); fl.addColorStop(0, '#f0f1f2'); fl.addColorStop(1, '#7b7e83');
      rr(x, 8, -27, 22, 13, 3); x.fillStyle = fl; x.fill();
      x.fillStyle = '#1f2023'; rr(x, 22, -9, 36, 18, 2); x.fill();
      x.fillStyle = '#c9a227'; x.fillRect(49, -9, 3, 18);
      x.fillStyle = '#f2f2f5'; x.beginPath(); x.arc(56, 0, 2.1 + h * 0.6, 0, Math.PI * 2); x.fill();
      x.restore();
    }

    render() {
      const g = this.g;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.canvas.width, this.canvas.height);
      g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      if (this.base) g.drawImage(this.base, 0, 0, W, H);
      this.drawPlatter(g); this.drawControls(g); this.drawArm(g);
    }

    /** Appelé à chaque image par le skin. */
    frame(now) {
      const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0.016; this.last = now;
      if (this.S.ssPressed > 0) this.S.ssPressed -= dt;
      this.step(dt); this.render();
    }

    // ------------------------------------------------------------------ gestes
    toLocal(e) { const r = this.canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
    hitTest(p) {
      const S = this.S; const st = stylusAt(S.armTh);
      if (Math.hypot(p.x - st.x, p.y - st.y) < 46 || (distSeg(p, P, st) < 14 && Math.hypot(p.x - P.x, p.y - P.y) > 40)) return 'arm';
      if (Math.hypot(p.x - KNOB.x, p.y - KNOB.y) < KNOB.r + 6) return 'power';
      if (inR(p, STARTSTOP)) return 'startstop';
      if (inR(p, SP33)) return 's33'; if (inR(p, SP45)) return 's45';
      if (Math.abs(p.x - PITCH.x) < 22 && (Math.abs(p.y - (PITCH.y0 - 19)) < 10 || Math.abs(p.y - (PITCH.y1 + 21)) < 10)) return 'range';
      if (Math.abs(p.x - PITCH.x) < 26 && p.y > PITCH.y0 - 24 && p.y < PITCH.y1 + 24) return 'pitch';
      if (Math.hypot(p.x - RESET.x, p.y - RESET.y) < RESET.r + 5) return 'reset';
      if (Math.hypot(p.x - CUE.x - 15, p.y - CUE.y) < 30) return 'cue';
      if (Math.hypot(p.x - LAMP.x, p.y - LAMP.y) < LAMP.r + 6) return 'lamp';
      if (Math.hypot(p.x - C.x, p.y - C.y) < RR) return 'rec';
      return null;
    }
    setPitch(p) {
      const range = this.d.range || 8; const inp = this.d.el.querySelector('.d-pitch'); if (!inp) return;
      let v = ((p.y - PITCH.y0) / (PITCH.y1 - PITCH.y0) - 0.5) * 2 * range;
      v = Math.max(-range, Math.min(range, v)); if (Math.abs(v) < range * 0.035) v = 0; // cran au centre
      this.setPitchValue(Math.round(v * 20) / 20);
    }
    setPitchValue(v) { const inp = this.d.el.querySelector('.d-pitch'); if (!inp) return; inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true })); }

    bind() {
      const cv = this.canvas; const S = this.S; const d = this.d;
      const CURSOR = { arm: 'grab', power: 'pointer', startstop: 'pointer', s33: 'pointer', s45: 'pointer', range: 'pointer', pitch: 'ns-resize', reset: 'pointer', cue: 'pointer', lamp: 'pointer', rec: 'grab' };
      this.onDown = (e) => {
        const p = this.toLocal(e); const h = this.hitTest(p); if (!h) return;
        e.preventDefault(); if (this.app.audio) this.app.audio(); this.ensureNode();
        cv.setPointerCapture(e.pointerId);
        switch (h) {
          case 'arm': S.drag = 'arm'; S.auto = null; S.grabOff = S.armTh - Math.atan2(p.y - P.y, p.x - P.x); cv.style.cursor = 'grabbing'; break;
          case 'power': S.power = !S.power; if (!S.power && d.playing) { d.pause(); } break;
          case 'startstop':
            if (d.buffer) d.toggle(); else { S.running = !S.running; } S.ssPressed = 0.15; break;
          case 's33': S.rpm = 33.3333; break;
          case 's45': S.rpm = 45; break;
          case 'range': { const btn = d.el.querySelector('.d-range'); if (btn) btn.click(); break; }
          case 'pitch': S.drag = 'pitch'; this.setPitch(p); break;
          case 'reset': this.setPitchValue(0); break;
          case 'cue': S.cueUp = !S.cueUp; S.lastDrop = 'cue'; break;
          case 'lamp': S.lamp = !S.lamp; break;
          case 'rec': S.drag = 'rec'; S.held = { ang: Math.atan2(p.y - C.y, p.x - C.x), t: performance.now(), vel: 0 }; cv.style.cursor = 'grabbing'; break;
          default: break;
        }
      };
      this.onMove = (e) => {
        const p = this.toLocal(e);
        if (S.drag === 'arm') { let th = Math.atan2(p.y - P.y, p.x - P.x) + S.grabOff; if (th < -Math.PI / 2) th += Math.PI * 2; S.armTh = Math.max(TH_MIN, Math.min(TH_MAX, th)); }
        else if (S.drag === 'pitch') this.setPitch(p);
        else if (S.drag === 'rec' && S.held) {
          const a = Math.atan2(p.y - C.y, p.x - C.x); const now = performance.now();
          let dd = a - S.held.ang; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
          const dt = Math.max(0.004, (now - S.held.t) / 1000);
          S.recAng += dd; S.held.vel = (dd / dt) / OMEGA0; S.held.ang = a; S.held.t = now;
        } else { const h = this.hitTest(p); if (h !== S.hover) { S.hover = h; cv.style.cursor = CURSOR[h] || 'default'; } }
      };
      this.onUp = () => {
        if (S.drag === 'arm') {
          const r = radiusAtTheta(S.armTh); S.lastDrop = S.cueUp ? 'cue' : 'hand';
          if (r > R_EDGE + 2 || r < R_RUN - 4) S.auto = { dir: 'out', phase: 1, h: 1 }; // lâché hors du disque : retour sur le repose-bras
        }
        S.drag = null; S.held = null; cv.style.cursor = 'default';
      };
      this.onWheel = (e) => { // molette sur le disque : le pousser / le retenir un peu, comme du bout du doigt
        if (this.hitTest(this.toLocal(e)) !== 'rec') return; e.preventDefault(); S.rec += (e.deltaY < 0 ? 0.06 : -0.06);
      };
      cv.addEventListener('pointerdown', this.onDown); cv.addEventListener('pointermove', this.onMove);
      cv.addEventListener('pointerup', this.onUp); cv.addEventListener('pointercancel', this.onUp);
      cv.addEventListener('wheel', this.onWheel, { passive: false });
    }

    /** Démontage : le deck reprend la lecture normale au même endroit (sans coupure si le diamant était posé). */
    destroy() {
      const d = this.d; const S = this.S; const pos = this.pos; const was = S.needleDown && S.running && d.playing;
      if (this.node) { this.node.onaudioprocess = null; try { this.node.disconnect(); } catch (e) { /* déjà débranché */ } this.node = null; }
      d.vinyl = null; d.playing = false; d.offset = pos;
      if (was) d.play(); else if (d.renderTransport) d.renderTransport();
    }
  }

  window.FadarrTechnicarr = { Turntable, W, H };
}());
