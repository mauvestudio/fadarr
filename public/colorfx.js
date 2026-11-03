/**
 * Sound Color FX façon table de mixage de club : un effet choisi pour toutes les voies, piloté par le potard COLOR de chaque
 * voie (à gauche les graves / passe-bas, à droite les aigus / passe-haut, neutre au centre) et un potard PARAMETER commun.
 *   FILTER    : filtre résonant 24 dB/oct, passe-bas à gauche, passe-haut à droite ; PARAMETER = résonance.
 *   SPACE     : réverbe ajoutée, filtrée (sombre à gauche, claire à droite) ; PARAMETER = quantité.
 *   DUB ECHO  : écho calé sur le tempo (croche pointée) qui continue de s'éteindre ; PARAMETER = réinjection.
 *   CRUSH     : réduction de bits et d'échantillonnage, plus un filtre ; PARAMETER = dureté.
 *   SWEEP     : à gauche un gate rythmique (double croches), à droite un passe-bande qui balaie ; PARAMETER = résonance.
 *   NOISE     : bruit blanc filtré ajouté au son ; PARAMETER = niveau.
 * Comportement reproduit à l'oreille d'après les tables du commerce : ce n'est pas un modèle mesuré.
 */
(function () {
  'use strict';

  const MODES = ['space', 'dubecho', 'crush', 'sweep', 'noise', 'filter', 'none']; // none : aucun effet choisi, le potard COLOR ne fait rien
  const TC = 0.012; // constante de lissage des réglages (s) : pas de « zipper » en tournant le potard
  const DEAD = 0.03; // zone neutre au centre du potard

  const set = (ctx, param, v, tc = TC) => { const t = ctx.currentTime; param.cancelScheduledValues(t); param.setTargetAtTime(v, t, tc); };

  // ---------- ressources partagées par contexte audio ----------
  const shared = new WeakMap();
  function res(ctx) {
    if (shared.has(ctx)) return shared.get(ctx);
    const r = {};
    // réponse impulsionnelle de réverbe : bruit qui décroît, un peu plus long à droite (largeur stéréo)
    const sec = 2.8; const n = Math.floor(ctx.sampleRate * sec);
    r.ir = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = r.ir.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2 + c * 0.2) * (i < 240 ? i / 240 : 1);
    }
    r.noise = ctx.createBuffer(2, ctx.sampleRate * 2, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = r.noise.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    // réducteur de bits / d'échantillonnage (AudioWorklet), chargé une fois
    r.crushReady = null;
    if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      const src = `class FadarrCrush extends AudioWorkletProcessor {
        static get parameterDescriptors() { return [{ name: 'bits', defaultValue: 16, minValue: 2, maxValue: 16 }, { name: 'down', defaultValue: 1, minValue: 1, maxValue: 64 }]; }
        constructor() { super(); this.h = [0, 0]; this.c = [0, 0]; }
        process(inputs, outputs, p) {
          const inp = inputs[0]; const out = outputs[0];
          if (!inp || !inp.length) return true;
          const q = Math.pow(2, p.bits[0] - 1); const down = p.down[0];
          for (let ch = 0; ch < out.length; ch++) {
            const a = inp[ch] || inp[0]; const b = out[ch]; let h = this.h[ch] || 0; let c = this.c[ch] || 0;
            for (let k = 0; k < b.length; k++) { if (c <= 0) { h = Math.round(a[k] * q) / q; c += down; } c -= 1; b[k] = h; }
            this.h[ch] = h; this.c[ch] = c;
          }
          return true;
        }
      }
      registerProcessor('fadarr-crush', FadarrCrush);`;
      const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
      r.crushReady = ctx.audioWorklet.addModule(url).then(() => true).catch(() => false);
    }
    shared.set(ctx, r);
    return r;
  }

  class ColorFX {
    /** @param {BaseAudioContext} ctx  @param {() => number} getBpm tempo joué (pour DUB ECHO et SWEEP) */
    constructor(ctx, getBpm) {
      this.ctx = ctx; this.getBpm = getBpm || (() => 0);
      this.mode = 'filter'; this.v = 0; this.param = 0.5;
      const R = res(ctx);
      const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
      const bq = (type = 'allpass') => { const f = ctx.createBiquadFilter(); f.type = type; return f; };
      this.input = g(); this.output = g();
      // voie directe : [crusher] -> 2 filtres -> gate -> sortie
      this.pre = g();
      this.f1 = bq(); this.f2 = bq();
      this.gate = g(1);
      this.input.connect(this.pre); this.pre.connect(this.f1); this.f1.connect(this.f2); this.f2.connect(this.gate); this.gate.connect(this.output);
      // gate rythmique (SWEEP à gauche) : oscillateur carré -> profondeur -> gain du gate
      this.lfo = ctx.createOscillator(); this.lfo.type = 'square'; this.lfoDepth = g(0);
      this.lfo.connect(this.lfoDepth); this.lfoDepth.connect(this.gate.gain); this.lfo.start();
      // voie d'effet : envoi -> (réverbe | écho) -> filtre -> retour
      this.send = g(0); this.wetF = bq('lowpass'); this.wet = g(0);
      this.input.connect(this.send);
      this.conv = ctx.createConvolver(); this.conv.buffer = R.ir;
      this.delay = ctx.createDelay(4); this.fb = g(0); this.fbF = bq('highpass'); this.fbF.frequency.value = 80;
      this.delay.connect(this.fbF); this.fbF.connect(this.fb); this.fb.connect(this.delay);
      this.wetF.connect(this.wet); this.wet.connect(this.output);
      // bruit (NOISE)
      this.noise = ctx.createBufferSource(); this.noise.buffer = R.noise; this.noise.loop = true;
      this.noiseF = bq('lowpass'); this.noiseG = g(0);
      this.noise.connect(this.noiseF); this.noiseF.connect(this.noiseG); this.noiseG.connect(this.output); this.noise.start();
      // réducteur
      this.crusher = null;
      if (R.crushReady) R.crushReady.then((ok) => { if (ok) { try { this.crusher = new AudioWorkletNode(ctx, 'fadarr-crush', { outputChannelCount: [2] }); } catch (e) { this.crusher = null; } if (this.mode === 'crush') this.wire(); } });
      if (!R.crushReady) { this.shaper = ctx.createWaveShaper(); }
      this.wire();
      this.apply();
    }

    /** Branche l'envoi et le réducteur selon l'effet choisi. */
    wire() {
      try { this.send.disconnect(); } catch (e) { /* rien */ }
      try { this.pre.disconnect(); } catch (e) { /* rien */ }
      if (this.crusher) try { this.crusher.disconnect(); } catch (e) { /* rien */ }
      if (this.mode === 'space') { this.send.connect(this.conv); this.conv.connect(this.wetF); }
      if (this.mode === 'dubecho') { this.send.connect(this.delay); this.delay.connect(this.wetF); }
      const crush = this.mode === 'crush' && (this.crusher || this.shaper);
      if (crush) { this.pre.connect(crush); crush.connect(this.f1); } else this.pre.connect(this.f1);
    }

    setMode(m) {
      if (!MODES.includes(m) || m === this.mode) return;
      // on coupe proprement ce qui sonnait (sauf la traîne de l'écho, comme sur une table)
      if (this.mode === 'space') { try { this.conv.disconnect(); } catch (e) { /* rien */ } }
      if (this.mode !== 'dubecho') { try { this.delay.disconnect(this.wetF); } catch (e) { /* rien */ } }
      this.mode = m;
      this.wire();
      this.apply();
    }

    /** Potard COLOR : -1 (graves) … 0 (neutre) … +1 (aigus). */
    set(v) { this.v = Math.max(-1, Math.min(1, Number(v) || 0)); this.apply(); }
    /** Potard PARAMETER : 0 … 1. */
    setParam(p) { this.param = Math.max(0, Math.min(1, Number(p))); this.apply(); }

    apply() {
      const c = this.ctx; const v = this.v; const a = Math.abs(v); const p = this.param;
      const on = a >= DEAD; const low = v < 0;
      const x = on ? (a - DEAD) / (1 - DEAD) : 0; // course utile 0..1
      const LP = (amt) => 20000 * Math.pow(0.0035, amt); // 20 kHz -> ~70 Hz
      const HP = (amt) => 20 * Math.pow(450, amt);       // 20 Hz -> ~9 kHz
      const flat = (f) => { f.type = 'allpass'; };
      // remise à plat
      set(c, this.send.gain, 0); set(c, this.wet.gain, 0); set(c, this.noiseG.gain, 0); set(c, this.lfoDepth.gain, 0); set(c, this.gate.gain, 1);
      if (this.mode !== 'dubecho') set(c, this.fb.gain, 0, 0.3);
      flat(this.f1); flat(this.f2);
      if (this.crusher) { set(c, this.crusher.parameters.get('bits'), 16); set(c, this.crusher.parameters.get('down'), 1); }
      if (this.mode === 'none' || (!on && this.mode !== 'dubecho')) return;
      switch (this.mode) {
        case 'filter': {
          const q = 0.7 + p * 5.5; // résonance
          this.f1.type = this.f2.type = low ? 'lowpass' : 'highpass';
          const f = low ? LP(x) : HP(x);
          set(c, this.f1.frequency, f); set(c, this.f2.frequency, f);
          set(c, this.f1.Q, q); set(c, this.f2.Q, 0.707);
          break;
        }
        case 'space': {
          set(c, this.send.gain, Math.pow(x, 1.1));
          set(c, this.wet.gain, 0.35 + p * 0.9);
          this.wetF.type = low ? 'lowpass' : 'highpass';
          set(c, this.wetF.frequency, low ? 20000 * Math.pow(0.04, x) : 20 * Math.pow(150, x)); set(c, this.wetF.Q, 0.8);
          break;
        }
        case 'dubecho': {
          const bpm = this.getBpm();
          const t = bpm > 40 ? Math.min(3.5, (60 / bpm) * 0.75) : 0.375; // croche pointée
          set(c, this.delay.delayTime, t, 0.05);
          set(c, this.fb.gain, 0.3 + p * 0.55, 0.05);
          set(c, this.send.gain, on ? Math.pow(x, 0.8) : 0);
          set(c, this.wet.gain, 0.9);
          this.wetF.type = low ? 'lowpass' : 'highpass';
          set(c, this.wetF.frequency, on ? (low ? 20000 * Math.pow(0.05, x) : 20 * Math.pow(120, x)) : this.wetF.frequency.value); set(c, this.wetF.Q, 1.2);
          this.fbF.type = low ? 'lowpass' : 'highpass';
          set(c, this.fbF.frequency, low ? 4500 : 300);
          break;
        }
        case 'crush': {
          const hard = 0.5 + p; // dureté
          if (this.crusher) {
            set(c, this.crusher.parameters.get('bits'), Math.max(2, 16 - x * 12 * Math.min(1.2, hard)));
            set(c, this.crusher.parameters.get('down'), 1 + x * x * 24 * hard);
          } else if (this.shaper) {
            const bits = Math.max(2, 16 - x * 12); const q = Math.pow(2, bits - 1); const n = 2048; const curve = new Float32Array(n);
            for (let i = 0; i < n; i++) { const s = i / (n - 1) * 2 - 1; curve[i] = Math.round(s * q) / q; }
            this.shaper.curve = curve;
          }
          this.f1.type = low ? 'lowpass' : 'highpass';
          set(c, this.f1.frequency, low ? 20000 * Math.pow(0.08, x) : 20 * Math.pow(60, x)); set(c, this.f1.Q, 0.9);
          break;
        }
        case 'sweep': {
          if (low) { // gate rythmique en double croches, de plus en plus profond
            const bpm = this.getBpm();
            set(c, this.lfo.frequency, bpm > 40 ? (bpm / 60) * 4 : 8, 0.05);
            const depth = x * 0.5;
            set(c, this.gate.gain, 1 - depth); set(c, this.lfoDepth.gain, depth);
          } else { // passe-bande qui balaie vers les aigus
            this.f1.type = 'bandpass';
            set(c, this.f1.frequency, 150 * Math.pow(60, x)); set(c, this.f1.Q, 0.8 + p * 7 * x);
          }
          break;
        }
        case 'noise': {
          set(c, this.noiseG.gain, x * (0.04 + p * 0.22));
          this.noiseF.type = low ? 'lowpass' : 'highpass';
          set(c, this.noiseF.frequency, low ? 20000 * Math.pow(0.02, x) : 20 * Math.pow(500, x)); set(c, this.noiseF.Q, 1.4);
          break;
        }
        default: break;
      }
    }
  }

  const api = { ColorFX, MODES };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.FadarrColorFX = api;
}());
