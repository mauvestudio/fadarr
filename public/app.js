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
  const PAD = '12345678'; // numéros des hot cues, comme dans Traktor

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

  // Analyse serveur (BPM, grille, tonalité, volume) et volume harmonisé
  const srvAn = { on: false, autoGain: true, target: -9 };
  /** Gain (dB) qui amène un morceau au niveau visé : borné à -15 / +6 dB, et sans pousser la crête au-delà de 0 dBFS. */
  function autoGainDb(tr) {
    if (!srvAn.autoGain || !tr || tr.lufs == null || !Number.isFinite(Number(tr.lufs))) return 0;
    let db = srvAn.target - Number(tr.lufs);
    if (db > 0 && tr.peak != null && Number.isFinite(Number(tr.peak))) db = Math.min(db, Math.max(0, -Number(tr.peak)));
    return Math.max(-15, Math.min(6, Math.round(db * 10) / 10));
  }

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
      this.auto = c.createGain(); // volume harmonisé (LUFS mesuré par l'analyse), avant le gain du deck
      this.trim = c.createGain();
      this.low = c.createBiquadFilter(); this.low.type = 'lowshelf'; this.low.frequency.value = 220;
      this.mid = c.createBiquadFilter(); this.mid.type = 'peaking'; this.mid.frequency.value = 1100; this.mid.Q.value = 0.8;
      this.high = c.createBiquadFilter(); this.high.type = 'highshelf'; this.high.frequency.value = 4200;
      this.filter = c.createBiquadFilter(); this.filter.type = 'allpass';
      this.fader = c.createGain();
      this.xgain = c.createGain();
      this.analyser = c.createAnalyser(); this.analyser.fftSize = 512;
      this.auto.connect(this.trim); this.trim.connect(this.low); this.low.connect(this.mid); this.mid.connect(this.high); this.high.connect(this.filter);
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

    /** Volume harmonisé : amène le morceau au niveau visé (réglages), sans dépasser +6 dB. */
    applyAutoGain() {
      if (!this.auto) return;
      const db = autoGainDb(this.track);
      this.auto.gain.value = dbToGain(db);
      const k = $(`.ch[data-ch="${this.id}"] .k-trim`) || $(`.ch[data-ch="${this.id}"] [data-p="trim"]`);
      if (k) k.title = t('Gain (glisser, molette ; double-clic : remise à zéro)') + (db ? ` — ${t('volume auto : {db} dB', { db: (db > 0 ? '+' : '') + db.toFixed(1) })}` : '');
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
      // analyse serveur (algorithmes de Mixxx) : lancée en parallèle du téléchargement si le morceau n'est pas encore analysé
      const pAn = (!local.isLocal(track.path) && srvAn.on && !track.analyzed)
        ? api('POST', '/api/analysis/track', { path: track.path }).catch((e) => ({ error: e }))
        : null;
      try {
        let full, data;
        if (local.isLocal(track.path)) { // dossier de cet ordinateur : lu directement dans le navigateur
          full = local.full(track.path);
          data = await local.arrayBuffer(track.path);
        } else {
          const [fullR, res] = await Promise.all([
            api('GET', `/api/track?path=${encodeURIComponent(track.path)}`),
            fetch(`/api/audio?path=${encodeURIComponent(track.path)}`, { headers: { 'X-Lang': window.I18N.lang } })
          ]);
          if (!res.ok) { let msg = `Erreur ${res.status}`; try { msg = (await res.json()).error || msg; } catch (e) { /* texte */ } throw new Error(msg); }
          full = fullR; data = await res.arrayBuffer();
        }
        if (token !== this.loading) return;
        this.status(t('Décodage…'));
        const buf = await ctx.decodeAudioData(data);
        if (token !== this.loading) return;
        this.track = full;
        this.buffer = buf;
        if (local.isLocal(full.path) && !full.duration) { full.duration = buf.duration; local.patch(full.path, { duration: Math.round(buf.duration) }); library.paintWindow(); }
        this.cues = full.cues || [];
        const firstHot = this.cues.find((c) => c.kind !== 'loop' && c.kind === 'memory') || null;
        // sans memory cue : on se cale sur le début de la musique (1er son à -60 dB, comme Mixxx)
        this.mainCue = firstHot ? firstHot.start : (Number(full.firstSound) || 0);
        this.applyAutoGain();
        this.offset = this.mainCue;
        // Le morceau est jouable tout de suite ; l'analyse (onde + grille) tourne dans un worker et ne gèle plus l'interface.
        this.status(t('Analyse…'));
        this.renderInfo(); this.renderPads(); this.renderMem(); this.renderLoopBtns();
        refDeck = this; library.renderRows(); // la liste montre ce qui s'enchaîne avec ce morceau
        const mono = toMono(buf);
        if (pAn) pAn.then((r) => this.serverAnalysis(token, buf, r));
        const noGrid = () => !this.bpm || !Number.isFinite(this.track && this.track.gridStart);
        const peaks = await analyze(mono, buf.sampleRate, buf.duration, noGrid() && !pAn, (grid) => {
          // grille détectée : posée sans marquer le morceau « modifié », si rien n'a changé entre-temps.
          // BPM déjà connu (tags) : on garde ce BPM s'il colle à la détection (±2 %), et on ne prend que le début de grille.
          if (!(token === this.loading && this.buffer === buf && noGrid() && grid)) return;
          if (this.bpm && Math.abs(grid.bpm - this.bpm) / this.bpm < 0.02) {
            const beat = 60 / this.bpm; this.saveMeta({ gridStart: Math.round((((grid.gridStart % beat) + beat) % beat) * 1000) / 1000 }, true);
          } else this.saveMeta({ bpm: grid.bpm, gridStart: grid.gridStart }, true);
        });
        if (token !== this.loading) return;
        this.peaks = peaks; // le dessin se fait au rythme de la boucle d'animation
        this.status('');
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
      s.connect(this.auto);
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
            if (local.isLocal(path)) local.patch(path, { bpm: Math.round(v * 100) / 100 });
            else await api('PUT', '/api/track/meta', { path, bpm: v });
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

    /** Résultat de l'analyse serveur : grille, tonalité, volume et début de la musique, si le deck n'a pas changé de morceau. */
    serverAnalysis(token, buf, r) {
      if (token !== this.loading || this.buffer !== buf || !this.track) return;
      if (!r || r.error) { // analyse impossible : détection rapide dans le navigateur, comme avant
        if (!this.bpm || !Number.isFinite(this.track.gridStart)) {
          const g = detectBpmGrid(toMono(buf), buf.sampleRate, buf.duration); if (!g) return;
          if (this.bpm && Math.abs(g.bpm - this.bpm) / this.bpm < 0.02) { const beat = 60 / this.bpm; this.saveMeta({ gridStart: Math.round((((g.gridStart % beat) + beat) % beat) * 1000) / 1000 }, true); } else this.saveMeta({ bpm: g.bpm, gridStart: g.gridStart }, true);
        }
        return;
      }
      const tr = this.track;
      const moved = this.playing || this.offset !== this.mainCue;
      for (const k of ['bpm', 'gridStart', 'key', 'lufs', 'peak', 'firstSound', 'analyzed']) tr[k] = r[k];
      if (!this.cues.some((c) => c.kind === 'memory') && Number(r.firstSound) > 0) {
        this.mainCue = Number(r.firstSound);
        if (!moved) this.offset = this.mainCue;
      }
      this.applyAutoGain();
      this.renderInfo(); this.renderPads(); this.renderMem();
      library.updateAnalysis(tr.path, r);
      if (refDeck === this) library.renderRows();
    }

    /** Enregistre BPM / début de grille (via /api/track/meta). auto = détection automatique (n'est pas marquée « modifiée »). */
    async saveMeta(patch, auto) {
      if (!this.track) return;
      const path = this.track.path;
      try {
        if (local.isLocal(path)) local.patch(path, patch);
        else await api('PUT', '/api/track/meta', { path, ...patch, ...(auto ? { auto: true } : {}) });
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
        const r = detectBpmGrid(toMono(this.buffer), this.buffer.sampleRate, this.buffer.duration);
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
    setLoop(start, end, beats = null) {
      const pos = this.position;
      this.loop = { start, end, active: true };
      this.loopBeats = beats; // taille en temps (bouton allumé), null pour une loop IN/OUT ou une hot loop
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
      } else if (a === 'beat4' || a === 'beat8' || a.startsWith('b:')) {
        if (!this.bpm) { toast(t('BPM inconnu pour ce morceau : pose la loop avec IN / OUT.')); return; }
        const beats = a === 'beat4' ? 4 : a === 'beat8' ? 8 : Number(a.slice(2));
        // reclic sur la taille de la loop en cours : on la quitte (comme dans Traktor)
        if (this.loop && this.loop.active && this.loopBeats === beats) { this.loop.active = false; if (this.playing) this.startAt(this.position); this.renderLoopBtns(); return; }
        const beat = 60 / this.bpm;
        let start = pos;
        if (Number.isFinite(this.track.gridStart)) start = this.track.gridStart + Math.round((pos - this.track.gridStart) / beat) * beat; // calé sur la grille
        this.setLoop(Math.max(0, start), Math.max(0, start) + beats * beat, beats);
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
      if (local.isLocal(path)) { local.patch(path, { cues: this.cues }); library.updateCount(path, this.cues.length); return; }
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
      $('.d-album', this.el).textContent = t ? (t.album || '') : '';
      const bpmEl = $('.d-bpm', this.el); // absent pendant l'édition
      if (bpmEl) bpmEl.textContent = this.bpm ? (this.bpm * this.rate).toFixed(2) : '—';
      const pct = (this.rate - 1) * 100;
      $('.d-pct', this.el).textContent = t ? `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` : '';
      $('.d-orig', this.el).textContent = t && this.bpm ? Number(this.bpm).toFixed(2) : '';
      $('.d-total', this.el).textContent = this.buffer ? fmt(this.duration) : '';
      const kEl = $('.d-key', this.el);
      kEl.textContent = t ? [showKey(t.key), t.format].filter(Boolean).join(' · ') : '';
      kEl.style.color = t && t.key ? keyColor(t.key) : '';
    }

    renderTransport() {
      $('[data-a="play"]', this.el).classList.toggle('on', this.playing);
      $('[data-a="play"]', this.el).textContent = this.playing ? '❚❚' : '▶';
    }

    renderLoopBtns() {
      $('[data-a="in"]', this.el).classList.toggle('armed', this.loopIn !== null);
      $('[data-a="exit"]', this.el).classList.toggle('on', Boolean(this.loop && this.loop.active));
      $('[data-a="q"]', this.el).classList.toggle('on', this.quant);
      const active = this.loop && this.loop.active ? this.loopBeats : null;
      $$('.lbtn.sz', this.el).forEach((b) => b.classList.toggle('on', active !== null && Number(b.dataset.a.slice(2)) === active));
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
  function computePeaks(mono, sr, duration) {
    const n = Math.ceil(duration * PEAK_RATE);
    const max = new Float32Array(n); const lo = new Float32Array(n); const mi = new Float32Array(n); const hi = new Float32Array(n);
    const aL = Math.exp(-2 * Math.PI * 250 / sr); const aH = Math.exp(-2 * Math.PI * 2500 / sr);
    let l1 = 0, l2 = 0, h1 = 0, h2 = 0;
    const step = sr / PEAK_RATE;
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * step); const b = Math.min(mono.length, Math.floor((i + 1) * step));
      let m = 0, ml = 0, mm = 0, mh = 0;
      for (let j = a; j < b; j++) {
        const x = mono[j];
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
    // niveau « typique » de chaque bande sur ce morceau (95e centile) : la couleur RGB compare les bandes à leur propre niveau,
    // sinon les médiums, toujours les plus forts en énergie, mettent tout en vert
    // plancher : une bande presque absente (ex. un dub sans aigus) n'est pas gonflée jusqu'à colorer tout le morceau
    const floorNorm = (v) => { const top = Math.max(...v); return v.map((x) => Math.max(x, top * 0.3)); };
    const p95 = (arr) => { const st = Math.max(1, Math.floor(arr.length / 4000)); const tmp = []; for (let i = 0; i < arr.length; i += st) tmp.push(arr[i]); tmp.sort((a, b) => a - b); return Math.max(1e-3, tmp[Math.floor(tmp.length * 0.95)] || 0); };
    return { rate: PEAK_RATE, max, lo, mi, hi, norm: n ? floorNorm([p95(lo), p95(mi), p95(hi)]) : [1, 1, 1] };
  }

  /**
   * Détection de tempo et du premier temps (façon analyseur de beatgrid de Mixxx, version légère) :
   * enveloppe d'attaques sur les graves -> autocorrélation pour le BPM (70-180) -> phase pour caler le 1er temps.
   * Analyse les ~2 premières minutes. Renvoie { bpm, gridStart } ou null.
   */
  function detectBpmGrid(mono, sr, duration) {
    const N = Math.floor(Math.min(duration, 120) * sr);
    const hop = 512; const fps = sr / hop; const nf = Math.floor(N / hop);
    if (nf < 40) return null;
    const env = new Float32Array(nf);
    const aL = Math.exp(-2 * Math.PI * 200 / sr); let lp1 = 0, lp2 = 0, prev = 0;
    for (let f = 0; f < nf; f++) {
      let e = 0; const a = f * hop; const b = a + hop;
      for (let j = a; j < b; j++) { const x = mono[j]; lp1 = (1 - aL) * x + aL * lp1; lp2 = (1 - aL) * lp1 + aL * lp2; e += lp2 * lp2; }
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

  /** Mixe un AudioBuffer en un seul canal (nouveau tableau, laisse le buffer de lecture intact). */
  function toMono(buf) {
    const n = buf.length; const c0 = buf.getChannelData(0);
    if (buf.numberOfChannels < 2) return c0.slice(0);
    const c1 = buf.getChannelData(1); const m = new Float32Array(n);
    for (let i = 0; i < n; i++) m[i] = (c0[i] + c1[i]) * 0.5;
    return m;
  }

  // ---------------------------------------------------------------------------
  // Analyse hors du fil principal (Web Worker) : forme d'onde + détection de grille.
  // Le gros du calcul (filtres, autocorrélation) ne gèle plus l'interface au chargement.
  // Les deux fonctions ci-dessus sont ré-injectées telles quelles dans le worker.
  // ---------------------------------------------------------------------------
  const ANALYZER_SRC = `const PEAK_RATE=${PEAK_RATE};\n${computePeaks.toString()}\n${detectBpmGrid.toString()}\n`
    + `self.onmessage=function(e){var d=e.data;var p=computePeaks(d.mono,d.sr,d.duration);`
    + `self.postMessage({id:d.id,kind:'peaks',peaks:p},[p.max.buffer,p.lo.buffer,p.mi.buffer,p.hi.buffer]);`
    + `if(d.detect){var g=detectBpmGrid(d.mono,d.sr,d.duration);self.postMessage({id:d.id,kind:'grid',grid:g});}};`;
  let analyzer = null; // null = pas encore créé ; false = indisponible (secours synchrone) ; sinon le Worker
  const analyzerReqs = new Map(); let analyzerId = 0;
  function getAnalyzer() {
    if (analyzer !== null) return analyzer;
    try {
      analyzer = new Worker(URL.createObjectURL(new Blob([ANALYZER_SRC], { type: 'text/javascript' })));
      analyzer.onmessage = (e) => {
        const r = analyzerReqs.get(e.data.id); if (!r) return;
        if (e.data.kind === 'peaks') { r.resolve(e.data.peaks); if (!r.detect) analyzerReqs.delete(e.data.id); }
        else { if (r.onGrid) r.onGrid(e.data.grid); analyzerReqs.delete(e.data.id); }
      };
      analyzer.onerror = () => { analyzer = false; for (const [id, r] of [...analyzerReqs]) { analyzerReqs.delete(id); r.fallback(); } };
    } catch (e) { analyzer = false; }
    return analyzer;
  }
  /** Calcule les pics (promesse) et, si detect, appelle onGrid(grille) ; retombe sur le fil principal si le worker est indisponible. */
  function analyze(mono, sr, duration, detect, onGrid) {
    return new Promise((resolve) => {
      const fallback = () => { resolve(computePeaks(mono, sr, duration)); if (detect && onGrid) onGrid(detectBpmGrid(mono, sr, duration)); };
      const w = getAnalyzer();
      if (!w) { fallback(); return; }
      const id = ++analyzerId;
      let done = false;
      const req = { detect, onGrid, resolve: (p) => { done = true; resolve(p); }, fallback: () => { if (!done) fallback(); } };
      analyzerReqs.set(id, req);
      // garde-fou : si le worker ne répond pas (cas rare), on calcule sur le fil principal
      setTimeout(() => { if (analyzerReqs.has(id)) { analyzerReqs.delete(id); req.fallback(); } }, 15000);
      w.postMessage({ id, mono, sr, duration, detect }); // mono conservé côté principal (pas de transfert) : secours possible
    });
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

  /** Colonne « RGB » façon Traktor / Mixxx : graves = rouge, médiums = vert, aigus = bleu, et les mélanges
   *  (kick + médiums = orange / jaune, charley = bleu / magenta, plein spectre = blanc). Chaque bande est rapportée
   *  à son niveau typique sur le morceau (cols.norm), puis pondérée : les médiums sont retenus pour ne pas tout verdir. */
  function drawColumnRGB(g, x, h, v, cols, scale) {
    const [m, l, md, hh] = v;
    const N = cols.norm || [1, 1, 1];
    const L = l / N[0], M = (md / N[1]) * 0.62, H = (hh / N[2]) * 1.15;
    const mx = Math.max(L, M, H, 1e-4); const w = Math.min(L, M, H) / mx;
    const ch = cols.contrast ? (b) => 30 + 225 * Math.pow(b / mx, 2.2) : (b) => 25 + 230 * Math.pow((b / mx) * 0.88 + 0.12 * w, 1.4);
    const bar = Math.max(1, m * scale);
    g.fillStyle = `rgb(${ch(L) | 0},${ch(M) | 0},${ch(H) | 0})`;
    g.fillRect(x, h / 2 - bar / 2, 1, bar);
  }

  /** Renvoie les couleurs et la fonction de dessin selon le style choisi. */
  function wavePaint(d) { return waveStyle === 'rgb' ? { cols: { ...waveColorsRGB(), norm: d && d.peaks && d.peaks.norm }, draw: drawColumnRGB } : { cols: waveColors(), draw: drawColumn }; }

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
    const g = cv.getContext('2d'); const { cols, draw } = wavePaint(d); const n = d.peaks.max.length;
    const colsV = [];
    for (let x = 0; x < w; x++) {
      const a = Math.floor((x / w) * n); const b = Math.max(a + 1, Math.floor(((x + 1) / w) * n));
      const v = peakRange(d.peaks, a, b);
      if (cols.norm) { // couleur : énergie MOYENNE de chaque bande sur la colonne (le max, lui, ne garde que la hauteur)
        let l = 0, md = 0, hh = 0; const k = b - a;
        for (let i = a; i < b && i < n; i++) { l += d.peaks.lo[i]; md += d.peaks.mi[i]; hh += d.peaks.hi[i]; }
        v[1] = l / k; v[2] = md / k; v[3] = hh / k;
      }
      colsV.push(v);
    }
    // vue d'ensemble : chaque colonne prend le MAX de plusieurs secondes, ce qui gonfle surtout les aigus (transitoires) ;
    // on recale donc les bandes sur leur propre niveau typique à cette échelle, pour garder les mêmes teintes que la vue zoomée
    if (cols.norm) {
      // chaque bande rapportée à son niveau médian sur le morceau : un passage plus riche en graves vire au rouge / orange,
      // un break sans kick au vert, un passage brillant au bleu / blanc (comme la vue d'ensemble de Traktor)
      const p = (k) => { const v = colsV.map((c) => c[k]).sort((x, y) => x - y); return Math.max(1e-4, v[Math.floor(v.length * 0.5)] || 0); };
      const raw = [p(1), p(2) * 0.62, p(3) * 1.15]; const top = Math.max(...raw); // compense les poids de drawColumnRGB : bandes à égalité au niveau médian
      cols.norm = raw.map((x) => Math.max(x, top * 0.05));
      cols.contrast = true;
      // lissage sur quelques colonnes voisines : des plages de couleur par passage plutôt qu'un arc-en-ciel colonne par colonne
      const R = Math.max(2, Math.round(w / 220));
      const sm = colsV.map((c, x) => { const o = [c[0], 0, 0, 0]; let k = 0; for (let j = Math.max(0, x - R); j <= Math.min(colsV.length - 1, x + R); j++) { o[1] += colsV[j][1]; o[2] += colsV[j][2]; o[3] += colsV[j][3]; k++; } o[1] /= k; o[2] /= k; o[3] /= k; return o; });
      for (let x = 0; x < colsV.length; x++) colsV[x] = sm[x];
    }
    for (let x = 0; x < w; x++) draw(g, x, h, colsV[x], cols, h - 4);
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
      // un trait fin toutes les 16 mesures (64 temps), comme les repères de phrase de Rekordbox
      if (d.bpm && Number.isFinite(d.track.gridStart)) {
        const phrase = (60 / d.bpm) * 64;
        g.fillStyle = 'rgba(255,255,255,.28)';
        for (let t = d.track.gridStart; t < d.duration; t += phrase) g.fillRect(Math.round((t / d.duration) * w), 0, dpr, h);
      }
      for (const c of d.cues) { g.fillStyle = cueColor(c); g.fillRect(Math.round((c.start / d.duration) * w), 0, 2 * dpr, h); }
      g.fillStyle = '#ff3b3b'; g.fillRect(Math.round(px), 0, 2 * dpr, h);
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
      const { cols, draw } = wavePaint(d);
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
      // grille de mesure façon Rekordbox : graduations en haut et en bas sur chaque temps, longues et rouges sur le 1er temps
      // de chaque mesure, numéro de mesure toutes les 4 mesures (mesure 1 = celle qui commence au début de la grille)
      if (d.bpm && Number.isFinite(d.track.gridStart)) {
        const beat = 60 / d.bpm;
        const first = Math.ceil((t0 - d.track.gridStart) / beat);
        g.font = `600 ${9 * dpr}px system-ui`;
        for (let k = first; ; k++) {
          const t = d.track.gridStart + k * beat; if (t > t0 + span) break;
          const x = Math.round(((t - t0) / span) * w);
          const down = ((k % 4) + 4) % 4 === 0;
          const len = (down ? 9 : 4) * dpr;
          g.fillStyle = down ? '#e8413c' : 'rgba(255,255,255,.62)';
          g.fillRect(x, 0, (down ? 2 : 1) * dpr, len);
          g.fillRect(x, h - len, (down ? 2 : 1) * dpr, len);
          const bar = Math.floor(k / 4) + 1;
          if (down && bar >= 1 && (bar - 1) % 4 === 0) { g.fillStyle = 'rgba(255,255,255,.7)'; g.fillText(String(bar), x + 4 * dpr, 9 * dpr); }
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
      g.fillStyle = 'rgba(255,60,60,.22)'; g.fillRect(Math.round(w / 2) - 2 * dpr, 0, 6 * dpr, h);
      g.fillStyle = '#ff3b3b'; g.fillRect(Math.round(w / 2), 0, 2 * dpr, h); // tête de lecture rouge, comme dans Traktor
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

  let lastClock = '';
  function frame() {
    drawDeck(decks.A); drawDeck(decks.B);
    // tempo du deck maître (celui qui joue ; sinon le deck de référence) + horloge, comme la barre du haut de Traktor
    const m = [decks.A, decks.B].find((d) => d.playing && d.bpm) || (refDeck && refDeck.bpm ? refDeck : null);
    const mb = m ? (m.bpm * m.rate).toFixed(2) : '—';
    const mEl = $('#mx-bpm'); if (mEl && mEl.textContent !== mb) mEl.textContent = mb;
    const now = new Date(); const ck = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (ck !== lastClock) { lastClock = ck; const c = $('#clock'); if (c) c.textContent = ck; }
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
          if (n.select) this._nodes.set(n.key, { label: n.label, select: n.select });
          if (n.menu || n.select) { // clic droit : menu contextuel façon Traktor (+ favoris)
            row.addEventListener('contextmenu', (ev) => {
              ev.stopPropagation();
              const items = (typeof n.menu === 'function' ? n.menu() : n.menu) || [];
              if (n.select) { if (items.length) items.push({ sep: true }); items.push(this.isFav(n.key) ? { label: t('Retirer des favoris'), fn: () => this.toggleFav(n.key) } : { label: t('Ajouter aux favoris'), fn: () => this.toggleFav(n.key) }); }
              if (items.length) contextMenu(ev, items);
            });
          }
          parent.appendChild(row);
          if (hasKids) { parent.appendChild(kids); walk(n.children, depth + 1, kids); }
        }
      };
      walk(roots, 0, box);
      this.renderFavs();
    },

    // ---------- favoris (grille du haut, comme les favoris de Traktor) : clic droit sur une playlist / un dossier ----------
    _nodes: new Map(),
    favs: (() => { try { const v = JSON.parse(localStorage.getItem('fadarr-favs')); if (Array.isArray(v)) return v; } catch (e) { /* rien */ } return ['all', 'recent']; })(),
    isFav(key) { return this.favs.includes(key); },
    toggleFav(key) {
      if (this.isFav(key)) this.favs = this.favs.filter((k) => k !== key);
      else if (this.favs.length >= 12) { toast(t('12 favoris au maximum : retires-en un d’abord.')); return; }
      else this.favs.push(key);
      try { localStorage.setItem('fadarr-favs', JSON.stringify(this.favs)); } catch (e) { /* rien */ }
      this.renderFavs();
    },
    renderFavs() {
      const box = $('#favs'); if (!box) return;
      const cur = this._curKey;
      let html = '';
      for (let i = 0; i < 12; i++) {
        const key = this.favs[i]; const node = key && this._nodes.get(key);
        if (!node) { html += '<div class="fav empty"></div>'; continue; }
        const kind = key.startsWith('pl:') ? 'pl' : key.startsWith('folder:') ? 'fd' : 'st';
        html += `<button type="button" class="fav${key === cur ? ' on' : ''}" data-fav="${esc(key)}"><span class="fic ${kind}"></span><span class="lbl">${esc(node.label)}</span></button>`;
      }
      box.innerHTML = html;
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
      const key = this.view.type === 'all' ? 'all' : this.view.type === 'recent' ? 'recent' : this.view.type === 'folder' ? `folder:${this.view.path}` : this.view.type === 'local' ? `localv:${this.view.path}` : `pl:${this.view.id}`;
      $$('.node[data-key]').forEach((n) => n.classList.toggle('sel', n.dataset.key === key));
      this._curKey = key; this.renderFavs();
      this.revealSel(key);
    },

    /** Recharge la vue affichée sans perdre la position dans la liste (après une analyse). */
    async refreshKeep() {
      if (this.view.type === 'local') return;
      const wrap = $('.table-wrap'); const top = wrap ? wrap.scrollTop : 0;
      try { await this.show(this.view); } catch (e) { return; }
      if (wrap) { wrap.scrollTop = top; this.paintWindow(); }
    },

    async show(view) {
      this.view = view;
      this.markSel();
      const q = $('#search').value.trim();
      const actions = $('#list-actions');
      actions.innerHTML = '';
      if (srvAn.on && view.type !== 'local') {
        const ab = button(t('Analyser'), (ev) => analysisRun(this.rows, ev && ev.shiftKey));
        ab.title = t('Calcule BPM, grille, tonalité et volume des morceaux de cette liste qui ne le sont pas encore (Maj+clic : tout recalculer). Une grille importée ou posée à la main n’est jamais remplacée.');
        actions.appendChild(ab);
      }
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
          this._orderBtn = button(t('Figer cet ordre'), () => this.freezeOrder());
          this._orderBtn.title = t('Enregistre l’ordre d’affichage actuel (tri) comme ordre de la playlist');
          actions.appendChild(this._orderBtn);
          actions.appendChild(button(t('Renommer'), async () => {
            const name = prompt(t('Nouveau nom :'), p.name); if (!name) return;
            await api('PUT', `/api/playlists/${p.id}`, { name }); await this.loadPlaylists(); this.show(this.view);
          }));
          actions.appendChild(button(t('Supprimer'), async () => {
            if (!confirm(t('Supprimer la playlist « {name} » ? (les morceaux ne sont pas touchés)', { name: p.name }))) return;
            await api('DELETE', `/api/playlists/${p.id}`); await this.loadPlaylists(); this.show({ type: 'all' });
          }));
        }
      } else if (view.type === 'local') {
        $('#list-title').textContent = view.path ? `${local.name} / ${view.path}` : t('{name} (sur cet ordinateur)', { name: local.name || t('Dossier local') });
        this.rows = local.rows(view.path, q);
        if (local.tracks.length) actions.appendChild(button(t('Fermer ce dossier'), () => local.close()));
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
          if (col === 'lufs') return t.lufs != null ? Number(t.lufs) : -1e9;
          if (col === 'index' || col === 'bpm' || col === 'duration' || col === 'cueCount') return Number(t[col]) || (col === 'index' ? 0 : -1);
          return String(t[col] || '').toLowerCase();
        };
        const missing = (v) => v === -1 || v === 99 || v === '' || v === -1e9;
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
      const cls = [t.missing ? 'missing' : '', kc && bc ? 'match' : '', this._sel === t.path ? 'sel' : '',
        (refDeck && refDeck.track && refDeck.track.path === t.path) ? `loaded-${refDeck.id.toLowerCase()}` : ''].filter(Boolean).join(' ');
      const keyStyle = t.key && !kc ? ` style="color:${keyColor(t.key)}"` : '';
      const T = window.I18N.t;
      const onA = decks.A && decks.A.track && decks.A.track.path === t.path; const onB = decks.B && decks.B.track && decks.B.track.path === t.path;
      const deckTag = `${onA ? '<span class="dk a">A</span>' : ''}${onB ? '<span class="dk b">B</span>' : ''}`;
      return `<td class="n">${num}</td>`
        + `<td class="ic">${t.missing ? '' : `<button type="button" class="pv${preview.path === t.path ? ' on' : ''}" data-pv="1" title="${T('Pré-écoute (sans charger de deck)')}">${preview.path === t.path ? '■' : '▶'}</button>`}${deckTag}</td>`
        + `<td class="cd"><span class="cdot" data-cdot="1"${t.color ? ` style="background:${t.color}"` : ''} title="${T('Clic : couleur')}"></span></td>`
        + `<td class="ti" title="${esc(t.path)}">${esc(t.title)}</td><td>${esc(t.artist)}</td>`
        + `<td class="r bpm${bc ? ` c${bc}` : ''}">${t.bpm ? Number(t.bpm).toFixed(2) : '<span class="muted">—</span>'}</td><td class="key${kc ? ` c${kc}` : ''}"${keyStyle} title="${esc(t.key || '')}">${esc(showKey(t.key))}</td>`
        + `<td class="r dim"${t.lufs != null && t.peak != null ? ` title="${T('Crête : {p} dBFS', { p: t.peak.toFixed(1) })}"` : ''}>${t.lufs != null ? t.lufs.toFixed(1) : ''}</td>`
        + `<td class="rate">${ratingStars(t.rating)}</td>`
        + `<td class="r dim">${t.duration ? fmt(t.duration) : ''}</td>`
        + `<td class="dim">${esc(t.format || '')}${t.bitrate && !/WAV|AIFF|FLAC/i.test(t.format) ? ` ${t.bitrate}` : ''}</td><td class="r dim">${t.cueCount || ''}</td>`
        + `<td class="r dim" title="${t.added ? new Date(t.added).toLocaleString(window.I18N.locale) : ''}">${shortDate(t.added)}</td>`
        + `<td class="act">${t.missing ? `<span class="muted small">${T('absent du NAS')}</span>` : `<button type="button" class="ld a" data-l="A" title="${T('Charger dans A')}">A</button><button type="button" class="ld b" data-l="B" title="${T('Charger dans B')}">B</button>`}`
        + `${t.local ? '' : this._editable ? `<button type="button" class="mini" data-x="1" title="${T('Retirer de la playlist')}">×</button>` : `<button type="button" class="mini" data-add="1" title="${T('Ajouter à la playlist choisie (« Ajouter à »)')}">＋</button>`}</td>`
        + `<td class="vcls" hidden>${cls}</td>`;
    },

    renderRows() {
      this.renderSortMarks();
      this._editable = this.current && this.current.source === 'fadarr';
      this._vrows = this.visibleRows();
      $('#empty').textContent = this._vrows.length ? '' : t(this.rows.length ? 'Aucun morceau dans cette plage de BPM.' : (this.view.type === 'playlist' ? 'Playlist vide : glisse des morceaux dessus depuis la bibliothèque.' : (nas && nas.tracks ? 'Aucun morceau ne correspond.' : 'Bibliothèque vide : clique sur « Analyser le NAS ».')));
      this.paintWindow();
      this.renderStatus();
    },

    /** Barre d'état en bas, comme Traktor : nombre de morceaux et durée totale de la liste affichée. */
    renderStatus() {
      const rows = this._vrows || [];
      const secs = rows.reduce((a, r) => a + (Number(r.duration) || 0), 0);
      const hh = Math.floor(secs / 3600); const mm = Math.round((secs % 3600) / 60);
      const dur = hh ? `${hh} h ${String(mm).padStart(2, '0')} min` : `${mm} min`;
      $('#status-r').textContent = t('{n} morceaux · {d}', { n: rows.length.toLocaleString(window.I18N.locale), d: dur });
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
      let html = top ? `<tr class="vspacer" style="height:${top}px"><td colspan="13"></td></tr>` : '';
      for (let i = first; i < last; i++) {
        const tr = rows[i];
        const num = (this.current ? tr.index : i) + 1;
        const tint = /^#[0-9a-f]{6}$/i.test(tr.color || '') ? ` style="--rowc:${tr.color}"` : '';
        html += `<tr data-path="${esc(tr.path)}" data-vi="${i}"${tr.missing ? '' : ' draggable="true"'}${tint}>${this.rowHtml(tr, num)}</tr>`;
      }
      if (bottom) html += `<tr class="vspacer" style="height:${bottom}px"><td colspan="13"></td></tr>`;
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
      const favs = $('#favs');
      favs.addEventListener('click', (ev) => { const b = ev.target.closest('[data-fav]'); const n = b && this._nodes.get(b.dataset.fav); if (n) n.select(); });
      favs.addEventListener('contextmenu', (ev) => { const b = ev.target.closest('[data-fav]'); if (!b) return; contextMenu(ev, [{ label: t('Retirer des favoris'), fn: () => this.toggleFav(b.dataset.fav) }]); });
      const rowOf = (el) => { const tr = el.closest && el.closest('tr[data-vi]'); return tr ? this._vrows[Number(tr.dataset.vi)] : null; };
      body.addEventListener('click', (ev) => {
        const t = rowOf(ev.target); if (!t) return;
        if (this._sel !== t.path) { // sélection (ligne bleue, comme dans Traktor)
          this._sel = t.path;
          $$('#tracks tbody tr.sel').forEach((r) => r.classList.remove('sel'));
          const tr = ev.target.closest('tr[data-vi]'); if (tr) tr.classList.add('sel');
        }
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

    /** Enregistre l'ordre d'affichage actuel (tri par colonne) comme ordre de la playlist, façon Traktor. */
    async freezeOrder() {
      if (!this.current || this.current.source !== 'fadarr') return;
      if ($('#search').value.trim() || this.bpmRange.min || this.bpmRange.max || this.addedRange.days) {
        toast(t('Enlève d’abord la recherche et les filtres : l’ordre se fige sur tous les morceaux.')); return;
      }
      const order = this.visibleRows().map((r) => r.path);
      if (!order.length) return;
      try {
        await api('PUT', `/api/playlists/${this.current.id}`, { tracks: order });
        this.sort = { col: 'default', dir: 1 }; // on revient à l'ordre manuel (= le nouvel ordre figé)
        await this.loadPlaylists(); await this.show(this.view);
        toast(t('Ordre de la playlist enregistré.'));
      } catch (e) { toast(e.message, 'error'); }
    },

    /** Pose la note (0-255) d'un morceau et rafraîchit la ligne + les decks. */
    async setRating(tr, rating) {
      tr.rating = rating;
      this.paintWindow();
      for (const d of Object.values(decks)) if (d.track && d.track.path === tr.path) { d.track.rating = rating; }
      if (local.isLocal(tr.path)) { local.patch(tr.path, { rating }); return; }
      try { await api('PUT', '/api/track/meta', { path: tr.path, rating }); } catch (e) { toast(e.message, 'error'); }
    },

    /** Pose (ou enlève) la couleur d'un morceau façon Traktor. */
    async setColor(tr, color) {
      tr.color = color;
      this.paintWindow();
      for (const d of Object.values(decks)) if (d.track && d.track.path === tr.path) { d.track.color = color; }
      if (local.isLocal(tr.path)) { local.patch(tr.path, { color }); return; }
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
      if (paths.some((p) => local.isLocal(p))) {
        paths = paths.filter((p) => !local.isLocal(p));
        toast(t('Un morceau d’un dossier local ne peut pas aller dans une playlist : il n’est pas sur le NAS.'), 'error');
        if (!paths.length) return;
      }
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
      const tr = $(`#tracks tr[data-path="${CSS.escape(path)}"] td:nth-child(12)`); if (tr) tr.textContent = n || ''; // colonne Cues
    },

    updateAnalysis(path, r) {
      for (const list of [this.rows, this._vrows || []]) {
        const row = list.find((x) => x.path === path);
        if (row) for (const k of ['bpm', 'gridStart', 'key', 'lufs', 'peak', 'firstSound', 'analyzed']) row[k] = r[k];
      }
      this.paintWindow();
    },

    updateBpm(path, bpm) {
      const row = this.rows.find((r) => r.path === path); if (row) row.bpm = bpm;
      const vr = (this._vrows || []).find((r) => r.path === path); if (vr) vr.bpm = bpm;
    }
  };

  // ===========================================================================
  // DOSSIER LOCAL : jouer des morceaux d'un dossier de CET ordinateur, sans rien envoyer au serveur.
  // Les fichiers sont lus dans le navigateur ; BPM, grille, cues, note et couleur sont gardés dans ce navigateur
  // (localStorage), pas dans fadarr. Le NAS reste la bibliothèque principale.
  // ===========================================================================
  const LOCAL_AUDIO = /\.(mp3|wav|aiff?|flac|m4a|aac|ogg|opus)$/i;

  /** AIFF -> WAV (mêmes échantillons, sans perte) : Chrome et Firefox ne décodent pas l'AIFF. Gère AIFF et AIFF-C non compressé. */
  function aiffToWav(ab) {
    const v = new DataView(ab);
    const id = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    if (id(0) !== 'FORM' || !['AIFF', 'AIFC'].includes(id(8))) throw new Error(window.I18N.t('Fichier AIFF illisible.'));
    let ch = 0, frames = 0, bits = 0, rate = 0, little = false, data = -1;
    for (let o = 12; o + 8 <= v.byteLength;) {
      const cid = id(o); const size = v.getUint32(o + 4); const p = o + 8;
      if (cid === 'COMM') {
        ch = v.getUint16(p); frames = v.getUint32(p + 2); bits = v.getUint16(p + 6);
        const exp = v.getUint16(p + 8) & 0x7fff; const hi = v.getUint32(p + 10); const lo = v.getUint32(p + 14);
        rate = Math.round((hi * 4294967296 + lo) * Math.pow(2, exp - 16383 - 63));
        if (id(8) === 'AIFC' && size >= 22) {
          const comp = id(p + 18);
          if (comp === 'sowt') little = true; else if (comp !== 'NONE' && comp !== 'twos') throw new Error(window.I18N.t('AIFF compressé non pris en charge ({c}).', { c: comp }));
        }
      } else if (cid === 'SSND') data = p + 8 + v.getUint32(p);
      o = p + size + (size % 2);
    }
    if (!ch || !rate || data < 0 || ![8, 16, 24, 32].includes(bits)) throw new Error(window.I18N.t('Fichier AIFF illisible.'));
    const bps = bits / 8; const len = Math.min(frames * ch * bps, v.byteLength - data);
    const out = new ArrayBuffer(44 + len); const w = new DataView(out); const src = new Uint8Array(ab, data, len); const dst = new Uint8Array(out, 44);
    const str = (o, t) => { for (let i = 0; i < 4; i++) w.setUint8(o + i, t.charCodeAt(i)); };
    str(0, 'RIFF'); w.setUint32(4, 36 + len, true); str(8, 'WAVE'); str(12, 'fmt '); w.setUint32(16, 16, true);
    w.setUint16(20, 1, true); w.setUint16(22, ch, true); w.setUint32(24, rate, true); w.setUint32(28, rate * ch * bps, true);
    w.setUint16(32, ch * bps, true); w.setUint16(34, bits, true); str(36, 'data'); w.setUint32(40, len, true);
    if (bps === 1) for (let i = 0; i < len; i++) dst[i] = (src[i] + 128) & 255; // AIFF 8 bits signé -> WAV 8 bits non signé
    else if (little) dst.set(src);
    else for (let i = 0; i < len; i += bps) for (let b = 0; b < bps; b++) dst[i + b] = src[i + bps - 1 - b]; // gros-boutiste -> petit-boutiste
    return out;
  }

  const local = {
    name: '', files: new Map(), tracks: [],
    meta: (() => { try { return JSON.parse(localStorage.getItem('fadarr-local-meta') || '{}') || {}; } catch (e) { return {}; } })(),
    isLocal(p) { return String(p || '').startsWith('local:'); },
    patch(path, patch) {
      this.meta[path] = { ...(this.meta[path] || {}), ...patch };
      try { localStorage.setItem('fadarr-local-meta', JSON.stringify(this.meta)); } catch (e) { toast(t('Stockage du navigateur plein : réglage non gardé.'), 'error'); }
      const tr = this.tracks.find((x) => x.path === path);
      if (tr) Object.assign(tr, patch, patch.cues ? { cueCount: patch.cues.length } : {});
    },
    /** « 01. Artiste - Titre (Mix).aiff » -> { artist, title } */
    parseName(rel) {
      const base = rel.split('/').pop().replace(/\.[^.]+$/, '').replace(/^\s*\d{1,3}\s*[-._)]\s*/, '');
      const i = base.indexOf(' - ');
      return i > 0 ? { artist: base.slice(0, i).trim(), title: base.slice(i + 3).trim() } : { artist: '', title: base.trim() };
    },
    load(fileList) {
      const list = [...fileList].filter((f) => LOCAL_AUDIO.test(f.name) && !f.name.startsWith('._'));
      if (!list.length) { toast(t('Aucun fichier audio dans ce dossier.'), 'error'); return; }
      this.files = new Map(); this.tracks = [];
      for (const f of list) {
        const rel = f.webkitRelativePath || f.name;
        const parts = rel.split('/'); this.name = parts.length > 1 ? parts[0] : t('Dossier local');
        const path = `local:${rel}`;
        const m = this.meta[path] || {};
        const ext = (f.name.match(/\.([^.]+)$/) || [, ''])[1].toUpperCase();
        this.files.set(path, f);
        this.tracks.push({
          path, local: true, folder: parts.slice(1, -1).join('/'), ...this.parseName(rel), album: '', format: ext === 'AIF' ? 'AIFF' : ext, bitrate: null,
          duration: m.duration || null, bpm: m.bpm || null, key: m.key || '', gridStart: m.gridStart ?? null, rating: m.rating || 0, color: m.color || '',
          cueCount: (m.cues || []).length, added: f.lastModified || null
        });
      }
      this.tracks.sort((a, b) => `${a.artist} ${a.title}`.localeCompare(`${b.artist} ${b.title}`, undefined, { sensitivity: 'base' }));
      this.renderTree();
      library.show({ type: 'local', path: '' });
      toast(t('{n} morceaux chargés depuis « {name} » (lus sur cet ordinateur, rien n’est envoyé au serveur).', { n: this.tracks.length, name: this.name }));
    },
    close() {
      this.files = new Map(); this.tracks = []; this.name = '';
      this.renderTree();
      if (library.view && library.view.type === 'local') library.show({ type: 'all' });
    },
    renderTree() {
      const box = $('#local-tree'); if (!box) return;
      if (!this.tracks.length) { box.innerHTML = `<div class="node fold muted">${esc(t('Aucun dossier : ＋ pour en ouvrir un sur cet ordinateur'))}</div>`; return; }
      const root = { key: 'localv:', label: this.name, count: this.tracks.length, children: [], select: () => library.show({ type: 'local', path: '' }),
        menu: [{ label: t('Fermer ce dossier'), fn: () => this.close() }, { label: t('Ouvrir un autre dossier…'), fn: () => this.pick() }] };
      const byPath = new Map(); const counts = new Map();
      for (const tr of this.tracks) { const parts = tr.folder ? tr.folder.split('/') : []; for (let i = 1; i <= parts.length; i++) { const p = parts.slice(0, i).join('/'); counts.set(p, (counts.get(p) || 0) + 1); } }
      for (const p of [...counts.keys()].sort()) {
        const node = { key: `localv:${p}`, label: p.split('/').pop(), count: counts.get(p), children: [], select: () => library.show({ type: 'local', path: p }) };
        byPath.set(p, node);
        (byPath.get(p.split('/').slice(0, -1).join('/')) || root).children.push(node);
      }
      library.renderTree(box, [root]);
      library.markSel();
    },
    pick() { const inp = $('#local-input'); inp.value = ''; inp.click(); },
    rows(folder, q) {
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      return this.tracks.filter((tr) => (!folder || tr.folder === folder || tr.folder.startsWith(`${folder}/`))
        && (!words.length || words.every((w) => `${tr.artist} ${tr.title} ${tr.folder}`.toLowerCase().includes(w))));
    },
    full(path) { const tr = this.tracks.find((x) => x.path === path) || {}; const m = this.meta[path] || {}; return { ...tr, ...m, cues: m.cues || [], gridStart: m.gridStart ?? null }; },
    file(path) { const f = this.files.get(path); if (!f) throw new Error(t('Fichier local introuvable : rouvre le dossier.')); return f; },
    async arrayBuffer(path) { const ab = await this.file(path).arrayBuffer(); return /\.aiff?$/i.test(path) ? aiffToWav(ab) : ab; },
    async url(path) { const f = this.file(path); return URL.createObjectURL(/\.aiff?$/i.test(path) ? new Blob([aiffToWav(await f.arrayBuffer())], { type: 'audio/wav' }) : f); }
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
      if (this._url) { URL.revokeObjectURL(this._url); this._url = null; }
      if (local.isLocal(t.path)) {
        local.url(t.path).then((u) => { if (this.path !== t.path) { URL.revokeObjectURL(u); return; } this._url = u; this.el.src = u; this.el.play().catch(() => { /* rien */ }); }).catch((e) => { toast(e.message, 'error'); this.stop(); });
      } else this.el.src = `/api/audio?path=${encodeURIComponent(t.path)}`;
      this.el.volume = Math.min(1, 0.85 * dbToGain(Math.min(0, autoGainDb(t)))); // volume harmonisé (baisse seulement : un <audio> ne monte pas au-delà de 1)
      const seekable = local.isLocal(t.path) || !/\.aiff?$/i.test(t.path); // l'AIFF du NAS est converti à la volée : pas de saut possible
      this.el.onloadedmetadata = () => { if (seekable && Number.isFinite(this.el.duration)) this.el.currentTime = this.el.duration * 0.33; };
      if (!local.isLocal(t.path)) this.el.play().catch((e) => { toast(window.I18N.t('Pré-écoute impossible : {msg}', { msg: e.message }), 'error'); this.stop(); });
      library.renderRows();
    },
    stop() {
      if (this.el) { this.el.pause(); this.el.removeAttribute('src'); this.el.load(); }
      if (this._url) { URL.revokeObjectURL(this._url); this._url = null; }
      const had = this.path; this.path = null;
      if (had) library.renderRows();
    }
  };

  function button(label, fn) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn'; b.textContent = label;
    b.addEventListener('click', (ev) => Promise.resolve(fn(ev)).catch((e) => toast(e.message, 'error')));
    return b;
  }

  // ---------- analyse de la liste (file d'attente côté serveur, progression dans la barre d'état) ----------
  let analysisTimer = null;
  async function analysisRun(rows, force) {
    const paths = (rows || []).filter((r) => !r.missing && !local.isLocal(r.path) && (force || !r.analyzed)).map((r) => r.path);
    if (!paths.length) { toast(t('Tous les morceaux de cette liste sont déjà analysés (Maj+clic pour tout recalculer).')); return; }
    if (force && paths.length > 20 && !confirm(t('Recalculer {n} morceaux ? Les grilles importées ou posées à la main ne seront pas touchées.', { n: paths.length }))) return;
    const r = await api('POST', '/api/analysis', { paths, force: Boolean(force) });
    toast(t('{n} morceaux en analyse…', { n: r.added }));
    analysisPoll();
  }
  async function analysisPoll() {
    clearTimeout(analysisTimer);
    let st;
    try { st = await api('GET', '/api/analysis'); } catch (e) { analysisTimer = setTimeout(analysisPoll, 5000); return; }
    const el = $('#status-l');
    if (st.running) {
      el.textContent = t('Analyse : {done} / {total}…', { done: st.done, total: st.total });
      el.title = (st.current || []).join('\n');
      if (st.done !== analysisPoll._last) { analysisPoll._last = st.done; if (st.done % 10 === 0) library.refreshKeep(); }
      analysisTimer = setTimeout(analysisPoll, 1500);
      return;
    }
    if (analysisPoll._last !== undefined) {
      analysisPoll._last = undefined;
      el.textContent = t('Prêt…'); el.title = '';
      const bad = st.failed ? ` ${t('({n} impossibles)', { n: st.failed })}` : '';
      toast(t('Analyse terminée : {n} morceaux', { n: st.done - st.failed }) + bad, st.failed ? 'error' : undefined);
      if (st.failed) console.warn('fadarr — analyse impossible :', st.errors);
      library.refreshKeep();
    }
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
      <label>${t('Correction supplémentaire pour les MP3 (ms)')}
        <input type="number" id="s-off" value="${Number(s.mp3OffsetMs) || 0}" step="1" min="-500" max="500">
        <span class="small muted">${t('fadarr recale déjà chaque MP3 selon son encodeur (LAME : 50 ms, ffmpeg : 25 ms, mesuré sur ta clé) pour Rekordbox et les CDJ. Laisse 0, sauf si une platine montre encore un écart. Les WAV et AIFF ne sont pas concernés.')}</span>
      </label>
      <label class="check"><input type="checkbox" id="s-ag"${s.autoGain !== false ? ' checked' : ''}> ${t('Volume harmonisé (decks et pré-écoute)')}</label>
      <label>${t('Niveau visé (LUFS)')}
        <input type="number" id="s-lufs" value="${Number.isFinite(Number(s.targetLufs)) ? Number(s.targetLufs) : -9}" step="0.5" min="-24" max="-5">
        <span class="small muted">${t('Chaque morceau analysé est ramené à ce niveau (au plus +6 dB, sans saturer). -9 convient à la musique électronique masterisée ; plus bas = marge pour les morceaux plus calmes.')}</span>
      </label>
      <label>${t('Cache')}
        <span class="cache-row"><span id="s-cache" class="small">…</span><button type="button" class="btn" id="s-cache-clear">${t('Vider')}</button></span>
        <span class="small muted">${t('Formes d’onde calculées pour la clé USB et fichiers préparés : tout se recrée au besoin (le prochain export de clé sera juste plus long).')}</span>
      </label>
      <label>${t('Taille maximale du cache (Mo)')}
        <input type="number" id="s-cache-max" value="${Number.isFinite(Number(s.cacheMaxMb)) ? Number(s.cacheMaxMb) : 2000}" step="100" min="0">
        <span class="small muted">${t('Au-delà, les fichiers les plus anciens sont effacés (au démarrage et après chaque export de clé). 0 = sans limite.')}</span>
      </label>
      <label>${t('Langue')}
        <select id="s-lang">${Object.entries(window.I18N.LANGS).map(([k, v]) => `<option value="${k}"${k === window.I18N.lang ? ' selected' : ''}>${v}</option>`).join('')}</select>
      </label>
      <div class="row"><button class="btn" value="cancel">${t('Annuler')}</button><button class="btn accent" id="s-save" value="ok">${t('Enregistrer')}</button></div>`, (root) => {
      const mb = (b) => (b >= 1024 * 1024 * 1024 ? `${(b / 1024 / 1024 / 1024).toFixed(1)} Go` : `${Math.round(b / 1024 / 1024)} Mo`);
      const showCache = (c) => { $('#s-cache', root).textContent = t('{total} — formes d’onde {cols}, clé {gen}', { total: mb(c.bytes), cols: mb(c.parts.columns.bytes), gen: mb(c.parts.gen.bytes) }); };
      api('GET', '/api/cache').then(showCache).catch(() => { $('#s-cache', root).textContent = '—'; });
      $('#s-cache-clear', root).addEventListener('click', async (ev) => {
        ev.preventDefault();
        try {
          const c = await api('DELETE', '/api/cache'); showCache(c);
          toast(t('Cache vidé : {n} libérés.', { n: mb(c.freedBytes || 0) }) + (c.keptGen ? ` ${t('(fichiers de la clé en cours gardés)')}` : ''));
        } catch (e) { toast(e.message, 'error'); }
      });
      $('#s-save', root).addEventListener('click', async (ev) => {
        ev.preventDefault();
        try { const ns = await api('PUT', '/api/settings', { macPrefix: $('#s-mac', root).value, mp3OffsetMs: Number($('#s-off', root).value), cacheMaxMb: Number($('#s-cache-max', root).value), autoGain: $('#s-ag', root).checked, targetLufs: Number($('#s-lufs', root).value) });
          srvAn.autoGain = ns.autoGain !== false; srvAn.target = Number(ns.targetLufs);
          for (const d of [decks.A, decks.B]) if (d) d.applyAutoGain(); $('#modal').close(); toast(t('Réglages enregistrés.')); if ($('#s-lang', root).value !== window.I18N.lang) window.I18N.setLang($('#s-lang', root).value); } catch (e) { toast(e.message, 'error'); }
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

  /** Lit une clé USB pour CDJ branchée sur cet ordinateur (lecture seule) et importe playlists, cues et grilles. */
  async function importUsbKey() {
    if (!window.showDirectoryPicker) {
      modal(`<h2>${t('Lecture de clé indisponible ici')}</h2>
        <p>${t('Pour lire une clé, le navigateur doit être Chrome, Edge ou Brave, et fadarr ouvert en connexion sécurisée (https) ou sur cet ordinateur (localhost).')}</p>
        <ul class="report">
          <li>${t('Le plus simple : ouvre fadarr via Tailscale en https (sur l’Unraid : « tailscale serve --bg 3010 », puis l’adresse https://…ts.net qu’il affiche).')}</li>
          <li>${t('Ou dans Chrome : chrome://flags, « Insecure origins treated as secure », ajoute l’adresse de fadarr (ex. http://192.168.1.70:3010), puis relance Chrome.')}</li>
        </ul>
        <div class="row"><button class="btn accent" value="ok">OK</button></div>`);
      return;
    }
    let dir;
    try { dir = await window.showDirectoryPicker({ id: 'fadarr-usb', mode: 'read' }); } catch (e) { return; } // annulé
    const R = window.FadarrUsbRead;
    const fileAt = async (rel) => {
      let h = dir; const parts = rel.replace(/^\/+/, '').split('/');
      for (const p of parts.slice(0, -1)) h = await h.getDirectoryHandle(p);
      return new Uint8Array(await (await (await h.getFileHandle(parts[parts.length - 1])).getFile()).arrayBuffer());
    };
    const el = $('#status-l');
    try {
      let pdbBytes;
      try { pdbBytes = await fileAt('PIONEER/rekordbox/export.pdb'); } catch (e) { throw new Error(t('Pas de PIONEER/rekordbox/export.pdb : choisis la racine d’une clé préparée pour CDJ.')); }
      const db = R.readPdb(pdbBytes);
      let done = 0; let noAnlz = 0;
      const queue = [...db.tracks];
      const work = async () => {
        while (queue.length) {
          const tr = queue.shift();
          if (tr.analyzePath) {
            try {
              const dat = await fileAt(tr.analyzePath);
              let ext = null; try { ext = await fileAt(tr.analyzePath.replace(/\.DAT$/i, '.EXT')); } catch (e) { /* pas de .EXT */ }
              tr.grid = R.gridSummary(R.readGrid(dat));
              tr.cues = R.readCues(ext || dat);
            } catch (e) { noAnlz++; }
          } else noAnlz++;
          done++;
          if (done % 10 === 0) el.textContent = t('Lecture de la clé : {done} / {total}…', { done, total: db.tracks.length });
        }
      };
      await Promise.all([work(), work(), work(), work(), work(), work()]);
      el.textContent = t('Import de la clé…');
      const res = await fetch('/api/import/usb', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Lang': window.I18N.lang }, body: JSON.stringify({ name: dir.name, tracks: db.tracks, playlists: db.playlists }) });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error || t('Erreur {status}', { status: res.status }));
      el.textContent = t('Prêt…');
      modal(`<h2>${t('Clé {name} importée', { name: esc(dir.name) })}</h2>
        <p>${t('{matched} morceaux sur {entries} retrouvés sur le NAS', { matched: `<b>${r.matched}</b>`, entries: r.entries })} · ${t('{n} playlists ({entries} entrées)', { n: `<b>${r.playlists}</b>`, entries: r.playlistTracks })}${r.playlistMissing ? `, ${t('{n} absentes du NAS', { n: r.playlistMissing })}` : ''} · ${t('{n} cues et loops importés', { n: `<b>${r.cuesImported}</b>` })}${r.keptEdited ? ` · ${t('{n} morceaux gardés tels que modifiés dans fadarr', { n: r.keptEdited })}` : ''}${noAnlz ? ` · ${t('{n} sans analyse sur la clé', { n: noAnlz })}` : ''}.</p>
        <p class="small muted">${t('Les playlists sont dans Rekordbox › Clé {name}. Les MP3 sont recalés automatiquement selon leur encodeur.', { name: esc(dir.name) })}</p>
        ${r.unmatchedCount ? `<p class="muted">${t('{n} morceaux de la clé introuvables sur le NAS', { n: r.unmatchedCount })}${r.unmatchedCount > r.unmatched.length ? ` ${t('({n} premiers)', { n: r.unmatched.length })}` : ''} :</p><ul>${r.unmatched.map((u) => `<li>${esc(u.artist ? `${u.artist} - ${u.title}` : u.file)}</li>`).join('')}</ul>` : `<p>${t('Tous les morceaux ont été retrouvés.')}</p>`}
        <div class="row"><button class="btn accent" value="ok">OK</button></div>`);
      await library.reload();
    } catch (e) { el.textContent = t('Prêt…'); toast(t('Import impossible : {msg}', { msg: e.message }), 'error'); }
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
        <label><input type="radio" name="e-fmt" value="usb"> ${t('Clé USB pour CDJ, sans Rekordbox (expérimental)')}</label>
      </div>
      <div id="e-lists">
        <div class="small muted">${t('Playlists à exporter :')}</div>
        <div class="checks">${lists.map((p) => `<label><input type="checkbox" value="${esc(p.id)}" ${p.id === cur || (!cur && p.source === 'fadarr') ? 'checked' : ''}> ${esc(srcName(p))} <span class="muted small">(${p.count})</span></label>`).join('')}</div>
      </div>
      <div id="e-usb" hidden>
        <label>${t('Nom de la clé (affiché sur la platine)')}
          <input type="text" id="e-dev" maxlength="32" spellcheck="false" value="${esc((() => { try { return localStorage.getItem('fadarr-usb-name') || 'FADARR'; } catch (e) { return 'FADARR'; } })())}">
        </label>
        <div class="small muted">${t('fadarr écrit lui-même la clé : musique, base des platines (export.pdb) et analyses (grille, hot cues et memory cues, formes d’onde en couleurs), lisibles par les CDJ-2000NXS2, CDJ-3000 et XDJ. Choisis la RACINE de la clé, formatée en FAT32 (une CDJ-2000NXS2 ne lit pas l’exFAT ; la CDJ-3000 oui). Seul ce qui a changé depuis le dernier export est réécrit.')}</div>
        <div class="small muted">${t('⚠️ Fonction expérimentale : teste la clé sur une vraie platine avant un set, et garde l’export Rekordbox en secours.')}</div>
      </div>
      <div id="e-rb">
        <label>${t('Chemin du dossier musique sur ton Mac')}
          <input type="text" id="e-mac" value="${esc(s.macPrefix)}" placeholder="/Volumes/music/Electronic" spellcheck="false">
        </label>
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
        $('#e-usb', root).hidden = fmt !== 'usb';
        $('#e-lists', root).hidden = fmt === 'nml';
        $('#e-go', root).textContent = fmt === 'nml' ? t('Télécharger collection.nml') : fmt === 'usb' ? t('Choisir la clé et l’écrire…') : t('Télécharger rekordbox.xml');
      };
      $$('input[name="e-fmt"]', root).forEach((r) => r.addEventListener('change', syncFmt));
      syncFmt();
      $('#e-go', root).addEventListener('click', async (ev) => {
        ev.preventDefault();
        if (($('input[name="e-fmt"]:checked', root) || {}).value === 'nml') { exportTraktor().catch((e) => toast(e.message, 'error')); return; }
        if (($('input[name="e-fmt"]:checked', root) || {}).value === 'usb') {
          const ids = $$('.checks input:checked', root).map((i) => i.value);
          const name = $('#e-dev', root).value.trim() || 'FADARR';
          try { localStorage.setItem('fadarr-usb-name', name); } catch (e) { /* rien */ }
          if (!ids.length) { toast(t('Coche au moins une playlist.'), 'error'); return; }
          writeUsb(ids, name).catch((e) => { if (e && e.name === 'AbortError') return; toast(e.message, 'error'); });
          return;
        }
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

  // ===========================================================================
  // CLÉ USB POUR CDJ : le serveur prépare (base + analyses), le navigateur écrit sur la clé branchée sur CET ordinateur
  // ===========================================================================
  async function writeUsb(ids, deviceName) {
    if (!window.showDirectoryPicker) {
      modal(`<h2>${t('Écriture sur clé indisponible ici')}</h2>
        <p>${t('Pour écrire sur une clé, le navigateur doit être Chrome, Edge ou Brave, et fadarr ouvert en connexion sécurisée (https) ou sur cet ordinateur (localhost).')}</p>
        <ul class="report">
          <li>${t('Le plus simple : ouvre fadarr via Tailscale en https (sur l’Unraid : « tailscale serve --bg 3010 », puis l’adresse https://…ts.net qu’il affiche).')}</li>
          <li>${t('Ou dans Chrome : chrome://flags, « Insecure origins treated as secure », ajoute l’adresse de fadarr (ex. http://192.168.1.70:3010), puis relance Chrome.')}</li>
        </ul>
        <div class="row"><button class="btn accent" value="ok">OK</button></div>`);
      return;
    }
    const dir = await window.showDirectoryPicker({ id: 'fadarr-usb', mode: 'readwrite' });
    const dirs = new Map([['', dir]]);
    const dirOf = async (rel, create) => {
      const parts = rel.split('/').slice(0, -1); let key = ''; let h = dir;
      for (const p of parts) { key = key ? `${key}/${p}` : p; if (!dirs.has(key)) dirs.set(key, await h.getDirectoryHandle(p, { create })); h = dirs.get(key); }
      return h;
    };
    const fileOf = async (rel, create) => (await dirOf(rel, create)).getFileHandle(rel.split('/').pop(), { create });
    // Manifeste du dernier export fadarr sur cette clé : seuls les fichiers encore présents comptent comme « déjà là »
    let previous = null;
    try {
      const m = JSON.parse(await (await (await fileOf('PIONEER/fadarr/manifest.json', false)).getFile()).text());
      if (m && m.files) {
        const kept = {};
        for (const [p, h] of Object.entries(m.files)) { try { await fileOf(p, false); kept[p] = h; } catch (e) { /* fichier disparu : à réécrire */ } }
        previous = { ...m, files: kept };
      }
    } catch (e) { /* clé sans export fadarr */ }
    // Une clé d'un autre logiciel (rekordbox) : on prévient avant de remplacer sa base
    if (!previous) {
      let foreign = false; try { await fileOf('PIONEER/rekordbox/export.pdb', false); foreign = true; } catch (e) { /* rien */ }
      if (foreign && !confirm(t('Cette clé contient déjà une bibliothèque (faite par Rekordbox ?). fadarr va la remplacer par la sienne : les playlists Rekordbox de cette clé ne seront plus visibles sur les platines (leurs fichiers audio restent). Continuer ?'))) return;
    }
    const box = () => $('#modal-body');
    const paint = (title, line, pct) => { const b = box(); if (!b) return; b.innerHTML = `<h2>${esc(title)}</h2><p class="small">${esc(line || '')}</p><div class="usb-bar"><i style="width:${Math.max(0, Math.min(100, pct || 0)).toFixed(1)}%"></i></div><div class="row"><button class="btn" value="cancel" id="usb-stop">${t('Arrêter')}</button></div>`; };
    const dlg = $('#modal'); if (!dlg.open) dlg.showModal();
    let stopped = false;
    dlg.addEventListener('close', () => { stopped = true; }, { once: true });
    paint(t('Préparation de la clé…'), t('Analyse des morceaux (formes d’onde, grille, cues)…'), 0);
    const { id } = await api('POST', '/api/usb/prepare', { playlists: ids, deviceName, previous });
    let st;
    for (;;) {
      await new Promise((r) => setTimeout(r, 600));
      if (stopped) return;
      st = await api('GET', `/api/usb/job/${id}`);
      if (st.error) throw new Error(st.error);
      if (st.phase === 'ready') break;
      paint(t('Préparation de la clé…'), `${st.done}/${st.total} · ${(st.current || '').split('/').pop()}`, st.total ? (st.done / st.total) * 100 : 0);
    }
    const plan = st.result;
    const total = plan.bytes || 1; let written = 0; const errors = [];
    const t0 = Date.now();
    for (const [i, f] of plan.files.entries()) {
      if (stopped) return;
      const mbs = written / 1e6 / Math.max(0.5, (Date.now() - t0) / 1000);
      paint(t('Écriture sur la clé…'), `${i + 1}/${plan.files.length} · ${f.path.split('/').pop()} · ${(written / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} Mo · ${mbs.toFixed(1)} Mo/s`, (written / total) * 100);
      try {
        const res = await fetch(`/api/usb/file?kind=${f.kind}&key=${encodeURIComponent(f.kind === 'audio' ? f.rel : f.hash)}`, { headers: { 'X-Lang': window.I18N.lang } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const w = await (await fileOf(f.path, true)).createWritable();
        await res.body.pipeTo(w);
        const size = (await (await fileOf(f.path, false)).getFile()).size;
        if (size !== f.size) throw new Error(t('taille {a} au lieu de {b}', { a: size, b: f.size }));
      } catch (e) { errors.push(`${f.path} : ${e.message}`); if (f.path.endsWith('export.pdb')) break; }
      written += f.size;
    }
    let removed = 0;
    for (const p of plan.toDelete || []) { try { await (await dirOf(p, false)).removeEntry(p.split('/').pop()); removed++; } catch (e) { /* déjà absent */ } }
    const r = plan.report;
    const warn = [];
    if (errors.length) warn.push(`<li class="bad">${t('{n} fichiers n’ont pas pu être écrits :', { n: errors.length })}<br><span class="small">${errors.slice(0, 8).map(esc).join('<br>')}</span></li>`);
    if (r.noBpm.length) warn.push(`<li class="bad">${t('{n} morceaux sans BPM : ni grille ni SYNC sur les platines. Charge-les dans fadarr et clique sur le BPM pour le poser.', { n: r.noBpm.length })}</li>`);
    if (r.noGrid) warn.push(`<li>${t('{n} morceaux ont un BPM mais pas de début de grille précis : grille posée à 0, à vérifier.', { n: r.noGrid })}</li>`);
    if (r.missing.length) warn.push(`<li>${t('{n} morceaux absents du NAS ont été ignorés.', { n: r.missing.length })}</li>`);
    for (const w of r.warnings || []) warn.push(`<li>${esc(w)}</li>`);
    modal(`<h2>${errors.length ? t('Clé écrite avec des erreurs') : t('Clé prête ✔')}</h2>
      <p>${t('{n} morceaux dans {p} playlists — {c} avec cues. {w} fichiers écrits ({mb} Mo), {u} déjà à jour, {d} retirés.', { n: `<b>${r.tracks}</b>`, p: plan.playlists, c: r.withCues, w: plan.files.length - errors.length, mb: (written / 1e6).toFixed(0), u: plan.unchanged, d: removed })}</p>
      ${warn.length ? `<ul class="report">${warn.join('')}</ul>` : `<p class="ok-line">${t('Tous les morceaux ont un BPM et une grille. ✔')}</p>`}
      <div class="small muted">${t('Éjecte la clé proprement avant de la débrancher. Avant un set : vérifie sur une platine que les playlists, la grille et les hot cues apparaissent.')}</div>
      <div class="row"><button class="btn accent" value="ok">OK</button></div>`);
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
    $('#usb-import').addEventListener('click', () => importUsbKey().catch((e) => toast(e.message, 'error')));
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
    $('#open-local').addEventListener('click', () => local.pick());
    $('#local-input').addEventListener('change', (e) => { if (e.target.files && e.target.files.length) local.load(e.target.files); });
    local.renderTree();
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
  Promise.all([api('GET', '/api/analysis').catch(() => null), api('GET', '/api/settings').catch(() => null)]).then(([st, set]) => {
    if (set) { srvAn.autoGain = set.autoGain !== false; if (Number.isFinite(Number(set.targetLufs))) srvAn.target = Number(set.targetLufs); }
    if (st && st.available) { srvAn.on = true; if (library.view) library.show(library.view).catch(() => { /* rien */ }); if (st.running) { analysisPoll._last = st.done; analysisPoll(); } }
  });
  refreshNas().then(() => library.reload()).catch((e) => toast(e.message, 'error'));
  requestAnimationFrame(frame);
  window.fadarr = { decks, library }; // pour le débogage dans la console
})();
