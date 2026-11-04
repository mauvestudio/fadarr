/**
 * Filtres VCF façon table anglaise (deux unités, FILTER 1 et FILTER 2), utilisés par le skin Xonarr.
 * Chaque voie choisit son unité (inverseur 1 / OFF / 2) ; chaque unité a :
 *   HPF / BPF / LPF : type de filtre (2 pôles, 12 dB/oct) ;
 *   FREQ            : fréquence de coupure, 20 Hz à 20 kHz sur une échelle logarithmique ;
 *   RES             : résonance, de MILD (douce) à WILD (presque auto-oscillante) ;
 *   CRUNCH          : saturation ajoutée avant le filtre ;
 *   FILTER          : marche / arrêt de l'unité.
 * Comportement reproduit à l'oreille : ce n'est pas un modèle mesuré.
 */
(function () {
  'use strict';

  const TC = 0.015;
  const set = (ctx, p, v) => { const t = ctx.currentTime; p.cancelScheduledValues(t); p.setTargetAtTime(v, t, TC); };
  const curves = new WeakMap();
  function shaperCurve(ctx) {
    if (curves.has(ctx)) return curves.get(ctx);
    const n = 2048; const c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * 3) / Math.tanh(3); }
    curves.set(ctx, c); return c;
  }

  /** Une instance par voie, posée dans la chaîne (EQ -> filtre -> Sound Color FX). Transparente quand elle est coupée. */
  class XoneFilter {
    constructor(ctx) {
      this.ctx = ctx;
      this.input = ctx.createGain(); this.output = ctx.createGain();
      this.dry = ctx.createGain(); this.dry.gain.value = 1;                // chemin direct (filtre coupé)
      this.clean = ctx.createGain(); this.clean.gain.value = 1;            // part non saturée vers le filtre
      this.drive = ctx.createGain(); this.drive.gain.value = 1;
      this.shaper = ctx.createWaveShaper(); this.shaper.curve = shaperCurve(ctx); this.shaper.oversample = '2x';
      this.dirty = ctx.createGain(); this.dirty.gain.value = 0;            // part saturée (CRUNCH)
      this.bq = ctx.createBiquadFilter(); this.bq.type = 'lowpass'; this.bq.frequency.value = 20000; this.bq.Q.value = 0.7;
      this.wet = ctx.createGain(); this.wet.gain.value = 0;
      this.input.connect(this.dry); this.dry.connect(this.output);
      this.input.connect(this.clean); this.clean.connect(this.bq);
      this.input.connect(this.drive); this.drive.connect(this.shaper); this.shaper.connect(this.dirty); this.dirty.connect(this.bq);
      this.bq.connect(this.wet); this.wet.connect(this.output);
      this.state = '';
    }

    /** u : réglages de l'unité choisie ({ mode, freq, res, crunch, on }) ou null (voie non affectée). */
    apply(u) {
      const on = Boolean(u && u.on);
      const key = on ? `${u.mode}|${u.freq}|${u.res}|${u.crunch}` : 'off';
      if (key === this.state) return; this.state = key;
      const c = this.ctx;
      set(c, this.dry.gain, on ? 0 : 1); set(c, this.wet.gain, on ? 1 : 0);
      if (!on) return;
      this.bq.type = u.mode === 'hpf' ? 'highpass' : u.mode === 'bpf' ? 'bandpass' : 'lowpass';
      set(c, this.bq.frequency, 20 * Math.pow(1000, Math.max(0, Math.min(1, u.freq))));
      const r = Math.max(0, Math.min(1, u.res));
      // MILD ≈ Q 0,7 (pas de bosse) ; WILD ≈ Q 14. Le passe-bande reste plus large pour ne pas s'éteindre.
      set(c, this.bq.Q, u.mode === 'bpf' ? 0.9 + r * 7 : 0.7 * Math.pow(20, r));
      const k = Math.max(0, Math.min(1, u.crunch));
      set(c, this.clean.gain, 1 - k); set(c, this.dirty.gain, k * 0.8); set(c, this.drive.gain, 1 + k * 10);
    }
  }

  /** État des deux unités et affectation des voies (partagé entre le skin et le moteur audio). */
  const state = {
    units: {
      1: { mode: 'hpf', freq: 0.4, res: 0.2, crunch: 0, on: false },
      2: { mode: 'lpf', freq: 0.6, res: 0.2, crunch: 0, on: false }
    },
    assign: { A: 0, B: 0 }, // 0 = OFF, 1 = FILTER 1, 2 = FILTER 2
    sync() {
      const app = window.fadarrApp; if (!app) return;
      for (const id of ['A', 'B']) { const d = app.decks[id]; if (d && d.vcf) d.vcf.apply(state.assign[id] ? state.units[state.assign[id]] : null); }
    }
  };

  window.FadarrXone = { XoneFilter, state };
}());
