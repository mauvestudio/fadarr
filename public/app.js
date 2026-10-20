/* fadarr — interface : deux decks (Web Audio), mixeur, bibliothèque, playlists, cues / loops, import Traktor, export Rekordbox. */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const t = (fr, vars) => (window.I18N ? window.I18N.t(fr, vars) : fr); // traductions (voir i18n.js)
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (s, tenth) => {
    if (!Number.isFinite(s)) return '—';
    const neg = s < 0; s = Math.abs(s);
    const m = Math.floor(s / 60); const sec = s - m * 60;
    const txt = tenth ? `${m}:${sec.toFixed(1).padStart(4, '0')}` : `${m}:${String(Math.floor(sec)).padStart(2, '0')}`;
    return neg ? `-${txt}` : txt;
  };
  const shortDate = (ms) => { if (!ms) return ''; try { return new Date(ms).toLocaleDateString(window.I18N.locale, { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch (e) { return ''; } };
  /** Note Traktor (0-255) -> 5 étoiles cliquables façon Mixxx (clic = poser la note, reclic sur la même = enlever). */
  const ratingStars = (r) => {
    const n = Math.max(0, Math.min(5, Math.round((Number(r) || 0) / 51)));
    let s = `<span class="stars" title="${window.I18N.t('Clic : noter')}">`;
    for (let i = 5; i >= 1; i--) s += `<span class="st${i <= n ? ' on' : ''}" data-rate="${i}">★</span>`; // ordre inversé : l'aperçu au survol remplit jusqu'à l'étoile pointée
    return s + '</span>';
  };
  /** Les 7 couleurs Traktor pour le menu clic droit (même ordre/teintes qu'à l'import). */
  const TRAKTOR_COLORS = { 1: '#f5425a', 2: '#f58a42', 3: '#f5d142', 4: '#4caf50', 5: '#42a5f5', 6: '#7e57c2', 7: '#ec407a' };
  const COLOR_NAMES = { 1: 'Rouge', 2: 'Orange', 3: 'Jaune', 4: 'Vert', 5: 'Bleu', 6: 'Violet', 7: 'Rose' };
  // Tonalité : notation musicale (stockée), Camelot ou Open Key (Traktor) à l'affichage
  const CAMELOT = { 'C': '8B', 'Db': '3B', 'D': '10B', 'Eb': '5B', 'E': '12B', 'F': '7B', 'F#': '2B', 'G': '9B', 'Ab': '4B', 'A': '11B', 'Bb': '6B', 'B': '1B',
    'Cm': '5A', 'Dbm': '12A', 'C#m': '12A', 'Dm': '7A', 'Ebm': '2A', 'D#m': '2A', 'Em': '9A', 'Fm': '4A', 'F#m': '11A', 'Gm': '6A', 'Abm': '1A', 'G#m': '1A', 'Am': '8A', 'Bbm': '3A', 'Bm': '10A',
    'Gb': '2B', 'C#': '3B', 'D#': '5B', 'G#': '4B', 'A#': '6B', 'A#m': '3A', 'Gbm': '11A' };
  const camelotToOpen = (c) => { const m = /^(\d+)([AB])$/.exec(c || ''); if (!m) return ''; const n = ((Number(m[1]) + 4) % 12) + 1; return `${n}${m[2] === 'A' ? 'm' : 'd'}`; };
  let keyMode = 'musical';
  try { keyMode = localStorage.getItem('fadarr-key') || 'musical'; } catch (e) { /* rien */ }
  function showKey(k) {
    if (!k) return '';
    if (keyMode === 'musical') return k;
    const c = CAMELOT[k] || (/^\d+[AB]$/.test(k) ? k : '');
    if (!c) return k;
    return keyMode === 'camelot' ? c : camelotToOpen(c);
  }
  const keySortValue = (k) => { const c = CAMELOT[k] || ''; const m = /^(\d+)([AB])$/.exec(c); return m ? Number(m[1]) * 2 + (m[2] === 'B' ? 1 : 0) : 99; };
  /** Couleur de la tonalité façon Traktor/Mixxx : une teinte par position de la roue Camelot (1-12). */
  function keyColor(k) {
    const c = CAMELOT[k] || (/^\d+[AB]$/.test(k || '') ? k : '');
    const m = /^(\d+)[AB]$/.exec(c); if (!m) return '';
    const hue = (((Number(m[1]) - 1) * 30) + 210) % 360;
    return `hsl(${hue} 72% 63%)`;
  }

  let refDeck = null; // deck de référence pour la surbrillance « compatible » de la liste

  /** Tonalités harmoniquement compatibles (roue Camelot) : même case, ±1, ou relative majeure / mineure. */
  function keyCompat(a, b) {
    const ca = CAMELOT[a] || (/^\d+[AB]$/.test(a || '') ? a : ''); const cb = CAMELOT[b] || (/^\d+[AB]$/.test(b || '') ? b : '');
    const ma = /^(\d+)([AB])$/.exec(ca); const mb = /^(\d+)([AB])$/.exec(cb);
    if (!ma || !mb) return 0;
    const na = Number(ma[1]); const nb = Number(mb[1]);
    if (ca === cb) return 2;
    const d = Math.min((na - nb + 12) % 12, (nb - na + 12) % 12);
    if (ma[2] === mb[2] && d === 1) return 1;
    if (na === nb) return 1; // relatif
    return 0;
  }
  /** BPM compatible (±3 %, ou demi / double tempo) : 2 = très proche (±1,5 %), 1 = jouable, 0 = non. */
  function bpmCompat(bpm, ref) {
    if (!bpm || !ref) return 0;
    let best = Infinity;
    for (const f of [1, 2, 0.5]) best = Math.min(best, Math.abs(bpm * f / ref - 1));
    return best <= 0.015 ? 2 : best <= 0.03 ? 1 : 0;
  }

  const HOT_COLORS = ['#28e214', '#ff8c00', '#e13535', '#10b1e2', '#e6d200', '#aa00ff', '#304ff1', '#ff007f'];
  const PAD = 'ABCDEFGH';

  async function api(method, url, body) {
    const res = await fetch(url, { method, headers: { 'X-Lang': window.I18N ? window.I18N.lang : 'fr', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.text();
    if (!res.ok) throw new Error((data && data.error) || t('Erreur {status}', { status: res.status }));
    return data;
  }

  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = `toast${kind === 'error' ? ' error' : ''}`;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), kind === 'error' ? 7000 : 3500);
  }

  /** Menu contextuel (clic droit). items : [{label, fn, danger} | {sep:true}]. */
  function contextMenu(ev, items) {
    ev.preventDefault();
    $$('.ctx-menu').forEach((m) => m.remove());
    const m = document.createElement('div');
    m.className = 'ctx-menu';
    for (const it of items) {
      if (it.sep) { const s = document.createElement('div'); s.className = 'ctx-sep'; m.appendChild(s); continue; }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `ctx-item${it.danger ? ' danger' : ''}`;
      if (it.html) b.innerHTML = it.label; else b.textContent = it.label;
      b.addEventListener('click', () => { m.remove(); try { it.fn(); } catch (e) { toast(e.message, 'error'); } });
      m.appendChild(b);
    }
    document.body.appendChild(m);
    const pad = 6; const w = m.offsetWidth; const h = m.offsetHeight;
    m.style.left = `${Math.min(ev.clientX, window.innerWidth - w - pad)}px`;
    m.style.top = `${Math.min(ev.clientY, window.innerHeight - h - pad)}px`;
    const close = (e) => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); } };
    const esc = (e) => { if (e.key === 'Escape') { m.remove(); document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); } };
    setTimeout(() => { document.addEventListener('mousedown', close); document.addEventListener('keydown', esc); }, 0);
  }

  // ===========================================================================
  // MOTEUR AUDIO
  // ===========================================================================

  let ctx = null;
  let master = null;
  const xf = { value: 0 };

  function audio() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      master = ctx.createGain();
      master.gain.value = Number($('#master').value);
      master.connect(ctx.destination);
      decks.A.buildChain(); decks.B.buildChain();
      applyCrossfader();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  const dbToGain = (db) => Math.pow(10, db / 20);

  class Deck {
    constructor(id) {
      this.id = id;
      this.el = $(`#deck-${id}`);
      this.el.appendChild($('#deck-tpl').content.cloneNode(true));
      $('.deck-letter', this.el).textContent = id;
      this.track = null;       // fiche du morceau (API)
      this.buffer = null;      // AudioBuffer
      this.peaks = null;       // { rate, max: Float32Array }
      this.cues = [];
      this.source = null;
      this.playing = false;
      this.offset = 0;         // position (s) au dernier départ
      this.startedAt = 0;      // ctx.currentTime au dernier départ
      this.rate = 1;
      this.range = 8;
      this.mainCue = 0;
      this.loop = null;        // { start, end, active }
      this.loopIn = null;
      this.loading = 0;
      this.quant = true; // quantize activé par défaut, comme dans Traktor
      this.synced = false; // SYNC : tempo calé sur l'autre deck
      this.bindUi();
      this.renderPads();
      this.renderMem();
    }

    buildChain() {
      const c = ctx;
      this.trim = c.createGain();
      this.low = c.createBiquadFilter(); this.low.type = 'lowshelf'; this.low.frequency.value = 220;
      this.mid = c.createBiquadFilter(); this.mid.type = 'peaking'; this.mid.frequency.value = 1100; this.mid.Q.value = 0.8;
      this.high = c.createBiquadFilter(); this.high.type = 'highshelf'; this.high.frequency.value = 4200;
      this.filter = c.createBiquadFilter(); this.filter.type = 'allpass';
      this.fader = c.createGain();
      this.xgain = c.createGain();
      this.analyser = c.createAnalyser(); this.analyser.fftSize = 512;
      this.trim.connect(this.low); this.low.connect(this.mid); this.mid.connect(this.high); this.high.connect(this.filter);
      this.filter.connect(this.fader); this.fader.connect(this.xgain); this.xgain.connect(master);
      this.fader.connect(this.analyser);
      $$(`.ch[data-ch="${this.id}"] input`).forEach((inp) => this.setParam(inp.dataset.p, Number(inp.value)));
    }

    setParam(p, v) {
      if (!ctx) return;
      if (p === 'trim') this.trim.gain.value = dbToGain(v);
      else if (p === 'low' || p === 'mid' || p === 'high') this[p].gain.value = v;
      else if (p === 'fader') this.fader.gain.value = v * v;
      else if (p === 'filter') {
        // un seul bouton : à gauche passe-bas, à droite passe-haut, au centre neutre
        if (Math.abs(v) < 0.03) { this.filter.type = 'allpass'; return; }
        this.filter.type = v < 0 ? 'lowpass' : 'highpass';
        this.filter.Q.value = 0.9;
        this.filter.frequency.value = v < 0 ? 20000 * Math.pow(0.0075, -v) : 20 * Math.pow(400, v);
      }
    }

    get duration() { return this.buffer ? this.buffer.duration : 0; }

    get position() {
      if (!this.playing) return this.offset;
      let p = this.offset + (ctx.currentTime - this.startedAt) * this.rate;
      if (this.loop && this.loop.active && p >= this.loop.end) {
        const len = this.loop.end - this.loop.start;
        p = this.loop.start + ((p - this.loop.start) % len);
      }
      return Math.min(p, this.duration);
    }

    // ---------- chargement ----------
    async load(track) {
      audio();
      const token = ++this.loading;
      this.stopSource();
      this.playing = false;
      this.track = track;
      this.buffer = null; this.peaks = null; this.offset = 0; this.mainCue = 0; this.loop = null; this.loopIn = null;
      this.synced = false; this.renderSync();
      this.cues = [];
      this.status(t('Chargement…'));
      this.renderInfo();
      try {
        const [full, res] = await Promise.all([
          api('GET', `/api/track?path=${encodeURIComponent(track.path)}`),
          fetch(`/api/audio?path=${encodeURIComponent(track.path)}`, { headers: { 'X-Lang': window.I18N.lang } })
        ]);
        if (!res.ok) { let msg = `Erreur ${res.status}`; try { msg = (await res.json()).error || msg; } catch (e) { /* texte */ } throw new Error(msg); }
        const data = await res.arrayBuffer();
        if (token !== this.loading) return;
        this.status(t('Décodage…'));
        const buf = await ctx.decodeAudioData(data);
        if (token !== this.loading) return;
        this.track = full;
        this.buffer = buf;
        this.cues = full.cues || [];
        this.peaks = computePeaks(buf);
        const firstHot = this.cues.find((c) => c.kind !== 'loop' && c.kind === 'memory') || null;
        this.mainCue = firstHot ? firstHot.start : 0;
        this.offset = this.mainCue;
        this.status('');
        this.renderInfo(); this.renderPads(); this.renderMem(); this.renderLoopBtns();
        refDeck = this; library.renderRows(); // la liste montre ce qui s'enchaîne avec ce morceau
        if (!this.bpm) setTimeout(() => { // aucune grille importée : on l'analyse (comme Mixxx), sans marquer le morceau « modifié »
          if (this.buffer === buf && !this.bpm) { const r = detectBpmGrid(buf); if (r) this.saveMeta({ bpm: r.bpm, gridStart: r.gridStart }, true); }
        }, 30);
      } catch (e) {
        if (token !== this.loading) return;
        this.status('');
        this.track = null;
        this.renderInfo();
        toast(t('Deck {id} : {msg}', { id: this.id, msg: e.message }), 'error');
      }
    }

    status(t) { $('.d-status', this.el).textContent = t; }

    // ---------- transport ----------
    stopSource() {
      if (this.source) { try { this.source.onended = null; this.source.stop(); } catch (e) { /* déjà arrêté */ } this.source.disconnect(); this.source = null; }
    }

    startAt(pos) {
      this.stopSource();
      const s = ctx.createBufferSource();
      s.buffer = this.buffer;
      s.playbackRate.value = this.rate;
      if (this.loop && this.loop.active) { s.loop = true; s.loopStart = this.loop.start; s.loopEnd = this.loop.end; }
      s.connect(this.trim);
      s.onended = () => { if (this.source === s) { this.playing = false; this.offset = this.duration; this.source = null; this.renderTransport(); } };
      s.start(0, Math.max(0, Math.min(pos, this.duration - 0.001)));
      this.source = s;
      this.offset = pos;
      this.startedAt = ctx.currentTime;
      this.playing = true;
    }

    play() { if (!this.buffer) return; audio(); refDeck = this; this.startAt(this.offset >= this.duration ? 0 : this.offset); this.renderTransport(); }
    pause() { if (!this.playing) return; this.offset = this.position; this.stopSource(); this.playing = false; this.renderTransport(); }
    toggle() { this.playing ? this.pause() : this.play(); }

    seek(pos) {
      if (!this.buffer) return;
      pos = Math.max(0, Math.min(pos, this.duration));
      if (this.loop && this.loop.active && (pos < this.loop.start || pos > this.loop.end)) this.loop.active = false;
      if (this.playing) this.startAt(pos); else this.offset = pos;
      this.renderLoopBtns();
    }

    cue() {
      if (!this.buffer) return;
      if (this.playing) { this.pause(); this.seek(this.mainCue); }
      else { this.mainCue = this.position; }
    }

    setRate(pct, fromSync) {
      const p = this.position;
      this.rate = 1 + pct / 100;
      if (this.source) { this.source.playbackRate.value = this.rate; this.offset = p; this.startedAt = ctx.currentTime; }
      $('.d-pitchval', this.el).textContent = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)} %`;
      if (!fromSync && this.synced) { this.synced = false; this.renderSync(); } // réglage manuel : on relâche le SYNC
      this.renderInfo();
      updateSyncLights(); // l'autre deck peut ne plus être calé
      clearTimeout(this.compatTimer);
      if (refDeck === this) this.compatTimer = setTimeout(() => library.renderRows(), 250);
    }

    renderSync() { $('.d-sync', this.el).classList.toggle('on', this.synced); }

    /** Pose / corrige le BPM du morceau à la main (clic sur l'affichage du BPM). */
    editBpm() {
      if (!this.track) { toast(t('Charge un morceau pour régler son BPM.')); return; }
      if (this._editingBpm) return;
      this._editingBpm = true;
      const box = $('.d-bpm', this.el);
      const inp = document.createElement('input');
      inp.type = 'number'; inp.className = 'd-bpm-edit'; inp.step = '0.01'; inp.min = '40'; inp.max = '250';
      inp.value = this.bpm ? Number(this.bpm).toFixed(2) : '';
      inp.title = t('BPM du morceau (Entrée pour valider, Échap pour annuler)');
      box.replaceWith(inp); inp.focus(); inp.select();
      const restore = () => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'd-bpm'; b.title = t('BPM — clic pour régler');
        inp.replaceWith(b);
        b.addEventListener('click', () => this.editBpm());
        this._editingBpm = false;
        this.renderInfo();
      };
      let done = false;
      const commit = async () => {
        if (done) return; done = true;
        const v = Number(inp.value);
        const path = this.track && this.track.path;
        restore();
        if (path && Number.isFinite(v) && v >= 40 && v <= 250) {
          try {
            await api('PUT', '/api/track/meta', { path, bpm: v });
            if (this.track && this.track.path === path) { this.track.bpm = Math.round(v * 100) / 100; this.renderInfo(); }
            library.updateBpm(path, Math.round(v * 100) / 100);
            if (refDeck === this) library.renderRows();
          } catch (e) { toast(t('BPM non enregistré : {msg}', { msg: e.message }), 'error'); }
        }
      };
      inp.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
        else if (ev.key === 'Escape') { ev.preventDefault(); done = true; restore(); }
      });
      inp.addEventListener('blur', commit);
    }

    /** Enregistre BPM / début de grille (via /api/track/meta). auto = détection automatique (n'est pas marquée « modifiée »). */
    async saveMeta(patch, auto) {
      if (!this.track) return;
      const path = this.track.path;
      try {
        await api('PUT', '/api/track/meta', { path, ...patch, ...(auto ? { auto: true } : {}) });
        if (this.track && this.track.path === path) {
          if (patch.bpm != null) this.track.bpm = Math.round(patch.bpm * 100) / 100;
          if ('gridStart' in patch) this.track.gridStart = patch.gridStart;
          this.renderInfo();
        }
        if (patch.bpm != null) library.updateBpm(path, Math.round(patch.bpm * 100) / 100);
        if (refDeck === this) library.renderRows();
      } catch (e) { toast(t('Grille non enregistrée : {msg}', { msg: e.message }), 'error'); }
    }

    /** Barre « Grille » : Tap, caler le 1er temps, ×2 / ÷2, détection automatique. */
    gridAction(a) {
      if (!this.buffer || !this.track) return;
      if (a === 'tap') return this.tapTempo();
      if (a === 'auto') {
        const r = detectBpmGrid(this.buffer);
        if (!r) { toast(t('Détection impossible sur ce morceau.')); return; }
        this.saveMeta({ bpm: r.bpm, gridStart: r.gridStart });
        toast(t('Détecté : {bpm} BPM', { bpm: r.bpm.toFixed(2) }));
        return;
      }
      if (!this.bpm) { toast(t('Pose d\'abord un BPM (clic sur le BPM, Tap, ou Auto).')); return; }
      const beat = 60 / this.bpm;
      if (a === 'down') {
        const g0 = Number.isFinite(this.track.gridStart) ? this.track.gridStart : 0;
        const pos = this.position;
        const ng = pos - Math.round((pos - g0) / beat) * beat; // décale la grille pour qu'un temps tombe sur la tête de lecture
        this.saveMeta({ gridStart: Math.max(0, Math.round(ng * 1000) / 1000) });
      } else if (a === 'half') this.saveMeta({ bpm: Math.round(this.bpm / 2 * 100) / 100 });
      else if (a === 'double') this.saveMeta({ bpm: Math.round(this.bpm * 2 * 100) / 100 });
    }

    /** Tap tempo : clics en rythme -> BPM (médiane des intervalles). */
    tapTempo() {
      const now = performance.now();
      if (!this._taps || now - (this._tapLast || 0) > 2000) this._taps = [];
      this._taps.push(now); this._tapLast = now;
      if (this._taps.length >= 2) {
        const spans = []; for (let i = 1; i < this._taps.length; i++) spans.push(this._taps[i] - this._taps[i - 1]);
        spans.sort((x, y) => x - y); const med = spans[Math.floor(spans.length / 2)];
        if (med > 250 && med < 1200) this.saveMeta({ bpm: Math.round(60000 / med * 100) / 100 });
      }
      if (this._taps.length > 8) this._taps = this._taps.slice(-8);
    }

    /** Quantize (bouton Q) : cale une position sur le temps le plus proche de la grille, si BPM et grille sont connus. */
    snap(t) {
      if (!this.quant || !this.bpm || !this.track || !Number.isFinite(this.track.gridStart)) return t;
      const beat = 60 / this.bpm;
      return Math.max(0, this.track.gridStart + Math.round((t - this.track.gridStart) / beat) * beat);
    }

    get bpm() { return this.track && this.track.bpm ? this.track.bpm : null; }

    // ---------- loops ----------
    setLoop(start, end) {
      const pos = this.position;
      this.loop = { start, end, active: true };
      if (this.playing) this.startAt(pos >= start && pos < end ? pos : start);
      else this.offset = start;
      this.renderLoopBtns();
    }

    loopAction(a) {
      if (!this.buffer) return;
      const pos = this.position;
      if (a === 'q') { this.quant = !this.quant; this.renderLoopBtns(); return; }
      if (a === 'in') { this.loopIn = this.snap(pos); this.renderLoopBtns(); }
      else if (a === 'out') {
        const start = this.loopIn ?? (this.loop ? this.loop.start : null);
        if (start === null || pos <= start + 0.05) { toast(t("Pose d'abord le début de la loop (IN).")); return; }
        this.setLoop(start, Math.max(start + 0.05, this.snap(pos))); this.loopIn = null;
      } else if (a === 'beat4' || a === 'beat8') {
        if (!this.bpm) { toast(t('BPM inconnu pour ce morceau : pose la loop avec IN / OUT.')); return; }
        const beats = a === 'beat4' ? 4 : 8;
        const beat = 60 / this.bpm;
        let start = pos;
        if (Number.isFinite(this.track.gridStart)) start = this.track.gridStart + Math.round((pos - this.track.gridStart) / beat) * beat; // calé sur la grille
        this.setLoop(Math.max(0, start), Math.max(0, start) + beats * beat);
      } else if (a === 'exit') {
        if (!this.loop) return;
        const p = this.position;
        this.loop.active = !this.loop.active;
        if (this.playing) this.startAt(this.loop.active ? (p >= this.loop.start && p < this.loop.end ? p : this.loop.start) : p);
        this.renderLoopBtns();
      } else if (a === 'memloop') {
        if (!this.loop) { toast(t('Aucune loop à enregistrer.')); return; }
        this.addCue({ kind: 'loop', num: -1, start: this.loop.start, end: this.loop.end });
      } else if (a === 'memcue') {
        this.addCue({ kind: 'memory', num: -1, start: this.snap(pos) });
      }
    }

    // ---------- cues ----------
    addCue(c) {
      this.cues.push({ id: Math.random().toString(16).slice(2, 10), name: '', color: '', ...c });
      this.cues.sort((x, y) => x.start - y.start);
      this.saveCues();
    }

    padClick(n, ev) {
      if (!this.buffer) return;
      const existing = this.cues.find((c) => c.num === n && c.kind !== 'memory');
      if (ev.shiftKey || ev.type === 'contextmenu') { // effacer
        if (existing) { this.cues = this.cues.filter((c) => c !== existing); this.saveCues(); }
        return;
      }
      const btn = $$('.pad', this.el)[n];
      if (btn) { btn.classList.remove('hit'); void btn.offsetWidth; btn.classList.add('hit'); }
      if (existing) {
        if (existing.kind === 'loop') this.setLoop(existing.start, existing.end);
        else this.seek(existing.start);
        if (!this.playing) this.mainCue = existing.start;
        return;
      }
      if (this.loop && this.loop.active) this.addCue({ kind: 'loop', num: n, start: this.loop.start, end: this.loop.end, color: HOT_COLORS[n] });
      else this.addCue({ kind: 'hot', num: n, start: this.snap(this.position), color: HOT_COLORS[n] });
    }

    saveCues() {
      this.renderPads(); this.renderMem();
      if (!this.track) return;
      const path = this.track.path;
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(async () => {
        try {
          const r = await api('PUT', '/api/track/cues', { path, cues: this.cues });
          if (this.track && this.track.path === path) { this.cues = r.cues; this.renderPads(); this.renderMem(); } // ré-aligne l'affichage sur les objets renvoyés
          library.updateCount(path, r.cues.length);
        } catch (e) { toast(t('Cues non enregistrés : {msg}', { msg: e.message }), 'error'); }
      }, 300);
    }

    // ---------- rendu ----------
    renderInfo() {
      const t = this.track;
      $('.d-title', this.el).textContent = t ? (t.title || t.path) : window.I18N.t('Glisse un morceau ici');
      $('.d-artist', this.el).textContent = t ? t.artist : '';
      const bpmEl = $('.d-bpm', this.el); // absent pendant l'édition
      if (bpmEl) bpmEl.textContent = this.bpm ? (this.bpm * this.rate).toFixed(2) : '—';
      $('.d-key', this.el).textContent = t ? [showKey(t.key), t.format].filter(Boolean).join(' · ') : '';
    }

    renderTransport() {
      $('[data-a="play"]', this.el).classList.toggle('on', this.playing);
      $('[data-a="play"]', this.el).textContent = this.playing ? '❚❚' : '▶';
    }

    renderLoopBtns() {
      $('[data-a="in"]', this.el).classList.toggle('armed', this.loopIn !== null);
      $('[data-a="exit"]', this.el).classList.toggle('on', Boolean(this.loop && this.loop.active));
      $('[data-a="q"]', this.el).classList.toggle('on', this.quant);
    }

    renderPads() {
      const box = $('.pads', this.el);
      box.innerHTML = '';
      for (let n = 0; n < 8; n++) {
        const c = this.cues.find((x) => x.num === n && x.kind !== 'memory');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `pad${c ? ' set' : ''}${c && c.kind === 'loop' ? ' loop' : ''}`;
        b.textContent = PAD[n];
        if (c) { b.style.background = c.color || HOT_COLORS[n]; b.style.setProperty('--pad', c.color || HOT_COLORS[n]); }
        b.title = c ? `${t(c.kind === 'loop' ? 'Hot loop {pad} à {time}' : 'Hot cue {pad} à {time}', { pad: PAD[n], time: fmt(c.start, true) })}${c.name ? ` « ${c.name} »` : ''}${t(' — Maj+clic ou clic droit : effacer')}` : t('Hot cue {pad} : clic pour poser (pendant une loop : hot loop)', { pad: PAD[n] });
        b.addEventListener('click', (ev) => this.padClick(n, ev));
        b.addEventListener('contextmenu', (ev) => { ev.preventDefault(); this.padClick(n, ev); });
        if (c) { // corbeille au coin (en plus de Maj+clic / clic droit) : efface le hot cue / hot loop
          const x = document.createElement('span');
          x.className = 'pad-x'; x.textContent = '×'; x.title = t('Effacer');
          x.addEventListener('click', (ev) => { ev.stopPropagation(); this.cues = this.cues.filter((y) => !(y.num === n && y.kind !== 'memory')); this.saveCues(); });
          b.appendChild(x);
        }
        box.appendChild(b);
      }
    }

    renderMem() {
      const box = $('.memlist', this.el);
      box.innerHTML = '';
      this.cues.filter((c) => c.num < 0).forEach((c) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.innerHTML = `<b>${c.kind === 'loop' ? '⟲' : '♦'}</b>${fmt(c.start, true)}${c.kind === 'loop' ? `–${fmt(c.end, true)}` : ''}${c.name ? ` ${esc(c.name)}` : ''}<button type="button" title="${t('Supprimer')}">×</button>`;
        chip.title = t('Clic : y aller — double-clic : renommer');
        chip.addEventListener('click', (ev) => {
          if (ev.target.tagName === 'BUTTON') { this.cues = this.cues.filter((x) => x.id !== c.id); this.saveCues(); return; } // par id : la liste a pu être remplacée après enregistrement
          if (c.kind === 'loop') this.setLoop(c.start, c.end); else this.seek(c.start);
        });
        chip.addEventListener('dblclick', () => {
          const name = prompt(t('Nom du repère (visible dans Rekordbox) :'), c.name || '');
          if (name !== null) { const cur = this.cues.find((x) => x.id === c.id); if (cur) cur.name = name.slice(0, 60); this.saveCues(); }
        });
        box.appendChild(chip);
      });
    }

    bindUi() {
      $('[data-a="play"]', this.el).addEventListener('click', () => this.toggle());
      $('[data-a="cue"]', this.el).addEventListener('click', () => this.cue());
      $$('.lbtn[data-a]', this.el).forEach((b) => b.addEventListener('click', () => this.loopAction(b.dataset.a)));
      $$('.lbtn[data-g]', this.el).forEach((b) => b.addEventListener('click', () => this.gridAction(b.dataset.g)));
      $('.d-bpm', this.el).addEventListener('click', () => this.editBpm());
      const pitch = $('.d-pitch', this.el);
      pitch.addEventListener('input', () => this.setRate(Number(pitch.value)));
      pitch.addEventListener('dblclick', () => { pitch.value = 0; this.setRate(0); });
      $('.d-range', this.el).addEventListener('click', (ev) => {
        this.range = this.range === 8 ? 16 : this.range === 16 ? 50 : 8;
        pitch.min = -this.range; pitch.max = this.range;
        ev.target.textContent = `±${this.range}`;
      });
      $('.d-sync', this.el).addEventListener('click', () => {
        const other = this.id === 'A' ? decks.B : decks.A;
        if (this.synced) { this.synced = false; this.renderSync(); return; } // deuxième clic : relâcher (garde le tempo actuel)
        if (!this.bpm || !other.bpm) { toast(t("BPM inconnu sur l'un des deux decks.")); return; }
        let pct = ((other.bpm * other.rate) / this.bpm - 1) * 100;
        if (Math.abs(pct) > this.range) { this.range = 50; pitch.min = -50; pitch.max = 50; $('.d-range', this.el).textContent = '±50'; }
        pct = Math.max(-50, Math.min(50, pct));
        pitch.value = pct; this.setRate(pct, true);
        this.synced = true; this.renderSync();
      });
      // clic sur les formes d'onde : se placer
      const over = $('.wave-over', this.el);
      over.addEventListener('click', (ev) => { const r = over.getBoundingClientRect(); this.seek(((ev.clientX - r.left) / r.width) * this.duration); });
      const zoom = $('.wave-zoom', this.el);
      let drag = null;
      zoom.addEventListener('pointerdown', (ev) => { if (!this.buffer) return; drag = { x: ev.clientX, pos: this.position, was: this.playing }; if (this.playing) this.pause(); zoom.setPointerCapture(ev.pointerId); });
      zoom.addEventListener('pointermove', (ev) => { if (!drag) return; const w = zoom.getBoundingClientRect().width; this.seek(drag.pos - ((ev.clientX - drag.x) / w) * ZOOM_SECONDS); });
      zoom.addEventListener('pointerup', () => { if (drag && drag.was) this.play(); drag = null; });
      // glisser un morceau de la liste sur le deck
      this.el.addEventListener('dragover', (ev) => { if (ev.dataTransfer.types.includes('application/x-fadarr-track')) { ev.preventDefault(); this.el.classList.add('drop'); } });
      this.el.addEventListener('dragleave', () => this.el.classList.remove('drop'));
      this.el.addEventListener('drop', (ev) => {
        this.el.classList.remove('drop');
        const data = ev.dataTransfer.getData('application/x-fadarr-track');
        if (data) { ev.preventDefault(); this.load(JSON.parse(data)); }
      });
    }
  }

  // ===========================================================================
  // FORMES D'ONDE
  // ===========================================================================

  const PEAK_RATE = 150; // valeurs par seconde
  const ZOOM_SECONDS = 8;

  /**
   * Formes d'onde « 3 bandes » (façon Rekordbox / Traktor) : pour chaque tranche de 1/150 s, le pic du signal complet
   * et celui des graves (< ~250 Hz), des médiums et des aigus (> ~2,5 kHz), séparés par de simples filtres du 1er ordre.
   * Calcul unique au chargement du morceau (~0,2 s pour 8 min).
   */
  function computePeaks(buf) {
    const sr = buf.sampleRate;
    const n = Math.ceil(buf.duration * PEAK_RATE);
    const max = new Float32Array(n); const lo = new Float32Array(n); const mi = new Float32Array(n); const hi = new Float32Array(n);
    const c0 = buf.getChannelData(0); const c1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : c0;
    const aL = Math.exp(-2 * Math.PI * 250 / sr); const aH = Math.exp(-2 * Math.PI * 2500 / sr);
    let l1 = 0, l2 = 0, h1 = 0, h2 = 0;
    const step = sr / PEAK_RATE;
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * step); const b = Math.min(c0.length, Math.floor((i + 1) * step));
      let m = 0, ml = 0, mm = 0, mh = 0;
      for (let j = a; j < b; j++) {
        const x = (c0[j] + c1[j]) * 0.5;
        l1 = (1 - aL) * x + aL * l1; l2 = (1 - aL) * l1 + aL * l2;   // passe-bas 2 pôles : graves
        h1 = (1 - aH) * x + aH * h1; h2 = (1 - aH) * h1 + aH * h2;   // passe-bas 2,5 kHz ; aigus = reste
        const high = x - h2; const mid = h2 - l2;
        const ax = x < 0 ? -x : x; if (ax > m) m = ax;
        const al = l2 < 0 ? -l2 : l2; if (al > ml) ml = al;
        const am = mid < 0 ? -mid : mid; if (am > mm) mm = am;
        const ah = high < 0 ? -high : high; if (ah > mh) mh = ah;
      }
      max[i] = m; lo[i] = ml; mi[i] = mm; hi[i] = mh;
    }
    let top = 0; for (let i = 0; i < n; i++) if (max[i] > top) top = max[i];
    if (top > 0) for (let i = 0; i < n; i++) { max[i] /= top; lo[i] = Math.min(1, lo[i] / top); mi[i] = Math.min(1, (mi[i] / top) * 1.25); hi[i] = Math.min(1, (hi[i] / top) * 1.7); }
    return { rate: PEAK_RATE, max, lo, mi, hi };
  }

  /**
   * Détection de tempo et du premier temps (façon analyseur de beatgrid de Mixxx, version légère) :
   * enveloppe d'attaques sur les graves -> autocorrélation pour le BPM (70-180) -> phase pour caler le 1er temps.
   * Analyse les ~2 premières minutes. Renvoie { bpm, gridStart } ou null.
   */
  function detectBpmGrid(buf) {
    const sr = buf.sampleRate;
    const N = Math.floor(Math.min(buf.duration, 120) * sr);
    const c0 = buf.getChannelData(0); const c1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : c0;
    const hop = 512; const fps = sr / hop; const nf = Math.floor(N / hop);
    if (nf < 40) return null;
    const env = new Float32Array(nf);
    const aL = Math.exp(-2 * Math.PI * 200 / sr); let lp1 = 0, lp2 = 0, prev = 0;
    for (let f = 0; f < nf; f++) {
      let e = 0; const a = f * hop; const b = a + hop;
      for (let j = a; j < b; j++) { const x = (c0[j] + c1[j]) * 0.5; lp1 = (1 - aL) * x + aL * lp1; lp2 = (1 - aL) * lp1 + aL * lp2; e += lp2 * lp2; }
      const v = Math.sqrt(e / hop); env[f] = Math.max(0, v - prev); prev = v; // flux d'énergie des graves (attaques)
    }
    let mx = 0; for (let i = 0; i < nf; i++) if (env[i] > mx) mx = env[i];
    if (mx <= 0) return null; for (let i = 0; i < nf; i++) env[i] /= mx;
    // 1) autocorrélation pour trouver le BPM grossier
    let coarse = 0, bestAc = -1;
    for (let bpm = 70; bpm <= 180; bpm += 0.5) {
      const lag = Math.round(fps * 60 / bpm); if (lag < 2 || lag >= nf) continue;
      let s = 0; for (let i = 0; i + lag < nf; i++) s += env[i] * env[i + lag];
      if (s > bestAc) { bestAc = s; coarse = bpm; }
    }
    if (!coarse) return null;
    // 2) ajustement « peigne de temps » (BPM + phase ensemble) : on récompense les temps qui tombent sur les attaques -> cale précisément la grille
    const comb = (bpm) => {
      const P = fps * 60 / bpm; const Pr = Math.max(1, Math.round(P));
      let best = -1, off = 0;
      for (let o = 0; o < Pr; o++) { let s = 0; for (let k = o; k < nf; k += P) s += env[Math.round(k)] || 0; if (s > best) { best = s; off = o; } }
      return { score: best, off, P };
    };
    let bpm = coarse, fit = comb(coarse);
    for (let cand = coarse - 2; cand <= coarse + 2; cand += 0.05) { if (cand < 60) continue; const f = comb(cand); if (f.score > fit.score) { fit = f; bpm = cand; } }
    while (bpm < 90) bpm *= 2; while (bpm > 175) bpm /= 2;
    const ri = Math.round(bpm); // arrondi doux : la plupart des BPM sont entiers ou demis
    if (Math.abs(bpm - ri) < 0.08) bpm = ri; else { const rh = Math.round(bpm * 2) / 2; if (Math.abs(bpm - rh) < 0.08) bpm = rh; }
    const beatS = 60 / bpm;
    const gridStart = (fit.off / fps) % beatS;
    return { bpm: Math.round(bpm * 100) / 100, gridStart: Math.round(gridStart * 1000) / 1000 };
  }

  /** Couleurs des 3 bandes (réglables par skin : --wf-lo / --wf-mi / --wf-hi). */
  function waveColors() {
    const cs = getComputedStyle(document.body);
    return { lo: cs.getPropertyValue('--wf-lo').trim() || '#2f6df2', mi: cs.getPropertyValue('--wf-mi').trim() || '#f2992e', hi: cs.getPropertyValue('--wf-hi').trim() || '#f4f1ea' };
  }

  // Style de forme d'onde : « bands » (3 bandes empilées) ou « rgb » (une couleur par colonne, façon Mixxx).
  let waveStyle = 'rgb';
  try { waveStyle = localStorage.getItem('fadarr-wave') || 'rgb'; } catch (e) { /* rien */ }
  const hexRgb = (h) => { const n = parseInt(String(h).replace('#', ''), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; };
  // Waveform RGB « full color » façon Mixxx/Traktor : graves = rouge, médiums = vert, aigus = bleu (indépendant du skin).
  const RGB_LO = { r: 255, g: 48, b: 48 }, RGB_MI = { r: 46, g: 224, b: 110 }, RGB_HI = { r: 64, g: 120, b: 255 };
  function waveColorsRGB() { return { lo: RGB_LO, mi: RGB_MI, hi: RGB_HI }; }

  /** Colonne « RGB » (façon Mixxx) : une seule couleur, mélange des 3 bandes pondéré par leur énergie ; hauteur = amplitude. */
  function drawColumnRGB(g, x, h, v, cols, scale) {
    const [m, l, md, hh] = v;
    const sum = l + md + hh;
    const mid = h / 2;
    let r = 70, gg = 70, b = 70;
    if (sum > 0) {
      r = (l * cols.lo.r + md * cols.mi.r + hh * cols.hi.r) / sum;
      gg = (l * cols.lo.g + md * cols.mi.g + hh * cols.hi.g) / sum;
      b = (l * cols.lo.b + md * cols.mi.b + hh * cols.hi.b) / sum;
    }
    const bar = Math.max(1, m * scale);
    g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
    g.fillRect(x, mid - bar / 2, 1, bar);
  }

  /** Renvoie les couleurs et la fonction de dessin selon le style choisi. */
  function wavePaint() { return waveStyle === 'rgb' ? { cols: waveColorsRGB(), draw: drawColumnRGB } : { cols: waveColors(), draw: drawColumn }; }

  /** Pics d'une plage d'indices [i0, i1[ (le plus fort de chaque bande). */
  function peakRange(pk, i0, i1) {
    let m = 0, l = 0, md = 0, h = 0;
    for (let i = Math.max(0, i0); i < Math.min(i1, pk.max.length); i++) {
      if (pk.max[i] > m) m = pk.max[i]; if (pk.lo[i] > l) l = pk.lo[i]; if (pk.mi[i] > md) md = pk.mi[i]; if (pk.hi[i] > h) h = pk.hi[i];
    }
    return [m, l, md, h];
  }

  /** Dessine une colonne 3 bandes centrée (graves au fond, médiums, aigus devant). */
  function drawColumn(g, x, h, v, col, scale) {
    const [, l, m, hh] = v;
    const mid = h / 2;
    const bl = Math.max(1, l * scale), bm = Math.max(0, m * scale * 0.82), bh = Math.max(0, hh * scale * 0.6);
    g.fillStyle = col.lo; g.fillRect(x, mid - bl / 2, 1, bl);
    if (bm >= 1) { g.fillStyle = col.mi; g.fillRect(x, mid - bm / 2, 1, bm); }
    if (bh >= 1) { g.fillStyle = col.hi; g.fillRect(x, mid - bh / 2, 1, bh); }
  }

  function sizeCanvas(cv) {
    const r = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width * dpr)); const h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return { w, h, dpr };
  }

  function cueColor(c) { return c.kind === 'memory' || c.num < 0 ? '#d68bff' : (c.color || HOT_COLORS[c.num]); }

  /** Vue d'ensemble pré-rendue (une seule fois par morceau et par taille) ; à chaque image on n'ajoute que le curseur. */
  function overviewImage(d, w, h) {
    if (d.overCache && d.overCache.w === w && d.overCache.h === h && d.overCache.peaks === d.peaks && d.overCache.skin === document.body.dataset.skin && d.overCache.wave === waveStyle) return d.overCache.canvas;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); const { cols, draw } = wavePaint(); const n = d.peaks.max.length;
    for (let x = 0; x < w; x++) {
      const a = Math.floor((x / w) * n); const b = Math.max(a + 1, Math.floor(((x + 1) / w) * n));
      draw(g, x, h, peakRange(d.peaks, a, b), cols, h - 4);
    }
    d.overCache = { w, h, peaks: d.peaks, skin: document.body.dataset.skin, wave: waveStyle, canvas: cv };
    return cv;
  }

  function drawDeck(d) {
    // --- vue d'ensemble ---
    const over = $('.wave-over', d.el);
    let { w, h, dpr } = sizeCanvas(over);
    let g = over.getContext('2d');
    g.clearRect(0, 0, w, h);
    if (d.peaks) {
      const pos = d.position;
      const px = (pos / d.duration) * w;
      g.drawImage(overviewImage(d, w, h), 0, 0);
      g.fillStyle = 'rgba(8,9,11,.55)'; g.fillRect(0, 0, px, h); // partie déjà jouée assombrie
      if (d.loop) { g.fillStyle = d.loop.active ? 'rgba(60,207,110,.28)' : 'rgba(255,255,255,.08)'; g.fillRect((d.loop.start / d.duration) * w, 0, Math.max(2, ((d.loop.end - d.loop.start) / d.duration) * w), h); }
      for (const c of d.cues) { g.fillStyle = cueColor(c); g.fillRect(Math.round((c.start / d.duration) * w), 0, 2 * dpr, h); }
      g.fillStyle = '#fff'; g.fillRect(Math.round(px), 0, 2 * dpr, h);
    }
    // --- vue zoomée (la tête de lecture au centre) ---
    const zoom = $('.wave-zoom', d.el);
    ({ w, h, dpr } = sizeCanvas(zoom));
    g = zoom.getContext('2d');
    g.clearRect(0, 0, w, h);
    if (d.peaks) {
      const pos = d.position;
      const span = ZOOM_SECONDS;
      const t0 = pos - span / 2;
      const perPx = (span * d.peaks.rate) / w;
      const { cols, draw } = wavePaint();
      if (d.loop) {
        const x1 = ((d.loop.start - t0) / span) * w; const x2 = ((d.loop.end - t0) / span) * w;
        g.fillStyle = d.loop.active ? 'rgba(60,207,110,.20)' : 'rgba(255,255,255,.06)'; g.fillRect(x1, 0, x2 - x1, h);
      }
      for (let x = 0; x < w; x++) {
        const i0 = Math.floor((t0 * d.peaks.rate) + x * perPx);
        const i1 = Math.max(i0 + 1, Math.floor((t0 * d.peaks.rate) + (x + 1) * perPx));
        if (i1 <= 0 || i0 >= d.peaks.max.length) continue;
        g.globalAlpha = x < w / 2 ? 0.5 : 1;
        draw(g, x, h, peakRange(d.peaks, i0, i1), cols, h - 6);
      }
      g.globalAlpha = 1;
      // grille de tempo (par-dessus, discrète ; temps fort toutes les 4)
      if (d.bpm && Number.isFinite(d.track.gridStart)) {
        const beat = 60 / d.bpm;
        const first = Math.ceil((t0 - d.track.gridStart) / beat);
        for (let k = first; ; k++) {
          const t = d.track.gridStart + k * beat; if (t > t0 + span) break;
          const x = ((t - t0) / span) * w;
          g.fillStyle = k % 4 === 0 ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.16)';
          if (k % 4 === 0) { g.fillRect(Math.round(x), 0, dpr, 5 * dpr); g.fillRect(Math.round(x), h - 5 * dpr, dpr, 5 * dpr); }
          g.fillStyle = k % 4 === 0 ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.07)';
          g.fillRect(Math.round(x), 0, dpr, h);
        }
      }
      g.font = `600 ${10 * dpr}px system-ui`;
      for (const c of d.cues) {
        const x = ((c.start - t0) / span) * w;
        if (x < -20 || x > w + 20) continue;
        const cc = cueColor(c);
        g.fillStyle = cc; g.fillRect(Math.round(x), 0, 2 * dpr, h);
        g.fillRect(Math.round(x), 0, 13 * dpr, 13 * dpr); // drapeau
        g.fillStyle = '#111'; g.fillText(c.num >= 0 ? PAD[c.num] : (c.kind === 'loop' ? '⟲' : '♦'), x + 3 * dpr, 10 * dpr);
        if (c.name) { g.fillStyle = cc; g.fillText(c.name, x + 16 * dpr, 10 * dpr); }
      }
      if (!d.playing && Number.isFinite(d.mainCue)) { const x = ((d.mainCue - t0) / span) * w; g.fillStyle = '#e6b422'; g.fillRect(Math.round(x), h - 6 * dpr, 2 * dpr, 6 * dpr); }
      // tête de lecture lumineuse
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(Math.round(w / 2) - 3 * dpr, 0, 8 * dpr, h);
      g.fillStyle = '#fff'; g.fillRect(Math.round(w / 2), 0, 2 * dpr, h);
    } else if ($('.d-status', d.el).textContent) {
      g.fillStyle = '#5b6168'; g.font = `${12 * dpr}px system-ui`; g.fillText($('.d-status', d.el).textContent, 12 * dpr, h / 2);
    }
    drawPhase(d);
    // --- temps, vu-mètre ---
    $('.d-pos', d.el).textContent = fmt(d.position, true);
    $('.d-rem', d.el).textContent = d.buffer ? fmt(-(d.duration - d.position) / d.rate) : '-0:00';
    if (d.analyser) {
      const arr = new Uint8Array(d.analyser.fftSize);
      d.analyser.getByteTimeDomainData(arr);
      let peak = 0; for (const v of arr) { const a = Math.abs(v - 128) / 128; if (a > peak) peak = a; }
      const bar = $(`.ch[data-ch="${d.id}"] .meter div`);
      bar.style.height = `${Math.min(100, peak * 110)}%`;
    }
  }

  /** Phase d'un deck dans sa mesure de temps : 0..1 (0 = sur le temps), ou null sans BPM / grille. */
  function beatPhase(d) {
    if (!d.buffer || !d.bpm || !Number.isFinite(d.track && d.track.gridStart)) return null;
    const beat = 60 / d.bpm;
    const f = ((d.position - d.track.gridStart) / beat) % 1;
    return f < 0 ? f + 1 : f;
  }

  /** Indicateur de phase : décalage de ce deck par rapport à l'autre (quand les deux jouent), en fraction de temps. */
  function drawPhase(d) {
    const el = $('.phase', d.el);
    const other = d.id === 'A' ? decks.B : decks.A;
    const a = beatPhase(d); const b = beatPhase(other);
    const on = d.playing && other.playing && a !== null && b !== null;
    el.classList.toggle('on', on);
    if (!on) return;
    let diff = a - b; if (diff > 0.5) diff -= 1; if (diff < -0.5) diff += 1;
    $('i', el).style.left = `${50 + diff * 100}%`;
    el.classList.toggle('locked', Math.abs(diff) < 0.04);
  }

  function frame() {
    drawDeck(decks.A); drawDeck(decks.B);
    for (const d of [decks.A, decks.B]) d.el.classList.toggle('playing', d.playing);
    requestAnimationFrame(frame);
  }

  /** Éteint le SYNC d'un deck dès que son tempo effectif ne colle plus à celui de l'autre. */
  function updateSyncLights() {
    for (const d of [decks.A, decks.B]) {
      if (!d.synced) continue;
      const o = d.id === 'A' ? decks.B : decks.A;
      const a = d.bpm ? d.bpm * d.rate : 0;
      const b = o.bpm ? o.bpm * o.rate : 0;
      if (!a || !b || Math.abs(a / b - 1) > 0.001) { d.synced = false; d.renderSync(); }
    }
  }

  // ===========================================================================
  // MIXEUR
  // ===========================================================================

  function applyCrossfader() {
    if (!ctx) return;
    const v = (xf.value + 1) / 2; // 0 = tout A, 1 = tout B
    // courbe à puissance constante, plein volume des deux côtés au centre
    decks.A.xgain.gain.value = Math.min(1, Math.cos(v * Math.PI / 2) / Math.SQRT1_2);
    decks.B.xgain.gain.value = Math.min(1, Math.sin(v * Math.PI / 2) / Math.SQRT1_2);
  }

  /** Remet un réglage à sa valeur de départ (data-def) et prévient les écouteurs. */
  function resetInput(inp) {
    inp.value = inp.dataset.def ?? 0;
    inp.dispatchEvent(new Event('input'));
  }

  /**
   * Potard : un <input type=range> caché + un bouton rond qu'on tourne en glissant verticalement (Maj : réglage fin),
   * à la molette ou aux flèches du clavier ; double-clic : valeur de départ. L'arc part du centre pour les réglages
   * « bipolaires » (EQ, filtre, gain) et du minimum pour les autres (master).
   */
  function makeKnob(label) {
    const inp = $('input', label);
    const min = Number(inp.min); const max = Number(inp.max); const step = Number(inp.step) || 0.01;
    const def = Number(inp.dataset.def ?? inp.value);
    const bipolar = def > min && def < max; // le zéro (valeur de départ) est à midi, même si la plage n'est pas symétrique (EQ : -26 / +6 dB)
    // valeur <-> position 0..1 : en deux moitiés autour de la valeur de départ
    const toPos = (v) => (!bipolar ? (v - min) / (max - min) : v <= def ? 0.5 * (v - min) / (def - min) : 0.5 + 0.5 * (v - def) / (max - def));
    const fromPos = (f) => { f = Math.max(0, Math.min(1, f)); return !bipolar ? min + f * (max - min) : f <= 0.5 ? min + (f / 0.5) * (def - min) : def + ((f - 0.5) / 0.5) * (max - def); };
    const kn = document.createElement('div');
    kn.className = 'kn'; kn.tabIndex = 0;
    kn.setAttribute('role', 'slider');
    kn.setAttribute('aria-label', $('span', label)?.textContent || inp.dataset.p || '');
    kn.innerHTML = '<div class="kn-ring"></div><div class="kn-cap"><i></i></div>';
    label.insertBefore(kn, inp);
    inp.classList.add('kn-in');
    inp.tabIndex = -1;
    const ring = $('.kn-ring', kn); const cap = $('.kn-cap', kn);
    const draw = () => {
      const a = 270 * toPos(Number(inp.value)); // 0..270°, depuis la position « 7 h »
      // skin Base : anneau de niveau bleu depuis le minimum (comme une couronne de LED) ; autres skins : depuis le zéro
      const a0 = bipolar && document.body.dataset.skin !== 'base' ? 135 : 0;
      const s0 = Math.min(a0, a); const s1 = Math.max(a0, a);
      cap.style.transform = `rotate(${a - 135}deg)`;
      ring.style.background = `conic-gradient(from -135deg, transparent 0deg ${s0}deg, var(--kn-arc) ${s0}deg ${s1}deg, var(--kn-track) ${s1}deg 270deg, transparent 270deg), conic-gradient(from -135deg, var(--kn-track) 0deg ${s0}deg, transparent ${s0}deg)`;
      kn.setAttribute('aria-valuenow', inp.value);
      kn.classList.toggle('kn-zero', Math.abs(Number(inp.value) - Number(inp.dataset.def ?? 0)) < step / 2);
    };
    const setPos = (f) => {
      if (bipolar && Math.abs(f - 0.5) < 0.015) f = 0.5; // petit cran au centre
      const v = Math.max(min, Math.min(max, Math.round(fromPos(f) / step) * step));
      inp.value = v; inp.dispatchEvent(new Event('input'));
    };
    const pos = () => toPos(Number(inp.value));
    let drag = null;
    kn.addEventListener('pointerdown', (ev) => { drag = { y: ev.clientY, f: pos() }; kn.setPointerCapture(ev.pointerId); kn.classList.add('grab'); ev.preventDefault(); });
    kn.addEventListener('pointermove', (ev) => { if (!drag) return; const range = ev.shiftKey ? 900 : 180; setPos(drag.f + (drag.y - ev.clientY) / range); });
    const end = () => { drag = null; kn.classList.remove('grab'); };
    kn.addEventListener('pointerup', end); kn.addEventListener('pointercancel', end);
    kn.addEventListener('dblclick', () => resetInput(inp));
    kn.addEventListener('wheel', (ev) => { ev.preventDefault(); setPos(pos() - Math.sign(ev.deltaY) / 40); }, { passive: false });
    kn.addEventListener('keydown', (ev) => {
      const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[ev.key];
      if (d) { ev.preventDefault(); setPos(pos() + d / 40); } else if (ev.key === 'Home' || ev.key === '0') { ev.preventDefault(); resetInput(inp); }
    });
    inp.addEventListener('input', draw);
    inp._draw = draw;
    draw();
  }

  const SKINS = { base: 'Base', analog: 'Analog', rotary: 'Rotary' };
  function applySkin(name) {
    if (!SKINS[name]) name = 'base';
    document.body.dataset.skin = name;
    $$('.mixer .knob input').forEach((i) => i._draw && i._draw());
    $('#skin').value = name;
    $('#mx-skin-name').textContent = name === 'base' ? '' : name === 'rotary' ? 'ROTARY MIXER' : SKINS[name].toUpperCase();
    // une table rotative n'a pas de crossfader : on le remet au centre pour ne couper aucune voie
    if (name === 'rotary') { const x = $('#xfader'); if (Number(x.value) !== 0) { x.value = 0; xf.value = 0; applyCrossfader(); } }
    try { localStorage.setItem('fadarr-skin', name); } catch (e) { /* stockage indisponible : valable pour cette visite */ }
  }

  function bindMixer() {
    $$('.mixer .knob').forEach(makeKnob);
    $$('.ch').forEach((ch) => {
      const d = decks[ch.dataset.ch];
      $$('input', ch).forEach((inp) => inp.addEventListener('input', () => d.setParam(inp.dataset.p, Number(inp.value))));
      const fader = $('.vfader', ch);
      fader.addEventListener('dblclick', () => resetInput(fader));
      // volume : fader (Base, Analog) ou gros potard (Rotary), toujours synchronisés
      const vol = $('input[data-vol]', ch);
      fader.addEventListener('input', () => { vol.value = fader.value; vol._draw && vol._draw(); });
      vol.addEventListener('input', () => { fader.value = vol.value; });
    });
    const x = $('#xfader');
    x.addEventListener('input', () => { xf.value = Number(x.value); applyCrossfader(); });
    x.addEventListener('dblclick', () => { x.value = 0; xf.value = 0; applyCrossfader(); });
    let saved = 'base';
    try { saved = localStorage.getItem('fadarr-skin') || 'base'; } catch (e) { /* rien */ }
    applySkin(saved);
    $('#skin').addEventListener('change', (e) => applySkin(e.target.value));
    $('#master').addEventListener('input', (e) => { if (master) master.gain.value = Number(e.target.value); });
  }

  // ===========================================================================
  // NAS (bouton de l'en-tête) et analyse
  // ===========================================================================

  let nas = null;
  let scanPoll = null;
  let listedOnce = false;

  function renderNas(s) {
    nas = s;
    const btn = $('#nas-btn');
    btn.classList.remove('on', 'off', 'down');
    if (!s.connected) { btn.classList.add('off'); $('#nas-label').textContent = t('NAS déconnecté'); }
    else if (s.reachable) { btn.classList.add('on'); $('#nas-label').textContent = t('NAS connecté'); }
    else { btn.classList.add('down'); $('#nas-label').textContent = t('NAS injoignable'); }
    const where = t({ tailscale: 'via Tailscale', local: 'réseau local', autre: 'hors réseau' }[s.network?.where] || '');
    $('#nas-net').textContent = where;
    btn.title = s.connected
      ? t(s.reachable ? 'Le dossier musique répond ({dir}). Clic : déconnecter (les morceaux déjà chargés restent jouables).' : 'Le dossier musique ne répond pas ({dir}). Clic : déconnecter (les morceaux déjà chargés restent jouables).', { dir: s.musicDir })
      : t("Accès au NAS fermé : la bibliothèque et les playlists restent consultables, l'écoute est coupée. Clic : reconnecter.");
    $('#scan-btn').disabled = !s.connected || s.scan.running;
    const info = s.scan.running
      ? (s.scan.phase === 'tags' ? t('Lecture des tags : {done} / {total} (bibliothèque déjà utilisable)', { done: s.scan.done, total: s.scan.total }) : t('Liste des fichiers du NAS…'))
      : `${t('{n} morceaux', { n: s.tracks })} · ${s.scannedAt ? t('analysé le {date}', { date: new Date(s.scannedAt).toLocaleString(window.I18N.locale, { dateStyle: 'short', timeStyle: 'short' }) }) : t('jamais analysé')}`;
    $('#scan-info').textContent = info;
    if (s.scan.running && !scanPoll) scanPoll = setInterval(refreshNas, 1500);
    if (s.scan.running && s.scan.phase === 'tags' && !listedOnce) { listedOnce = true; library.reload(); } // la liste est prête : on l'affiche sans attendre les tags
    if (!s.scan.running && scanPoll) { clearInterval(scanPoll); scanPoll = null; listedOnce = false; library.reload(); }
  }

  async function refreshNas() { try { renderNas(await api('GET', '/api/status')); } catch (e) { /* hors ligne */ } }

  function bindNas() {
    $('#nas-btn').addEventListener('click', async () => {
      try { renderNas(await api('POST', '/api/nas', { connected: !(nas && nas.connected) })); } catch (e) { toast(e.message, 'error'); }
    });
    $('#scan-btn').addEventListener('click', async () => {
      try { renderNas(await api('POST', '/api/library/rescan')); toast(t('Analyse du NAS lancée.')); } catch (e) { toast(e.message, 'error'); }
    });
    setInterval(refreshNas, 30000);
  }

  // ===========================================================================
  // BIBLIOTHÈQUE ET PLAYLISTS
  // ===========================================================================

  const library = {
    view: { type: 'all' },    // { type: 'all' } | { type: 'folder', path } | { type: 'playlist', id }
    rows: [],
    playlists: [],
    current: null,            // playlist affichée

    async reload() {
      await Promise.all([this.loadTree(), this.loadPlaylists()]);
      await this.show(this.view);
    },

    // ---------- arborescences repliables (dossiers du NAS, dossiers de playlists Traktor) ----------
    open: (() => { try { return new Set(JSON.parse(localStorage.getItem('fadarr-open') || '[]')); } catch (e) { return new Set(); } })(),
    saveOpen() { try { localStorage.setItem('fadarr-open', JSON.stringify([...this.open])); } catch (e) { /* rien */ } },

    /**
     * Dessine un arbre : nœud = { key, label, count, children: [], select?: () => void, drop?: (paths) => void }.
     * Clic sur la flèche : plier / déplier ; clic sur le nom : ouvrir (ou plier / déplier un simple dossier).
     */
    renderTree(box, roots) {
      box.innerHTML = '';
      const walk = (nodes, depth, parent) => {
        for (const n of nodes) {
          const hasKids = n.children && n.children.length > 0;
          const row = document.createElement('div');
          row.className = `node${n.select ? '' : ' fold'}`;
          row.dataset.key = n.key;
          row.style.paddingLeft = `${8 + depth * 13}px`;
          const isOpen = this.open.has(n.key);
          row.innerHTML = `<span class="caret${hasKids ? '' : ' none'}${isOpen ? ' open' : ''}">▸</span><span class="lbl">${esc(n.label)}</span>${n.count ? `<span class="cnt">${n.count}</span>` : ''}`;
          const kids = document.createElement('div');
          kids.className = 'kids';
          kids.hidden = !isOpen;
          const toggle = () => {
            const o = kids.hidden;
            kids.hidden = !o;
            $('.caret', row).classList.toggle('open', o);
            if (o) this.open.add(n.key); else this.open.delete(n.key);
            this.saveOpen();
          };
          $('.caret', row).addEventListener('click', (ev) => { if (hasKids) { ev.stopPropagation(); toggle(); } });
          row.addEventListener('click', () => { if (n.select) n.select(); else if (hasKids) toggle(); });
          if (n.drop) {
            row.addEventListener('dragover', (ev) => { if (ev.dataTransfer.types.includes('application/x-fadarr-track')) { ev.preventDefault(); row.classList.add('drop'); } });
            row.addEventListener('dragleave', () => row.classList.remove('drop'));
            row.addEventListener('drop', (ev) => {
              row.classList.remove('drop');
              const data = ev.dataTransfer.getData('application/x-fadarr-track');
              if (data) { ev.preventDefault(); n.drop([JSON.parse(data).path]); }
            });
          }
          if (n.draggable) { // playlist perso : déplaçable dans une catégorie
            row.draggable = true;
            row.addEventListener('dragstart', (ev) => { ev.stopPropagation(); ev.dataTransfer.setData('application/x-fadarr-playlist', n.draggable); ev.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); });
            row.addEventListener('dragend', () => row.classList.remove('dragging'));
          }
          if (n.plDrop) { // dossier / « + Catégorie » : accueille une playlist déposée
            row.addEventListener('dragover', (ev) => { if (ev.dataTransfer.types.includes('application/x-fadarr-playlist')) { ev.preventDefault(); ev.stopPropagation(); row.classList.add('drop'); } });
            row.addEventListener('dragleave', () => row.classList.remove('drop'));
            row.addEventListener('drop', (ev) => { const id = ev.dataTransfer.getData('application/x-fadarr-playlist'); if (id) { ev.preventDefault(); ev.stopPropagation(); row.classList.remove('drop'); n.plDrop(id); } });
          }
          if (n.menu) { // clic droit : menu contextuel façon Traktor
            row.addEventListener('contextmenu', (ev) => { ev.stopPropagation(); const items = typeof n.menu === 'function' ? n.menu() : n.menu; if (items && items.length) contextMenu(ev, items); });
          }
          parent.appendChild(row);
          if (hasKids) { parent.appendChild(kids); walk(n.children, depth + 1, kids); }
        }
      };
      walk(roots, 0, box);
    },

    /** Ouvre les dossiers parents du nœud choisi (pour qu'il soit visible). */
    revealSel(key) {
      const row = $(`.node[data-key="${CSS.escape(key)}"]`);
      let el = row && row.parentElement;
      while (el && el.classList.contains('kids')) {
        if (el.hidden) { el.hidden = false; const head = el.previousElementSibling; if (head) { $('.caret', head).classList.add('open'); this.open.add(head.dataset.key); } }
        el = el.parentElement;
      }
      this.saveOpen();
    },

    async loadTree() {
      const folders = await api('GET', '/api/library/folders');
      const byPath = new Map();
      const roots = [
        { key: 'all', label: t('Tout'), count: nas ? nas.tracks : 0, children: [], select: () => this.show({ type: 'all' }) },
        { key: 'recent', label: t('Ajouts récents (30 j)'), children: [], select: () => this.show({ type: 'recent' }) }
      ];
      for (const f of folders) {
        const node = { key: `folder:${f.path}`, label: f.path.split('/').pop(), count: f.count, children: [], select: () => this.show({ type: 'folder', path: f.path }) };
        byPath.set(f.path, node);
        const parent = byPath.get(f.path.split('/').slice(0, -1).join('/'));
        (parent ? parent.children : roots).push(node);
      }
      this.renderTree($('#tree'), roots);
      this.markSel();
    },

    async loadPlaylists() {
      this.playlists = await api('GET', '/api/playlists');
      const mine = this.playlists.filter((p) => p.source === 'fadarr');
      const trak = this.playlists.filter((p) => p.source === 'traktor');
      this.renderMinePlaylists(mine);
      // Sources importées (Traktor, Rekordbox) : « Racine / Dossier / Sous-dossier » -> dossiers imbriqués
      this.renderImported('#pl-traktor', trak, 'Traktor', 'tk', t('Importe ta collection.nml'));
      this.renderImported('#pl-rekordbox', this.playlists.filter((p) => p.source === 'rekordbox'), 'Rekordbox', 'rb', t('Importe un rekordbox.xml'));
      const sel = $('#target-pl');
      const keep = sel.value;
      sel.innerHTML = '<option value="">—</option>' + mine.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
      if (mine.some((p) => p.id === keep)) sel.value = keep;
      this.markSel();
    },

    /** Mes playlists en catégories : chaque playlist a un « folder » (nom de catégorie). Glisser une playlist la range. */
    renderMinePlaylists(mine) {
      const box = $('#pl-mine');
      this.bindMineRootDrop(box);
      if (!mine.length) { box.innerHTML = `<div class="node fold muted">${esc(t('Aucune playlist : ＋ pour en créer une'))}</div>`; return; }
      const roots = [];
      const folders = new Map();
      const folderNode = (name) => {
        const key = `mine:${name}`;
        if (folders.has(key)) return folders.get(key);
        const n = { key, label: name, children: [], plDrop: (id) => this.movePlaylist(id, name),
          menu: () => [
            { label: t('Nouvelle playlist ici'), fn: () => this.newPlaylistIn(name) },
            { label: t('Renommer la catégorie'), fn: () => this.renameCategory(name) },
            { sep: true },
            { label: t('Dissoudre la catégorie'), danger: true, fn: () => this.deleteCategory(name) }
          ] };
        folders.set(key, n); roots.push(n); return n;
      };
      const plMenu = (p) => [
        { label: t('Ouvrir'), fn: () => this.show({ type: 'playlist', id: p.id }) },
        { label: t('Renommer'), fn: () => this.renamePlaylist(p.id, p.name) },
        { label: t('Dupliquer'), fn: () => this.duplicatePlaylist(p.id) },
        { label: t('Nouvelle catégorie…'), fn: () => this.newCategory(p.id) },
        ...(String(p.folder || '').trim() ? [{ label: t('Sortir de la catégorie'), fn: () => this.movePlaylist(p.id, '') }] : []),
        { sep: true },
        { label: t('Supprimer'), danger: true, fn: () => this.deletePlaylist(p.id, p.name) }
      ];
      for (const p of mine) {
        const folder = String(p.folder || '').trim();
        const leaf = { key: `pl:${p.id}`, label: p.name, count: p.count, children: [], draggable: p.id, select: () => this.show({ type: 'playlist', id: p.id }), drop: (paths) => this.addTo(p.id, paths), menu: () => plMenu(p) };
        if (folder) folderNode(folder).children.push(leaf); else roots.push(leaf);
      }
      for (const f of folders.values()) f.count = f.children.length;
      roots.push({ key: 'mine:newcat', label: t('＋ Catégorie…'), children: [], newcat: true, plDrop: (id) => this.newCategory(id) });
      this.renderTree(box, roots);
    },

    /** Déposer une playlist sur le fond du panneau « Mes playlists » : la sort de sa catégorie. (Posé une seule fois.) */
    bindMineRootDrop(box) {
      if (box._rootDropBound) return; box._rootDropBound = true;
      box.addEventListener('dragover', (ev) => { if (ev.dataTransfer.types.includes('application/x-fadarr-playlist')) { ev.preventDefault(); box.classList.add('drop-root'); } });
      box.addEventListener('dragleave', (ev) => { if (ev.target === box) box.classList.remove('drop-root'); });
      box.addEventListener('drop', (ev) => { box.classList.remove('drop-root'); const id = ev.dataTransfer.getData('application/x-fadarr-playlist'); if (id) { ev.preventDefault(); this.movePlaylist(id, ''); } });
    },

    /** Range une playlist dans une catégorie (folder) ou l'en sort (folder vide). */
    async movePlaylist(id, folder) {
      const p = this.playlists.find((x) => x.id === id);
      if (!p || p.source !== 'fadarr' || (p.folder || '') === folder) return;
      try { await api('PUT', `/api/playlists/${id}`, { folder }); await this.loadPlaylists(); toast(folder ? t('Rangée dans « {name} »', { name: folder }) : t('Sortie de sa catégorie')); }
      catch (e) { toast(e.message, 'error'); }
    },

    async newCategory(id) {
      const name = prompt(t('Nom de la nouvelle catégorie :'));
      if (name && name.trim()) this.movePlaylist(id, name.trim());
    },

    /** Crée une playlist (optionnellement dans une catégorie). */
    async newPlaylistIn(folder) {
      const name = prompt(t('Nom de la playlist :'));
      if (!name || !name.trim()) return;
      try { const p = await api('POST', '/api/playlists', { name: name.trim(), folder: folder || '' }); await this.loadPlaylists(); this.show({ type: 'playlist', id: p.id }); }
      catch (e) { toast(e.message, 'error'); }
    },

    async renamePlaylist(id, current) {
      const name = prompt(t('Nouveau nom :'), current); if (!name || !name.trim()) return;
      try { await api('PUT', `/api/playlists/${id}`, { name: name.trim() }); await this.loadPlaylists(); if (this.view.type === 'playlist' && this.view.id === id) this.show(this.view); }
      catch (e) { toast(e.message, 'error'); }
    },

    async duplicatePlaylist(id) {
      try { const c = await api('POST', `/api/playlists/${id}/duplicate`, {}); await this.loadPlaylists(); this.show({ type: 'playlist', id: c.id }); toast(t('Copie créée : {name}', { name: c.name })); }
      catch (e) { toast(e.message, 'error'); }
    },

    async deletePlaylist(id, name) {
      if (!confirm(t('Supprimer la playlist « {name} » ? (les morceaux ne sont pas touchés)', { name }))) return;
      try { await api('DELETE', `/api/playlists/${id}`); await this.loadPlaylists(); if (this.view.type === 'playlist' && this.view.id === id) this.show({ type: 'all' }); }
      catch (e) { toast(e.message, 'error'); }
    },

    async renameCategory(name) {
      const to = prompt(t('Nouveau nom de la catégorie :'), name); if (to === null) return;
      try { await api('PUT', '/api/playlists-folder', { from: name, to: to.trim() }); await this.loadPlaylists(); }
      catch (e) { toast(e.message, 'error'); }
    },

    async deleteCategory(name) {
      if (!confirm(t('Dissoudre la catégorie « {name} » ? Les playlists qu’elle contient reviennent à la racine (elles ne sont pas supprimées).', { name }))) return;
      try { const r = await api('PUT', '/api/playlists-folder', { from: name, to: '' }); await this.loadPlaylists(); toast(t('Catégorie dissoute ({n} playlist(s)).', { n: r.moved })); }
      catch (e) { toast(e.message, 'error'); }
    },

    /** Arbre de playlists d'une source importée (lecture seule), dossiers imbriqués d'après le champ « folder ». */
    renderImported(boxId, lists, rootFolder, keyPrefix, emptyMsg) {
      const box = $(boxId);
      if (!lists.length) { box.innerHTML = `<div class="node fold muted">${esc(emptyMsg)}</div>`; return; }
      const leaf = (p) => ({
        key: `pl:${p.id}`, label: p.name, count: p.count, children: [], select: () => this.show({ type: 'playlist', id: p.id }),
        menu: () => [{ label: t('Copier dans mes playlists'), fn: () => this.duplicatePlaylist(p.id) }]
      });
      const roots = [];
      const folders = new Map();
      const folderNode = (parts) => {
        const key = `${keyPrefix}:${parts.join('/')}`;
        if (folders.has(key)) return folders.get(key);
        const label = parts[parts.length - 1];
        // déposer une de MES playlists sur un dossier Traktor/Rekordbox la range dans une catégorie du même nom (visible aussi dans Traktor après export)
        const n = { key, label, children: [], plDrop: (id) => this.movePlaylist(id, label) };
        folders.set(key, n);
        (parts.length > 1 ? folderNode(parts.slice(0, -1)).children : roots).push(n);
        return n;
      };
      for (const p of lists) {
        const parts = String(p.folder || '').split(' / ').map((x) => x.trim()).filter(Boolean).filter((x, i) => !(i === 0 && x === rootFolder));
        (parts.length ? folderNode(parts).children : roots).push(leaf(p));
      }
      for (const f of folders.values()) f.count = f.children.length;
      this.renderTree(box, roots);
    },

    markSel() {
      const key = this.view.type === 'all' ? 'all' : this.view.type === 'recent' ? 'recent' : this.view.type === 'folder' ? `folder:${this.view.path}` : `pl:${this.view.id}`;
      $$('.node[data-key]').forEach((n) => n.classList.toggle('sel', n.dataset.key === key));
      this.revealSel(key);
    },

    async show(view) {
      this.view = view;
      this.markSel();
      const q = $('#search').value.trim();
      const actions = $('#list-actions');
      actions.innerHTML = '';
      this.current = null;
      if (view.type === 'playlist') {
        const p = await api('GET', `/api/playlists/${view.id}`);
        this.current = p;
        $('#list-title').textContent = p.source === 'fadarr' ? p.name : t('{src} · {name}', { src: p.source === 'rekordbox' ? 'Rekordbox' : 'Traktor', name: p.name });
        const words = q.toLowerCase().split(/\s+/).filter(Boolean);
        this.rows = p.items.map((it, i) => ({ ...it, index: i })).filter((it) => !words.length || words.every((w) => `${it.artist} ${it.title} ${it.path}`.toLowerCase().includes(w)));
        if (p.source !== 'fadarr') {
          actions.appendChild(button(t('Copier dans mes playlists'), async () => {
            const c = await api('POST', `/api/playlists/${p.id}/duplicate`, {});
            toast(t('Copie créée : {name}', { name: c.name })); await this.loadPlaylists(); this.show({ type: 'playlist', id: c.id });
          }));
        } else {
          actions.appendChild(button(t('Renommer'), async () => {
            const name = prompt(t('Nouveau nom :'), p.name); if (!name) return;
            await api('PUT', `/api/playlists/${p.id}`, { name }); await this.loadPlaylists(); this.show(this.view);
          }));
          actions.appendChild(button(t('Supprimer'), async () => {
            if (!confirm(t('Supprimer la playlist « {name} » ? (les morceaux ne sont pas touchés)', { name: p.name }))) return;
            await api('DELETE', `/api/playlists/${p.id}`); await this.loadPlaylists(); this.show({ type: 'all' });
          }));
        }
      } else {
        $('#list-title').textContent = view.type === 'folder' ? view.path : view.type === 'recent' ? t('Ajouts récents (30 jours)') : t('Toute la bibliothèque');
        const params = new URLSearchParams({ q });
        if (view.type === 'folder') params.set('folder', view.path);
        if (view.type === 'recent') params.set('recent', '30');
        this.rows = await api('GET', `/api/library?${params}`);
      }
      const wrap = $('.table-wrap'); if (wrap) wrap.scrollTop = 0; // nouvelle vue : on repart du haut
      this.renderRows();
    },

    sort: { col: 'default', dir: 1 },
    bpmRange: { min: null, max: null },
    addedRange: { days: 0 },

    /** Lignes affichées : filtres (BPM, date d'ajout) puis tri choisi (en-têtes de colonnes). */
    visibleRows() {
      const { min, max } = this.bpmRange;
      let rows = this.rows.map((t, i) => (t.index === undefined ? { ...t, index: i } : t));
      if (min || max) rows = rows.filter((t) => t.bpm && (!min || t.bpm >= min) && (!max || t.bpm <= max));
      if (this.addedRange.days) { const since = Date.now() - this.addedRange.days * 86400000; rows = rows.filter((t) => t.added && t.added >= since); }
      const { col, dir } = this.sort;
      if (col !== 'default') {
        const val = (t) => {
          if (col === 'key') return keySortValue(t.key);
          if (col === 'added') return Number(t.added) || 0;
          if (col === 'rating') return Number(t.rating) || 0;
          if (col === 'index' || col === 'bpm' || col === 'duration' || col === 'cueCount') return Number(t[col]) || (col === 'index' ? 0 : -1);
          return String(t[col] || '').toLowerCase();
        };
        const missing = (v) => v === -1 || v === 99 || v === '';
        rows.sort((a, b) => {
          const x = val(a); const y = val(b);
          if (missing(x) !== missing(y)) return missing(x) ? 1 : -1; // sans BPM / tonalité : toujours en bas
          return (x < y ? -1 : x > y ? 1 : 0) * dir;
        });
      }
      return rows;
    },

    renderSortMarks() {
      $$('#tracks th[data-sort]').forEach((th) => {
        th.classList.toggle('sorted', th.dataset.sort === this.sort.col);
        th.dataset.dir = th.dataset.sort === this.sort.col ? (this.sort.dir > 0 ? '▲' : '▼') : '';
      });
      $('#key-head').textContent = t({ musical: 'Ton.', camelot: 'Camelot', open: 'Open Key' }[keyMode]);
    },

    // ---------- liste virtualisée : seules les lignes visibles sont dans le DOM (fluide même avec des milliers de morceaux) ----------
    _rowH: 28,

    /** HTML d'une ligne. `num` = numéro affiché (1-based). */
    rowHtml(t, num) {
      const ref = refDeck && refDeck.track && refDeck.track.path !== t.path ? refDeck : null;
      const kc = ref ? keyCompat(t.key, ref.track.key) : 0;
      const bc = ref ? bpmCompat(t.bpm, ref.bpm ? ref.bpm * ref.rate : null) : 0;
      const cls = [t.missing ? 'missing' : '', kc && bc ? 'match' : '',
        (refDeck && refDeck.track && refDeck.track.path === t.path) ? `loaded-${refDeck.id.toLowerCase()}` : ''].filter(Boolean).join(' ');
      const keyStyle = t.key && !kc ? ` style="color:${keyColor(t.key)}"` : '';
      return `<td class="n"><span class="cdot" data-cdot="1"${t.color ? ` style="background:${t.color}"` : ''} title="${window.I18N.t('Clic : couleur')}"></span>${num}</td><td>${esc(t.artist)}</td><td title="${esc(t.path)}">${esc(t.title)}</td>`
        + `<td class="r bpm${bc ? ` c${bc}` : ''}">${t.bpm ? Number(t.bpm).toFixed(2) : '<span class="muted">—</span>'}</td><td class="key${kc ? ` c${kc}` : ''}"${keyStyle} title="${esc(t.key || '')}">${esc(showKey(t.key))}</td><td class="r">${t.duration ? fmt(t.duration) : ''}</td>`
        + `<td class="muted">${esc(t.format || '')}${t.bitrate && !/WAV|AIFF|FLAC/i.test(t.format) ? ` ${t.bitrate}` : ''}</td><td class="r">${t.cueCount || ''}</td>`
        + `<td class="rate">${ratingStars(t.rating)}</td>`
        + `<td class="r muted small" title="${t.added ? new Date(t.added).toLocaleString(window.I18N.locale) : ''}">${shortDate(t.added)}</td>`
        + `<td class="act">${t.missing ? `<span class="muted small">${window.I18N.t('absent du NAS')}</span>` : `<button type="button" class="pv${preview.path === t.path ? ' on' : ''}" data-pv="1" title="${window.I18N.t('Pré-écoute (sans charger de deck)')}">${preview.path === t.path ? '■' : '▶'}</button><button type="button" class="ld a" data-l="A">A</button><button type="button" class="ld b" data-l="B">B</button>`}`
        + `${this._editable ? `<button type="button" class="mini" data-x="1" title="${window.I18N.t('Retirer de la playlist')}">×</button>` : `<button type="button" class="mini" data-add="1" title="${window.I18N.t('Ajouter à la playlist choisie (« Ajouter à »)')}">＋</button>`}</td>`
        + `<td class="vcls" hidden>${cls}</td>`;
    },

    renderRows() {
      this.renderSortMarks();
      this._editable = this.current && this.current.source === 'fadarr';
      this._vrows = this.visibleRows();
      $('#empty').textContent = this._vrows.length ? '' : t(this.rows.length ? 'Aucun morceau dans cette plage de BPM.' : (this.view.type === 'playlist' ? 'Playlist vide : glisse des morceaux dessus depuis la bibliothèque.' : (nas && nas.tracks ? 'Aucun morceau ne correspond.' : 'Bibliothèque vide : clique sur « Analyser le NAS ».')));
      this.paintWindow();
    },

    /** Ne peuple le tableau qu'autour de la zone visible, avec deux cales (haut / bas) pour garder la bonne hauteur de scroll. */
    paintWindow() {
      const body = $('#tracks tbody');
      const wrap = $('.table-wrap');
      const rows = this._vrows || [];
      const n = rows.length;
      const h = this._rowH;
      const vh = wrap.clientHeight || 500;
      const first = Math.max(0, Math.floor(wrap.scrollTop / h) - 8);
      const count = Math.ceil(vh / h) + 16;
      const last = Math.min(n, first + count);
      const top = first * h;
      const bottom = Math.max(0, (n - last) * h);
      let html = top ? `<tr class="vspacer" style="height:${top}px"><td colspan="11"></td></tr>` : '';
      for (let i = first; i < last; i++) {
        const tr = rows[i];
        const num = (this.current ? tr.index : i) + 1;
        const tint = /^#[0-9a-f]{6}$/i.test(tr.color || '') ? ` style="--rowc:${tr.color}"` : '';
        html += `<tr data-path="${esc(tr.path)}" data-vi="${i}"${tr.missing ? '' : ' draggable="true"'}${tint}>${this.rowHtml(tr, num)}</tr>`;
      }
      if (bottom) html += `<tr class="vspacer" style="height:${bottom}px"><td colspan="11"></td></tr>`;
      body.innerHTML = html;
      // reporte les classes (match / loaded / missing) calculées dans rowHtml
      $$('#tracks tbody tr[data-vi]').forEach((tr) => { const c = $('.vcls', tr); if (c) { if (c.textContent) tr.className = c.textContent; c.remove(); } });
      if (!this._rowMeasured) { const r = $('#tracks tbody tr[data-vi]'); if (r && r.offsetHeight) { this._rowH = r.offsetHeight; this._rowMeasured = true; } }
    },

    /** Écouteurs posés une seule fois (délégation) : clics, glisser-déposer, scroll virtuel. */
    initList() {
      const wrap = $('.table-wrap');
      const body = $('#tracks tbody');
      let raf = null;
      wrap.addEventListener('scroll', () => { if (raf) return; raf = requestAnimationFrame(() => { raf = null; this.paintWindow(); }); });
      window.addEventListener('resize', () => this.paintWindow());
      const rowOf = (el) => { const tr = el.closest && el.closest('tr[data-vi]'); return tr ? this._vrows[Number(tr.dataset.vi)] : null; };
      body.addEventListener('click', (ev) => {
        const t = rowOf(ev.target); if (!t) return;
        const star = ev.target.closest('[data-rate]');
        if (star) { const n = Number(star.dataset.rate); const cur = Math.round((t.rating || 0) / 51); this.setRating(t, (n === cur ? 0 : n) * 51); return; }
        if (ev.target.closest('[data-cdot]') && !t.missing) { this.openColorMenu(ev, t); return; }
        const l = ev.target.closest('[data-l]'); if (l) { decks[l.dataset.l].load(t); return; }
        if (ev.target.closest('[data-pv]')) { preview.toggle(t); return; }
        if (ev.target.closest('[data-x]')) { const tracks = this.current.tracks.slice(); tracks.splice(t.index, 1); this.savePlaylist(tracks); return; }
        if (ev.target.closest('[data-add]')) {
          const id = $('#target-pl').value;
          if (!id) { toast(window.I18N.t("Choisis d'abord une playlist dans « Ajouter à » (ou glisse le morceau sur une playlist à gauche).")); return; }
          this.addTo(id, [t.path]);
        }
      });
      body.addEventListener('dblclick', (ev) => { const t = rowOf(ev.target); if (t && !t.missing) (decks.A.track && !decks.B.track ? decks.B : decks.A.playing && !decks.B.playing ? decks.B : decks.A).load(t); });
      // clic droit sur un morceau : couleur (façon Traktor) + note + charger un deck
      body.addEventListener('contextmenu', (ev) => {
        const tr = rowOf(ev.target); if (!tr || tr.missing) return;
        contextMenu(ev, [
          ...this.colorItems(tr),
          { sep: true },
          { label: t('Charger dans A'), fn: () => decks.A.load(tr) },
          { label: t('Charger dans B'), fn: () => decks.B.load(tr) }
        ]);
      });
      body.addEventListener('dragstart', (ev) => {
        const tr = ev.target.closest && ev.target.closest('tr[data-vi]'); const t = tr && this._vrows[Number(tr.dataset.vi)]; if (!t) return;
        ev.dataTransfer.setData('application/x-fadarr-track', JSON.stringify(t));
        ev.dataTransfer.setData('application/x-fadarr-index', String(t.index));
        ev.dataTransfer.effectAllowed = 'copyMove'; tr.classList.add('dragging');
      });
      body.addEventListener('dragend', (ev) => { const tr = ev.target.closest && ev.target.closest('tr'); if (tr) tr.classList.remove('dragging'); });
      const reorderable = () => this._editable && !$('#search').value.trim() && (this.sort.col === 'default' || (this.sort.col === 'index' && this.sort.dir > 0)) && !this.bpmRange.min && !this.bpmRange.max;
      body.addEventListener('dragover', (ev) => { if (!reorderable()) return; const tr = ev.target.closest && ev.target.closest('tr[data-vi]'); if (tr && ev.dataTransfer.types.includes('application/x-fadarr-index')) { ev.preventDefault(); $$('#tracks tbody tr.drop-above').forEach((r) => r.classList.remove('drop-above')); tr.classList.add('drop-above'); } });
      body.addEventListener('dragleave', (ev) => { const tr = ev.target.closest && ev.target.closest('tr'); if (tr) tr.classList.remove('drop-above'); });
      body.addEventListener('drop', (ev) => {
        if (!reorderable()) return;
        const tr = ev.target.closest && ev.target.closest('tr[data-vi]'); if (!tr) return;
        tr.classList.remove('drop-above');
        const t = this._vrows[Number(tr.dataset.vi)];
        const from = Number(ev.dataTransfer.getData('application/x-fadarr-index'));
        const to = t.index;
        if (!Number.isInteger(from) || from === to) return;
        ev.preventDefault();
        const tracks = this.current.tracks.slice();
        const [moved] = tracks.splice(from, 1);
        tracks.splice(from < to ? to - 1 : to, 0, moved);
        this.savePlaylist(tracks);
      });
    },

    async savePlaylist(tracks) {
      try { await api('PUT', `/api/playlists/${this.current.id}`, { tracks }); await this.loadPlaylists(); await this.show(this.view); } catch (e) { toast(e.message, 'error'); }
    },

    /** Pose la note (0-255) d'un morceau et rafraîchit la ligne + les decks. */
    async setRating(tr, rating) {
      tr.rating = rating;
      this.paintWindow();
      for (const d of Object.values(decks)) if (d.track && d.track.path === tr.path) { d.track.rating = rating; }
      try { await api('PUT', '/api/track/meta', { path: tr.path, rating }); } catch (e) { toast(e.message, 'error'); }
    },

    /** Pose (ou enlève) la couleur d'un morceau façon Traktor. */
    async setColor(tr, color) {
      tr.color = color;
      this.paintWindow();
      for (const d of Object.values(decks)) if (d.track && d.track.path === tr.path) { d.track.color = color; }
      try { await api('PUT', '/api/track/meta', { path: tr.path, color }); } catch (e) { toast(e.message, 'error'); }
    },

    /** Entrées de menu « couleur » (7 teintes Traktor + aucune), réutilisées par le point couleur et le clic droit. */
    colorItems(tr) {
      const sw = (hex, label) => `<span class="sw" style="background:${hex}"></span>${label}`;
      return [
        ...Object.keys(TRAKTOR_COLORS).map((k) => ({ label: sw(TRAKTOR_COLORS[k], t(COLOR_NAMES[k])), html: true, fn: () => this.setColor(tr, TRAKTOR_COLORS[k]) })),
        { label: t('Aucune couleur'), fn: () => this.setColor(tr, '') }
      ];
    },

    /** Petit sélecteur de couleur au clic sur le point couleur. */
    openColorMenu(ev, tr) { contextMenu(ev, this.colorItems(tr)); },

    async addTo(id, paths) {
      try {
        const p = await api('GET', `/api/playlists/${id}`);
        const tracks = p.tracks.concat(paths.filter((x) => !p.tracks.includes(x)));
        await api('PUT', `/api/playlists/${id}`, { tracks });
        toast(t('Ajouté à « {name} »', { name: p.name }));
        await this.loadPlaylists();
        if (this.view.type === 'playlist' && this.view.id === id) await this.show(this.view);
      } catch (e) { toast(e.message, 'error'); }
    },

    updateCount(path, n) {
      const row = this.rows.find((r) => r.path === path); if (row) row.cueCount = n;
      const vr = (this._vrows || []).find((r) => r.path === path); if (vr) vr.cueCount = n;
      const tr = $(`#tracks tr[data-path="${CSS.escape(path)}"] td:nth-child(8)`); if (tr) tr.textContent = n || '';
    },

    updateBpm(path, bpm) {
      const row = this.rows.find((r) => r.path === path); if (row) row.bpm = bpm;
      const vr = (this._vrows || []).find((r) => r.path === path); if (vr) vr.bpm = bpm;
    }
  };

  // ===========================================================================
  // PRÉ-ÉCOUTE (dans la liste, sans passer par les decks ni le mixeur)
  // ===========================================================================
  const preview = {
    el: null, path: null,
    toggle(t) {
      if (this.path === t.path) { this.stop(); return; }
      this.stop();
      if (!this.el) { this.el = new Audio(); this.el.preload = 'auto'; this.el.addEventListener('ended', () => this.stop()); }
      this.path = t.path;
      this.el.src = `/api/audio?path=${encodeURIComponent(t.path)}`;
      this.el.volume = 0.85;
      const seekable = !/\.aiff?$/i.test(t.path); // l'AIFF est converti à la volée : pas de saut possible
      this.el.onloadedmetadata = () => { if (seekable && Number.isFinite(this.el.duration)) this.el.currentTime = this.el.duration * 0.33; };
      this.el.play().catch((e) => { toast(window.I18N.t('Pré-écoute impossible : {msg}', { msg: e.message }), 'error'); this.stop(); });
      library.renderRows();
    },
    stop() {
      if (this.el) { this.el.pause(); this.el.removeAttribute('src'); this.el.load(); }
      const had = this.path; this.path = null;
      if (had) library.renderRows();
    }
  };

  function button(label, fn) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn'; b.textContent = label;
    b.addEventListener('click', () => Promise.resolve(fn()).catch((e) => toast(e.message, 'error')));
    return b;
  }

  // ===========================================================================
  // FENÊTRES : réglages, import Traktor, export Rekordbox
  // ===========================================================================

  function modal(html, onReady) {
    const dlg = $('#modal');
    $('#modal-body').innerHTML = html;
    if (onReady) onReady($('#modal-body'));
    dlg.showModal();
    return dlg;
  }

  async function openSettings() {
    const s = await api('GET', '/api/settings');
    modal(`<h2>${t('Réglages')}</h2>
      <label>${t('Chemin du dossier musique sur ton Mac (pour Rekordbox)')}
        <input type="text" id="s-mac" value="${esc(s.macPrefix)}" placeholder="/Volumes/music/Electronic" spellcheck="false">
        <span class="small muted">${t("Le dossier qui correspond au dossier musique du NAS quand il est monté sur le Mac (Finder > Aller > Se connecter au serveur), ou ton SSD s'il a la même arborescence. Les morceaux du rekordbox.xml pointeront là.")}</span>
      </label>
      <label>${t('Décalage des cues pour les MP3 (ms)')}
        <input type="number" id="s-off" value="${Number(s.mp3OffsetMs) || 0}" step="1" min="-500" max="500">
        <span class="small muted">${t("Traktor et Rekordbox ne comptent pas le début d'un MP3 tout à fait pareil. Laisse 0 tant qu'on n'a pas calibré sur tes morceaux. Les WAV et AIFF ne sont pas concernés.")}</span>
      </label>
      <label>${t('Langue')}
        <select id="s-lang">${Object.entries(window.I18N.LANGS).map(([k, v]) => `<option value="${k}"${k === window.I18N.lang ? ' selected' : ''}>${v}</option>`).join('')}</select>
      </label>
      <div class="row"><button class="btn" value="cancel">${t('Annuler')}</button><button class="btn accent" id="s-save" value="ok">${t('Enregistrer')}</button></div>`, (root) => {
      $('#s-save', root).addEventListener('click', async (ev) => {
        ev.preventDefault();
        try { await api('PUT', '/api/settings', { macPrefix: $('#s-mac', root).value, mp3OffsetMs: Number($('#s-off', root).value) }); $('#modal').close(); toast(t('Réglages enregistrés.')); if ($('#s-lang', root).value !== window.I18N.lang) window.I18N.setLang($('#s-lang', root).value); } catch (e) { toast(e.message, 'error'); }
      });
    });
  }

  async function importTraktor(file) {
    if (!file) return;
    toast(t('Import de {file}…', { file: file.name }));
    try {
      const text = await file.text();
      const res = await fetch('/api/import/traktor', { method: 'POST', headers: { 'Content-Type': 'text/xml', 'X-Lang': window.I18N.lang }, body: text });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error || t('Erreur {status}', { status: res.status }));
      modal(`<h2>${t('Import Traktor terminé')}</h2>
        <p>${t('{matched} morceaux sur {entries} retrouvés sur le NAS', { matched: `<b>${r.matched}</b>`, entries: r.entries })} · ${t('{n} playlists ({entries} entrées)', { n: `<b>${r.playlists}</b>`, entries: r.playlistTracks })}${r.playlistMissing ? `, ${t('{n} absentes du NAS', { n: r.playlistMissing })}` : ''} · ${t('{n} cues et loops importés', { n: `<b>${r.cuesImported}</b>` })}${r.keptEdited ? ` · ${t('{n} morceaux gardés tels que modifiés dans fadarr', { n: r.keptEdited })}` : ''}.</p>
        ${r.unmatchedCount ? `<p class="muted">${t('{n} morceaux de la collection Traktor introuvables sur le NAS', { n: r.unmatchedCount })}${r.unmatchedCount > r.unmatched.length ? ` ${t('({n} premiers)', { n: r.unmatched.length })}` : ''} :</p><ul>${r.unmatched.map((u) => `<li>${esc(u.artist ? `${u.artist} - ${u.title}` : u.file)}</li>`).join('')}</ul>` : `<p>${t('Tous les morceaux ont été retrouvés.')}</p>`}
        <div class="row"><button class="btn accent" value="ok">OK</button></div>`);
      await library.reload();
    } catch (e) { toast(t('Import impossible : {msg}', { msg: e.message }), 'error'); }
    $('#nml-input').value = '';
  }

  async function importRekordbox(file) {
    if (!file) return;
    toast(t('Import de {file}…', { file: file.name }));
    try {
      const text = await file.text();
      const res = await fetch('/api/import/rekordbox', { method: 'POST', headers: { 'Content-Type': 'text/xml', 'X-Lang': window.I18N.lang }, body: text });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error || t('Erreur {status}', { status: res.status }));
      modal(`<h2>${t('Import Rekordbox terminé')}</h2>
        <p>${t('{matched} morceaux sur {entries} retrouvés sur le NAS', { matched: `<b>${r.matched}</b>`, entries: r.entries })} · ${t('{n} playlists ({entries} entrées)', { n: `<b>${r.playlists}</b>`, entries: r.playlistTracks })}${r.playlistMissing ? `, ${t('{n} absentes du NAS', { n: r.playlistMissing })}` : ''} · ${t('{n} cues et loops importés', { n: `<b>${r.cuesImported}</b>` })}${r.keptEdited ? ` · ${t('{n} morceaux gardés tels que modifiés dans fadarr', { n: r.keptEdited })}` : ''}.</p>
        ${r.unmatchedCount ? `<p class="muted">${t('{n} morceaux de la collection Rekordbox introuvables sur le NAS', { n: r.unmatchedCount })}${r.unmatchedCount > r.unmatched.length ? ` ${t('({n} premiers)', { n: r.unmatched.length })}` : ''} :</p><ul>${r.unmatched.map((u) => `<li>${esc(u.artist ? `${u.artist} - ${u.title}` : u.file)}</li>`).join('')}</ul>` : `<p>${t('Tous les morceaux ont été retrouvés.')}</p>`}
        <div class="row"><button class="btn accent" value="ok">OK</button></div>`);
      await library.reload();
    } catch (e) { toast(t('Import impossible : {msg}', { msg: e.message }), 'error'); }
    $('#rbxml-input').value = '';
  }

  async function openExport() {
    const s = await api('GET', '/api/settings');
    const lists = library.playlists;
    if (!lists.length) { toast(t('Aucune playlist à exporter.')); return; }
    const cur = library.view.type === 'playlist' ? library.view.id : null;
    const srcName = (p) => p.source === 'fadarr' ? p.name : `${p.source === 'rekordbox' ? 'Rekordbox' : 'Traktor'} · ${p.name}`;
    modal(`<h2>${t('Exporter')}</h2>
      <div class="small muted">${t('Format :')}</div>
      <div class="exp-fmt">
        <label><input type="radio" name="e-fmt" value="xml" checked> ${t('Rekordbox XML (platines via Rekordbox)')}</label>
        <label><input type="radio" name="e-fmt" value="nml"> ${t('Traktor (collection.nml, ré-importable)')}</label>
        <label class="muted" title="${t('Bientôt : écriture directe de la clé USB, sans passer par Rekordbox.')}"><input type="radio" name="e-fmt" value="usb" disabled> ${t('Clé USB directe pour CDJ (bientôt)')}</label>
      </div>
      <div id="e-rb">
        <label>${t('Chemin du dossier musique sur ton Mac')}
          <input type="text" id="e-mac" value="${esc(s.macPrefix)}" placeholder="/Volumes/music/Electronic" spellcheck="false">
        </label>
        <div class="small muted">${t('Playlists à exporter :')}</div>
        <div class="checks">${lists.map((p) => `<label><input type="checkbox" value="${esc(p.id)}" ${p.id === cur || (!cur && p.source === 'fadarr') ? 'checked' : ''}> ${esc(srcName(p))} <span class="muted small">(${p.count})</span></label>`).join('')}</div>
        <div class="small muted">${t("Dans Rekordbox : Préférences > Avancé > Base de données > « rekordbox xml » : choisis le fichier téléchargé. Puis dans l'arborescence, « rekordbox xml » > clic droit sur la playlist > Importer la playlist. Les cues et loops suivent.")}</div>
      </div>
      <div id="e-nml" hidden>
        <div class="small muted">${t('Toutes tes playlists fadarr (avec leurs catégories) sont réécrites dans un collection.nml. Tes couleurs, notes, BPM, grille et cues repartent avec. Les morceaux venus de Traktor retrouvent leur place ; ceux ajoutés seulement dans fadarr sont ignorés (pas d’emplacement Mac).')}</div>
        <div class="small muted">${t('Dans Traktor : clic droit sur « Playlists » > « Import… » > choisis le collection.nml. ⚠️ Ne remplace jamais ton collection.nml d’origine par celui-ci.')}</div>
      </div>
      <div class="row"><button class="btn" value="cancel">${t('Annuler')}</button><button class="btn accent" id="e-go">${t('Télécharger rekordbox.xml')}</button></div>`, (root) => {
      const syncFmt = () => {
        const fmt = ($('input[name="e-fmt"]:checked', root) || {}).value || 'xml';
        $('#e-rb', root).hidden = fmt !== 'xml';
        $('#e-nml', root).hidden = fmt !== 'nml';
        $('#e-go', root).textContent = fmt === 'nml' ? t('Télécharger collection.nml') : t('Télécharger rekordbox.xml');
      };
      $$('input[name="e-fmt"]', root).forEach((r) => r.addEventListener('change', syncFmt));
      syncFmt();
      $('#e-go', root).addEventListener('click', async (ev) => {
        ev.preventDefault();
        if (($('input[name="e-fmt"]:checked', root) || {}).value === 'nml') { exportTraktor().catch((e) => toast(e.message, 'error')); return; }
        try {
          const mac = $('#e-mac', root).value.trim();
          if (mac !== s.macPrefix) await api('PUT', '/api/settings', { macPrefix: mac });
          const ids = $$('.checks input:checked', root).map((i) => i.value);
          if (!ids.length) throw new Error(t('Coche au moins une playlist.'));
          const res = await fetch('/api/export/rekordbox', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lang': window.I18N.lang }, body: JSON.stringify({ ids }) });
          if (!res.ok) throw new Error((await res.json()).error || `Erreur ${res.status}`);
          const blob = await res.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = 'rekordbox.xml'; a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
          $('#modal').close();
          const n = Number(res.headers.get('X-Mixarr-Tracks')) || 0;
          const missing = Number(res.headers.get('X-Mixarr-Missing')) || 0;
          const noBpm = Number(res.headers.get('X-Mixarr-Nobpm')) || 0;
          const noGrid = Number(res.headers.get('X-Mixarr-Nogrid')) || 0;
          const cues = Number(res.headers.get('X-Mixarr-Cues')) || 0;
          const warn = [];
          if (noBpm) warn.push(`<li class="bad">${t('{n} morceaux sans BPM : les CDJ ne poseront ni grille ni SYNC dessus. Charge-les dans fadarr et clique sur le BPM pour le poser.', { n: noBpm })}</li>`);
          if (noGrid) warn.push(`<li>${t("{n} morceaux ont un BPM mais pas de grille précise : la grille est posée au premier temps connu. Vérifie-les dans Rekordbox (double-clic sur la grille pour recaler si besoin).", { n: noGrid })}</li>`);
          if (missing) warn.push(`<li>${t('{n} morceaux absents du NAS ont été ignorés.', { n: missing })}</li>`);
          modal(`<h2>${t('rekordbox.xml téléchargé')}</h2>
            <p>${t('{n} morceaux exportés — {g} avec grille de tempo, {c} avec cues/loops.', { n: `<b>${n}</b>`, g: n - noBpm, c: cues })}</p>
            ${warn.length ? `<ul class="report">${warn.join('')}</ul>` : `<p class="ok-line">${t('Tous les morceaux ont un BPM et une grille. ✔')}</p>`}
            <div class="small muted">${t('Pour être sûr que ça passe sur les platines : 1) Rekordbox > Préférences > Avancé > rekordbox xml : choisis ce fichier ; 2) clic droit sur la playlist > Importer ; 3) vérifie que grille et cues apparaissent sur le morceau ; 4) branche ta clé USB, Rekordbox > Exporter vers le périphérique ; 5) relis la clé sur une CDJ (ou en mode Export). Garde le même rekordbox.xml et remplace-le à chaque export.')}</div>
            <div class="row"><button class="btn accent" value="ok">OK</button></div>`);
        } catch (e) { toast(e.message, 'error'); }
      });
    });
  }

  /** Export Traktor : génère et télécharge un collection.nml ré-importable. */
  async function exportTraktor() {
    const res = await fetch('/api/export/traktor', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lang': window.I18N.lang }, body: '{}' });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erreur ${res.status}`);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'collection.nml'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    const dlg = $('#modal'); if (dlg && dlg.open) dlg.close();
    const pl = Number(res.headers.get('X-Fadarr-Playlists')) || 0;
    const n = Number(res.headers.get('X-Fadarr-Tracks')) || 0;
    const skipped = Number(res.headers.get('X-Fadarr-Skipped')) || 0;
    modal(`<h2>${t('collection.nml téléchargé')}</h2>
      <p>${t('{p} playlist(s), {n} morceau(x) réécrits pour Traktor.', { p: `<b>${pl}</b>`, n: `<b>${n}</b>` })}</p>
      ${skipped ? `<ul class="report"><li>${t('{n} morceaux ajoutés seulement dans fadarr ont été ignorés (Traktor ne connaît pas leur emplacement sur ton Mac).', { n: skipped })}</li></ul>` : `<p class="ok-line">${t('Tous les morceaux ont pu être réécrits. ✔')}</p>`}
      <div class="small muted">${t('Dans Traktor : clic droit sur « Playlists » (panneau de gauche) > « Import… » > choisis ce collection.nml. Tes catégories deviennent des dossiers Traktor. ⚠️ C’est un ajout : ne remplace pas ton collection.nml d’origine par ce fichier.')}</div>
      <div class="row"><button class="btn accent" value="ok">OK</button></div>`);
  }

  // ===========================================================================
  // DÉMARRAGE
  // ===========================================================================

  const decks = { A: new Deck('A'), B: new Deck('B') };
  window.I18N.apply(document.body); // textes fixes de la page dans la langue choisie
  { const other = window.I18N.lang === 'fr' ? 'en' : 'fr'; const lb = $('#lang-btn'); lb.textContent = other.toUpperCase(); lb.addEventListener('click', () => window.I18N.setLang(other)); }

  function bindGlobal() {
    $('#settings-btn').addEventListener('click', () => openSettings().catch((e) => toast(e.message, 'error')));
    $('#export-btn').addEventListener('click', () => openExport().catch((e) => toast(e.message, 'error')));
    $('#nml-input').addEventListener('change', (e) => importTraktor(e.target.files[0]));
    $('#rbxml-input').addEventListener('change', (e) => importRekordbox(e.target.files[0]));
    // style de forme d'onde (RGB façon Mixxx / 3 bandes)
    const wsel = $('#wave'); wsel.value = waveStyle;
    wsel.addEventListener('change', () => { waveStyle = wsel.value; try { localStorage.setItem('fadarr-wave', waveStyle); } catch (e) { /* rien */ } });
    // replier la zone des decks (plus de place pour la bibliothèque) et le panneau de gauche
    const deckBtn = $('#toggle-decks');
    const setDecks = (hidden) => { document.body.classList.toggle('no-decks', hidden); deckBtn.textContent = hidden ? '▼' : '▲'; deckBtn.title = window.I18N.t(hidden ? 'Afficher les decks' : 'Réduire les decks'); };
    let decksHidden = false; try { decksHidden = localStorage.getItem('fadarr-decks') === '0'; } catch (e) { /* rien */ }
    setDecks(decksHidden);
    deckBtn.addEventListener('click', () => { const h = !document.body.classList.contains('no-decks'); setDecks(h); try { localStorage.setItem('fadarr-decks', h ? '0' : '1'); } catch (e) { /* rien */ } });
    const sideBtn = $('#toggle-side');
    const setSide = (hidden) => { document.body.classList.toggle('no-side', hidden); sideBtn.textContent = hidden ? '▶' : '◀'; sideBtn.title = window.I18N.t(hidden ? 'Afficher le panneau' : 'Masquer le panneau'); };
    let sideHidden = false; try { sideHidden = localStorage.getItem('fadarr-side') === '1'; } catch (e) { /* rien */ }
    setSide(sideHidden);
    sideBtn.addEventListener('click', () => { const h = !document.body.classList.contains('no-side'); setSide(h); try { localStorage.setItem('fadarr-side', h ? '1' : '0'); } catch (e) { /* rien */ } });
    $('#new-pl').addEventListener('click', async () => {
      const name = prompt(window.I18N.t('Nom de la nouvelle playlist :')); if (!name) return;
      try { const p = await api('POST', '/api/playlists', { name }); await library.loadPlaylists(); $('#target-pl').value = p.id; library.show({ type: 'playlist', id: p.id }); } catch (e) { toast(e.message, 'error'); }
    });
    // barre de gauche : sections repliables, « tout replier »
    let closedSecs = [];
    try { closedSecs = JSON.parse(localStorage.getItem('fadarr-secs') || '[]'); } catch (e) { /* rien */ }
    $$('.side-head[data-sec]').forEach((h) => {
      const box = $(`#${h.dataset.sec}`);
      const set = (closed) => { box.hidden = closed; $('.sec .caret', h).classList.toggle('open', !closed); };
      set(closedSecs.includes(h.dataset.sec));
      $('.sec', h).addEventListener('click', () => {
        const closed = !box.hidden; set(closed);
        closedSecs = closed ? [...new Set([...closedSecs, h.dataset.sec])] : closedSecs.filter((x) => x !== h.dataset.sec);
        try { localStorage.setItem('fadarr-secs', JSON.stringify(closedSecs)); } catch (e) { /* rien */ }
      });
    });
    $$('.fold-all').forEach((b) => b.addEventListener('click', () => {
      const box = $(`#${b.dataset.target}`);
      $$('.kids', box).forEach((k) => { k.hidden = true; });
      $$('.caret', box).forEach((c) => c.classList.remove('open'));
      $$('.node[data-key]', box).forEach((r) => library.open.delete(r.dataset.key));
      library.saveOpen();
    }));
    // tri par colonne (clic : croissant / décroissant / ordre d'origine) ; Maj+clic sur « Ton. » : notation
    $$('#tracks th[data-sort]').forEach((th) => th.addEventListener('click', (ev) => {
      if (th.dataset.sort === 'key' && ev.shiftKey) {
        keyMode = { musical: 'camelot', camelot: 'open', open: 'musical' }[keyMode];
        try { localStorage.setItem('fadarr-key', keyMode); } catch (e) { /* rien */ }
        decks.A.renderInfo(); decks.B.renderInfo();
        library.renderRows(); return;
      }
      const s = library.sort;
      if (s.col !== th.dataset.sort) library.sort = { col: th.dataset.sort, dir: th.dataset.sort === 'bpm' || th.dataset.sort === 'key' || th.dataset.sort === 'index' || th.dataset.sort === 'artist' || th.dataset.sort === 'title' || th.dataset.sort === 'format' ? 1 : -1 };
      else if (s.dir === (library.sort.col === 'cueCount' || library.sort.col === 'duration' || library.sort.col === 'added' ? -1 : 1)) library.sort = { col: s.col, dir: -s.dir };
      else library.sort = { col: 'default', dir: 1 };
      library.renderRows();
    }));
    // filtre de BPM
    const readRange = () => {
      const mn = Number($('#bpm-min').value) || null; const mx = Number($('#bpm-max').value) || null;
      library.bpmRange = { min: mn, max: mx };
      library.renderRows();
    };
    $('#bpm-min').addEventListener('input', readRange);
    $('#bpm-max').addEventListener('input', readRange);
    const near = (d) => {
      if (!d.bpm) { toast(window.I18N.t('Deck {id} : pas de BPM.', { id: d.id })); return; }
      const bpm = d.bpm * d.rate;
      $('#bpm-min').value = (bpm * 0.97).toFixed(1); $('#bpm-max').value = (bpm * 1.03).toFixed(1);
      readRange();
    };
    $('#bpm-near-a').addEventListener('click', () => near(decks.A));
    $('#bpm-near-b').addEventListener('click', () => near(decks.B));
    $('#bpm-clear').addEventListener('click', () => { $('#bpm-min').value = ''; $('#bpm-max').value = ''; readRange(); });
    $('#added-filter').addEventListener('change', (e) => { library.addedRange = { days: Number(e.target.value) || 0 }; library.renderRows(); });
    let searchTimer = null;
    $('#search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => library.show(library.view), 200); });
    // raccourcis : Q / W lecture A / B, A / S cue A / B (hors champs de saisie)
    document.addEventListener('keydown', (ev) => {
      if (ev.target.closest('input, select, textarea') || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const k = ev.key.toLowerCase();
      if (k === 'q') decks.A.toggle(); else if (k === 'w') decks.B.toggle();
      else if (k === 'a') decks.A.cue(); else if (k === 's') decks.B.cue();
      else return;
      ev.preventDefault();
    });
    document.addEventListener('pointerdown', () => { if (ctx && ctx.state === 'suspended') ctx.resume(); }, { once: false });
  }

  bindMixer();
  bindNas();
  bindGlobal();
  library.initList();
  refreshNas().then(() => library.reload()).catch((e) => toast(e.message, 'error'));
  requestAnimationFrame(frame);
  window.fadarr = { decks, library }; // pour le débogage dans la console
})();
