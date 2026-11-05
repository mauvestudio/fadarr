/**
 * Skins « matériel » : façades dessinées (public/skins/*.svg) posées sur le même moteur que les autres skins.
 * Pionarr : platine Deckarr A › table Pionarr › platine Deckarr B.
 *
 * Rien n'est dupliqué : chaque potard / fader / bouton dessiné pilote la commande existante (les <input> du mixeur,
 * les méthodes des decks), et les formes d'onde de fadarr sont déplacées dans l'écran de chaque platine.
 * La façade fixe est dessinée une fois ; seules les pièces mobiles (dessus des potards, curseurs, LED, plateau) bougent.
 */
(function () {
  'use strict';

  const FILES = { deckarr: '/skins/deckarr.svg', pionarr: '/skins/pionarr.svg', xonarr: '/skins/xonarr.svg' };
  // tables : taille du dessin (viewBox) et hauteur affichée (unités des platines, 1260 = hauteur d'une platine)
  const MIXERS = { pionarr: { w: 893, h: 1178, show: 1178 }, xonarr: { w: 694, h: 1410, show: 1260 } };
  const DECK_VB = { w: 900, h: 1260 };
  // chaque skin : ses platines et sa table ; Technicarr = platines vinyle (canvas, public/technicarr.js) autour de la Xonarr
  const SKIN = { pionarr: { mixer: 'pionarr' }, xonarr: { mixer: 'xonarr' }, technicarr: { mixer: 'xonarr', vinyl: true } };
  const TT = { w: 1000, h: 760, strip: 78 }; // platine vinyle : plinthe + bandeau d'infos au-dessus
  const mixerOf = (name) => (SKIN[name] || {}).mixer || name;
  let tts = [];
  const cache = {};
  const svgText = (url) => { if (!cache[url]) cache[url] = fetch(url).then((r) => { if (!r.ok) throw new Error(`Skin introuvable (${url})`); return r.text(); }); return cache[url]; };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let mounted = null; let raf = 0; let A = null;
  let ctls = []; let moved = []; let st = {};

  // ---------------------------------------------------------------------------
  // Commandes « valeur » (potards, faders) : reliées à un <input type=range> existant
  // ---------------------------------------------------------------------------

  /** Fraction 0..1 d'un <input>, avec le neutre (data-def) au centre pour les potards bipolaires (EQ -26..+6 : 0 dB à midi). */
  function fracOf(inp) {
    const min = Number(inp.min); const max = Number(inp.max); const v = Number(inp.value); const def = Number(inp.dataset.def);
    if (inp.dataset.center === '1' && def > min && def < max) return v < def ? 0.5 * (v - min) / (def - min) : 0.5 + 0.5 * (v - def) / (max - def);
    return (v - min) / (max - min);
  }
  function setFrac(inp, f) {
    f = Math.max(0, Math.min(1, f));
    const min = Number(inp.min); const max = Number(inp.max); const def = Number(inp.dataset.def);
    let v = inp.dataset.center === '1' && def > min && def < max ? (f < 0.5 ? min + (def - min) * (f / 0.5) : def + (max - def) * ((f - 0.5) / 0.5)) : min + (max - min) * f;
    const step = Number(inp.step) || 0.01; v = Math.round(v / step) * step;
    if (Math.abs(v - def) < step * 0.75) v = def; // aimanté sur le neutre
    if (String(v) === inp.value) return;
    inp.value = v;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    if (inp._draw) inp._draw();
  }
  /** Fausse « entrée » pour PARAMETER (Sound Color FX), qui n'a pas d'<input> dans les autres skins. */
  const paramInput = () => ({ min: 0, max: 1, step: 0.01, dataset: { def: '0.5', center: '' }, get value() { return String(A.soundColor.param); }, set value(v) { A.soundColor.setParam(Number(v)); }, dispatchEvent() {} });

  /** Fausse « entrée » sur une valeur qui n'a pas d'<input> dans les autres skins. */
  const fake = (min, max, def, step, center, get, setv) => ({ min, max, step, dataset: { def: String(def), center: center ? '1' : '' }, get value() { return String(get()); }, set value(v) { setv(Number(v)); }, dispatchEvent() {} });

  function mixerInput(ctl) {
    let m = /^ch([12])-(trim|hi|mid|low|color|fader)$/.exec(ctl);
    if (m) {
      const id = m[1] === '1' ? 'A' : 'B';
      const p = { trim: 'trim', hi: 'high', mid: 'mid', low: 'low', color: 'filter', fader: 'fader' }[m[2]];
      const inp = p === 'fader' ? $(`.ch[data-ch="${id}"] .vfader`) : $(`.ch[data-ch="${id}"] input[data-p="${p}"]`);
      if (inp && p !== 'fader') inp.dataset.center = '1';
      return inp;
    }
    // Xonarr : EQ 4 bandes (LO MID = médium existant, HI MID = 4e bande), gain
    m = /^ch([12])-(gain|himid|lomid)$/.exec(ctl);
    if (m) {
      const id = m[1] === '1' ? 'A' : 'B';
      if (m[2] === 'himid') { const d = A.decks[id]; return fake(-26, 6, 0, 0.5, true, () => d.hmidDb || 0, (v) => { d.hmidDb = v; d.setParam('hmid', v); }); }
      const inp = $(`.ch[data-ch="${id}"] input[data-p="${m[2] === 'gain' ? 'trim' : 'mid'}"]`);
      if (inp) inp.dataset.center = '1';
      return inp;
    }
    // Xonarr : réglages des deux filtres (RES, FREQ, CRUNCH)
    m = /^f([12])-(res|freq|crunch)$/.exec(ctl);
    if (m) { const X = window.FadarrXone.state; const u = X.units[m[1]]; return fake(0, 1, m[2] === 'freq' ? 0.5 : 0, 0.01, false, () => u[m[2]], (v) => { u[m[2]] = v; X.sync(); }); }
    if (ctl === 'xfader') { const x = $('#xfader'); if (x) x.dataset.center = ''; return x; }
    if (ctl === 'master') return $('#master');
    if (ctl === 'scfx-param') return paramInput();
    return null;
  }

  // ---------------------------------------------------------------------------
  // Montage
  // ---------------------------------------------------------------------------

  async function mount(name) {
    A = window.fadarrApp;
    if (!A) return; // l'appli finit de démarrer : elle rappellera mount()
    if (mounted === name) return;
    unmount();
    const cfg = SKIN[name] || { mixer: name }; const mixName = cfg.mixer;
    const [deckSvg, mixSvg] = await Promise.all([cfg.vinyl ? '' : svgText(FILES.deckarr), svgText(FILES[mixName])]);
    const stage = $('#hw-stage');
    if (cfg.vinyl) {
      const tt = (id) => `<div class="hw-unit hw-tt" data-deck="${id}"><div class="tt-strip"><span class="tt-letter${id === 'B' ? ' b' : ''}">${id}</span><div class="tt-tt"><div class="tt-title"></div><div class="tt-artist"></div></div><div class="tt-key"></div><div class="tt-num"><small>BPM</small><b class="tt-bpm"></b></div><div class="tt-num tt-clock"><small class="tt-tlab">REMAIN</small><b class="tt-time"></b></div><div class="tt-over"></div></div><canvas class="tt-canvas"></canvas></div>`;
      stage.innerHTML = `<div class="hw-row hw-row-tt">${tt('A')}<div class="hw-unit hw-mixer hw-${mixName}" style="height: calc(${TT.h + TT.strip}px * var(--s))">${mixSvg}</div>${tt('B')}</div>`;
    } else stage.innerHTML = `<div class="hw-row">
      <div class="hw-unit hw-deck" data-deck="A">${deckSvg}<div class="hw-screen"></div><span class="hw-letter">A</span></div>
      <div class="hw-unit hw-mixer hw-${mixName}" style="height: calc(${MIXERS[mixName].show}px * var(--s))">${mixSvg}</div>
      <div class="hw-unit hw-deck" data-deck="B">${deckSvg}<div class="hw-screen"></div><span class="hw-letter b">B</span></div>
    </div>`;
    $$('svg', stage).forEach((s) => { s.removeAttribute('width'); s.removeAttribute('height'); });
    stage.hidden = false;
    document.body.classList.add('hw');
    mounted = name;
    st = { remain: { A: true, B: true }, vinyl: { A: true, B: true }, meters: {}, last: new Map() };
    buildScreens(stage);
    bindControls(stage);
    if (cfg.vinyl) buildTurntables(stage);
    fit();
    window.addEventListener('resize', fit);
    raf = requestAnimationFrame(tick);
  }

  function unmount() {
    if (!mounted) return;
    cancelAnimationFrame(raf); raf = 0;
    window.removeEventListener('resize', fit);
    for (const t of tts) t.destroy(); tts = [];
    for (const m of moved) { if (m.next && m.next.parentNode === m.parent) m.parent.insertBefore(m.el, m.next); else m.parent.appendChild(m.el); }
    moved = [];
    const stage = $('#hw-stage'); stage.hidden = true; stage.innerHTML = '';
    document.body.classList.remove('hw');
    if (mixerOf(mounted) === 'xonarr') resetXone();
    ctls = []; mounted = null;
  }

  /** Taille : les trois appareils côte à côte, aussi grands que possible en laissant de la place à la bibliothèque. */
  function fit() {
    const stage = $('#hw-stage'); const row = $('.hw-row', stage); if (!row) return;
    const head = $('header.top'); const foot = $('footer.status');
    const availH = window.innerHeight - (head ? head.offsetHeight : 0) - (foot ? foot.offsetHeight : 0) - 230; // ~5 lignes de bibliothèque
    const availW = stage.clientWidth - 16;
    const mx = MIXERS[mixerOf(mounted)] || MIXERS.pionarr;
    let s;
    if ((SKIN[mounted] || {}).vinyl) { const h = TT.h + TT.strip; s = Math.max(0.2, Math.min(availH / h, availW / (TT.w * 2 + mx.w * h / mx.h + 30))); }
    else s = Math.max(0.25, Math.min(availH / DECK_VB.h, availW / (DECK_VB.w * 2 + mx.w * mx.show / mx.h + 30)));
    row.style.setProperty('--s', s);
    for (const t of tts) t.resize();
  }

  /** Écrans des platines : vraies formes d'onde de fadarr + infos du morceau, à la place de l'aperçu dessiné. */
  function buildScreens(stage) {
    for (const unit of $$('.hw-deck', stage)) {
      const id = unit.dataset.deck; const d = A.decks[id];
      const g = $('[data-ctl="screen"]', unit);
      const x = Number(g.dataset.x); const y = Number(g.dataset.y); const w = Number(g.dataset.w); const h = Number(g.dataset.h);
      g.style.display = 'none';
      const scr = $('.hw-screen', unit);
      Object.assign(scr.style, { left: `${(x / DECK_VB.w) * 100}%`, top: `${(y / DECK_VB.h) * 100}%`, width: `${(w / DECK_VB.w) * 100}%`, height: `${(h / DECK_VB.h) * 100}%` });
      scr.innerHTML = `<div class="hs-top"><span class="hs-src">${d.track && A.local.isLocal(d.track.path) ? 'USB' : 'NAS'}</span><div class="hs-tt"><div class="hs-title"></div><div class="hs-artist"></div></div><div class="hs-key"></div></div>
        <div class="hs-zoom"></div>
        <div class="hs-info"><div class="hs-box"><small>PLAYER</small><b>${id === 'A' ? 1 : 2}</b></div><div class="hs-time"><small class="hs-tlab">REMAIN</small><b></b></div><div class="hs-tempo"><small class="hs-range">TEMPO ±8</small><b></b></div><div class="hs-bpm"><small>BPM</small><b></b></div></div>
        <div class="hs-over"></div>`;
      for (const [el, slot] of [[d.zoomEl, '.hs-zoom'], [d.overEl, '.hs-over']]) {
        moved.push({ el, parent: el.parentNode, next: el.nextSibling });
        $(slot, scr).appendChild(el);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Commandes
  // ---------------------------------------------------------------------------

  function deckOf(el) { const u = el.closest('.hw-deck'); return u ? A.decks[u.dataset.deck] : null; }

  function bindControls(stage) {
    ctls = [];
    // potards et faders de la table
    for (const el of $$('.hw-mixer [data-ctl]', stage)) {
      const ctl = el.dataset.ctl; const inp = mixerInput(ctl);
      if (!inp) continue;
      const kind = el.classList.contains('knob') ? 'knob' : el.classList.contains('xfader') ? 'xfader' : el.classList.contains('fader') ? 'fader' : null;
      if (!kind) continue;
      const c = { el, inp, kind, ctl };
      if (kind === 'knob') { c.cx = Number(el.dataset.cx); c.cy = Number(el.dataset.cy); c.rot = $('.rot', el); }
      else { c.cap = $('.cap', el); c.len = Number(el.dataset.len) || (Number(el.dataset.x1) - Number(el.dataset.x0)); }
      ctls.push(c);
      dragValue(c);
    }
    // fader de tempo des platines
    for (const el of $$('.hw-deck [data-ctl="tempo"]', stage)) {
      const d = deckOf(el); const inp = $('.d-pitch', d.el);
      const c = { el, inp, kind: 'tempo', ctl: 'tempo', cap: $('.cap', el), len: Number(el.dataset.len), d };
      ctls.push(c); dragValue(c);
      el.addEventListener('dblclick', () => { inp.value = 0; inp.dispatchEvent(new Event('input', { bubbles: true })); });
    }
    // boutons
    for (const el of $$('[data-ctl]', stage)) {
      if (el.classList.contains('knob') || el.classList.contains('fader') || el.classList.contains('xfader')) continue;
      const ctl = el.dataset.ctl;
      if (['screen', 'jog', 'jog-display', 'tempo'].includes(ctl) || /meter|master-[lr]/.test(ctl)) continue;
      el.style.cursor = 'pointer';
      el.addEventListener('pointerdown', (ev) => { ev.preventDefault(); el.classList.add('hw-press'); press(el, ctl, ev); });
      el.addEventListener('pointerup', () => el.classList.remove('hw-press'));
      el.addEventListener('pointerleave', () => el.classList.remove('hw-press'));
      el.addEventListener('contextmenu', (ev) => { ev.preventDefault(); if (/^hot-/.test(ctl)) { const d = deckOf(el); d.padClick(Number(ctl.slice(4)), { shiftKey: true, type: 'contextmenu', preventDefault() {} }); } });
    }
    // sélecteur rotatif : tourner = défiler dans la bibliothèque, appuyer = charger
    for (const el of $$('.hw-deck [data-ctl="rotary"]', stage)) {
      el.addEventListener('wheel', (ev) => { ev.preventDefault(); A.library.moveSel(ev.deltaY > 0 ? 1 : -1); }, { passive: false });
      let drag = null;
      el.addEventListener('pointerdown', (ev) => { drag = { y: ev.clientY, acc: 0, moved: false }; el.setPointerCapture(ev.pointerId); });
      el.addEventListener('pointermove', (ev) => { if (!drag) return; const dy = ev.clientY - drag.y; drag.y = ev.clientY; drag.acc += dy; while (Math.abs(drag.acc) >= 14) { A.library.moveSel(drag.acc > 0 ? 1 : -1); drag.acc -= Math.sign(drag.acc) * 14; drag.moved = true; } });
      el.addEventListener('pointerup', () => { const was = drag; drag = null; if (was && !was.moved) loadSelected(deckOf(el)); });
    }
    // plateau (jog)
    for (const el of $$('.hw-deck [data-ctl="jog"]', stage)) jog(el, deckOf(el));
  }

  function loadSelected(d) {
    const sel = A.library.selected();
    if (!sel) { A.toast(A.t('Sélectionne un morceau dans la liste (tourne le sélecteur), puis appuie dessus pour le charger.')); return; }
    if (sel.missing) { A.toast(A.t('Ce morceau est absent.')); return; }
    if (d.playing && !confirm(A.t('La platine {id} joue : charger quand même ?', { id: d.id }))) return;
    d.load(sel);
  }

  const SCFX = { 'scfx-space': 'space', 'scfx-dubecho': 'dubecho', 'scfx-crush': 'crush', 'scfx-sweep': 'sweep', 'scfx-noise': 'noise', 'scfx-filter': 'filter' };

  /** En quittant la Xonarr : filtres coupés, 4e bande à 0 dB, crossfader remis A à gauche / B à droite (rien ne reste caché). */
  function resetXone() {
    const X = window.FadarrXone.state; X.units[1].on = false; X.units[2].on = false; X.assign.A = 0; X.assign.B = 0; X.sync();
    for (const id of ['A', 'B']) { const d = A.decks[id]; d.hmidDb = 0; d.setParam('hmid', 0); }
    A.setXfAssign('A', 'X'); A.setXfAssign('B', 'Y');
  }

  /** Inverseur 3 positions : un clic à gauche du levier le pousse d'un cran à gauche, à droite d'un cran à droite. */
  function nudge(el, ev, cur) {
    const m = el.ownerSVGElement.getScreenCTM(); const p = el.ownerSVGElement.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
    const q = p.matrixTransform(m.inverse());
    return Math.max(-1, Math.min(1, cur + (q.x < Number(el.dataset.cx) ? -1 : 1)));
  }
  const FILT_POS = { 1: -1, 0: 0, 2: 1 }; const POS_FILT = { '-1': 1, 0: 0, 1: 2 };
  const XFA_POS = { X: -1, OFF: 0, Y: 1 }; const POS_XFA = { '-1': 'X', 0: 'OFF', 1: 'Y' };

  function press(el, ctl, ev) {
    if (SCFX[ctl]) { const m = SCFX[ctl]; A.soundColor.setMode(A.soundColor.mode === m ? 'none' : m); return; }
    let m = /^f([12])-(hpf|bpf|lpf|on)$/.exec(ctl);
    if (m) {
      const X = window.FadarrXone.state; const u = X.units[m[1]];
      if (m[2] === 'on') u.on = !u.on; else { u.mode = m[2]; u.on = true; } // choisir un type allume aussi le filtre
      X.sync(); return;
    }
    m = /^ch([12])-(filt|xfa)$/.exec(ctl);
    if (m) {
      const id = m[1] === '1' ? 'A' : 'B';
      if (m[2] === 'filt') { const X = window.FadarrXone.state; X.assign[id] = POS_FILT[nudge(el, ev, FILT_POS[X.assign[id]])]; X.sync(); }
      else A.setXfAssign(id, POS_XFA[nudge(el, ev, XFA_POS[A.xfAssign[id]])]);
      return;
    }
    const d = deckOf(el); if (!d) return;
    const beat = d.bpm ? 60 / (d.bpm) : 0.5;
    const memories = () => (d.cues || []).filter((c) => c.kind === 'memory').map((c) => c.start).sort((a, b) => a - b);
    switch (ctl) {
      case 'play': d.toggle(); break;
      case 'cue': d.cue(); break;
      case 'loop-in': d.loopAction('in'); break;
      case 'loop-out': d.loopAction('out'); break;
      case 'reloop': d.loopAction('exit'); break;
      case 'beatloop-4': d.loopAction('b:4'); break;
      case 'beatloop-8': d.loopAction('b:8'); break;
      case 'jump-back': if (d.buffer) d.seek(Math.max(0, d.position - 4 * beat)); break;
      case 'jump-fwd': if (d.buffer) d.seek(Math.min(d.duration, d.position + 4 * beat)); break;
      case 'search-back': if (d.buffer) d.seek(Math.max(0, d.position - 2)); break;
      case 'search-fwd': if (d.buffer) d.seek(Math.min(d.duration, d.position + 2)); break;
      case 'prev': if (d.buffer) d.seek(d.position > 2 ? 0 : 0); break;
      case 'memory': d.loopAction('memcue'); break;
      case 'call-prev': { const p = memories().filter((s) => s < d.position - 0.25).pop(); if (p !== undefined) d.seek(p); break; }
      case 'call-next': { const p = memories().find((s) => s > d.position + 0.25); if (p !== undefined) d.seek(p); break; }
      case 'sync': $('.d-sync', d.el).click(); break;
      case 'tempo-range': $('.d-range', d.el).click(); break;
      case 'tempo-reset': { const p = $('.d-pitch', d.el); p.value = 0; p.dispatchEvent(new Event('input', { bubbles: true })); break; }
      case 'time-mode': st.remain[d.id] = !st.remain[d.id]; break;
      case 'vinyl': st.vinyl[d.id] = !st.vinyl[d.id]; break;
      case 'nav-browse': A.library.moveSel(0); document.querySelector('.table-wrap')?.focus(); break;
      default:
        if (/^hot-\d$/.test(ctl)) d.padClick(Number(ctl.slice(4)), ev);
    }
  }

  /** Potard / fader : glisser (vertical, horizontal pour le crossfader), molette, double-clic = neutre. */
  function dragValue(c) {
    const el = c.el;
    el.style.cursor = c.kind === 'xfader' ? 'ew-resize' : 'ns-resize';
    let drag = null;
    const scale = () => { const m = el.ownerSVGElement.getScreenCTM(); return m ? m.a : 1; };
    const get = () => (c.kind === 'tempo' ? (Number(c.inp.value) - Number(c.inp.min)) / (Number(c.inp.max) - Number(c.inp.min)) : fracOf(c.inp));
    const set = (f) => {
      if (c.kind === 'tempo') { const min = Number(c.inp.min); const max = Number(c.inp.max); c.inp.value = Math.round((min + (max - min) * Math.max(0, Math.min(1, f))) * 100) / 100; c.inp.dispatchEvent(new Event('input', { bubbles: true })); return; }
      setFrac(c.inp, f);
    };
    el.addEventListener('pointerdown', (ev) => { ev.preventDefault(); drag = { x: ev.clientX, y: ev.clientY, f: get(), s: scale(), fine: ev.shiftKey }; el.setPointerCapture(ev.pointerId); });
    el.addEventListener('pointermove', (ev) => {
      if (!drag) return;
      const k = drag.fine || ev.shiftKey ? 0.25 : 1;
      let f = drag.f;
      if (c.kind === 'knob') f -= ((ev.clientY - drag.y) / 180) * k;
      else if (c.kind === 'xfader') f += ((ev.clientX - drag.x) / (c.len * drag.s)) * k;
      else if (c.kind === 'tempo') f += ((ev.clientY - drag.y) / (c.len * drag.s)) * k; // vers soi = plus vite (+ en bas), comme sur une platine
      else f -= ((ev.clientY - drag.y) / (c.len * drag.s)) * k;
      set(f);
    });
    el.addEventListener('pointerup', () => { drag = null; });
    el.addEventListener('wheel', (ev) => { ev.preventDefault(); set(get() + (ev.deltaY < 0 ? 1 : -1) * (c.kind === 'tempo' ? 0.0025 : 0.02)); }, { passive: false });
    if (c.kind !== 'tempo') el.addEventListener('dblclick', () => { if (c.inp.dataset.center === '1' || c.kind === 'xfader') set(0.5); else if (c.inp.dataset && c.inp.dataset.def) { const def = Number(c.inp.dataset.def); set((def - Number(c.inp.min)) / (Number(c.inp.max) - Number(c.inp.min))); } });
  }

  /** Plateau : à l'arrêt on se déplace dans le morceau (scratch), en lecture on pousse / freine le tempo (pitch bend). */
  function jog(el, d) {
    el.style.cursor = 'grab';
    const cx = Number(el.dataset.cx); const cy = Number(el.dataset.cy);
    let drag = null;
    const angle = (ev) => {
      const m = el.ownerSVGElement.getScreenCTM(); const p = el.ownerSVGElement.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
      const q = p.matrixTransform(m.inverse()); return Math.atan2(q.y - cy, q.x - cx) * 180 / Math.PI;
    };
    el.addEventListener('pointerdown', (ev) => { if (!d.buffer) return; ev.preventDefault(); drag = { a: angle(ev), t: performance.now(), bend: 0 }; el.setPointerCapture(ev.pointerId); el.style.cursor = 'grabbing'; });
    el.addEventListener('pointermove', (ev) => {
      if (!drag) return;
      const a = angle(ev); let da = a - drag.a; if (da > 180) da -= 360; if (da < -180) da += 360; drag.a = a;
      const now = performance.now(); const dt = Math.max(1, now - drag.t) / 1000; drag.t = now;
      if (!d.playing) { d.seek(Math.max(0, Math.min(d.duration, d.position + (da / 360) * 1.8))); return; } // à l'arrêt : un tour = 1,8 s
      // pitch bend : vitesse de rotation -> ±10 % au plus, position corrigée au lâcher
      const bend = Math.max(-0.1, Math.min(0.1, (da / dt) / 3600));
      if (d.source) { d.source.playbackRate.value = d.rate * (1 + bend); drag.extra = (drag.extra || 0) + bend * d.rate * dt; }
    });
    const end = () => {
      if (!drag) return;
      if (d.source) { d.source.playbackRate.value = d.rate; d.offset += drag.extra || 0; }
      drag = null; el.style.cursor = 'grab';
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (ev) => { if (!d.buffer) return; ev.preventDefault(); d.seek(Math.max(0, Math.min(d.duration, d.position + (ev.deltaY > 0 ? 0.02 : -0.02)))); }, { passive: false });
  }

  // ---------------------------------------------------------------------------
  // Affichage (à chaque image, uniquement ce qui change)
  // ---------------------------------------------------------------------------

  const setOnce = (key, v, fn) => { if (st.last.get(key) === v) return; st.last.set(key, v); fn(v); };
  const toggle = (el, cls, on) => { if (el && el.classList.contains(cls) !== on) el.classList.toggle(cls, on); };

  function tick(now) {
    if (!mounted) return;
    raf = requestAnimationFrame(tick);
    const dt = st.prev ? Math.min(0.1, (now - st.prev) / 1000) : 0.016; st.prev = now;
    // potards, faders
    for (const c of ctls) {
      if (c.kind === 'knob') setOnce(c, fracOf(c.inp), (f) => c.rot.setAttribute('transform', `rotate(${(-150 + 300 * f).toFixed(1)} ${c.cx} ${c.cy})`));
      else if (c.kind === 'fader') setOnce(c, fracOf(c.inp), (f) => c.cap.setAttribute('transform', `translate(0 ${((1 - f) * c.len).toFixed(1)})`));
      else if (c.kind === 'xfader') setOnce(c, fracOf(c.inp), (f) => c.cap.setAttribute('transform', `translate(${((f - 0.5) * c.len).toFixed(1)} 0)`));
      else if (c.kind === 'tempo') { const f = (Number(c.inp.value) - Number(c.inp.min)) / (Number(c.inp.max) - Number(c.inp.min)); setOnce(c, f, (v) => c.cap.setAttribute('transform', `translate(0 ${((v - 0.5) * c.len).toFixed(1)})`)); }
    }
    const stage = $('#hw-stage');
    // Sound Color FX allumé
    for (const [ctl, m] of Object.entries(SCFX)) toggle($(`.hw-mixer [data-ctl="${ctl}"]`, stage), 'hw-on', A.soundColor.mode === m);
    if (mixerOf(mounted) === 'xonarr') xoneLights(stage);
    if (tts.length) ttTick(now);
    // vu-mètres
    let masterPk = 0;
    for (const [n, id] of [['1', 'A'], ['2', 'B']]) {
      const d = A.decks[id]; let pk = 0;
      if (d.analyser) { const arr = st.buf || (st.buf = new Uint8Array(d.analyser.fftSize)); d.analyser.getByteTimeDomainData(arr); for (const v of arr) { const a = Math.abs(v - 128) / 128; if (a > pk) pk = a; } }
      masterPk = Math.max(masterPk, pk);
      meter(`ch${n}-meter`, pk, dt);
    }
    meter('master-l', masterPk, dt); meter('master-r', masterPk * 0.98, dt);
    // platines
    for (const unit of $$('.hw-deck', stage)) {
      const d = A.decks[unit.dataset.deck]; const tr = d.track;
      // plateau : 33 1/3 tours/min
      const plat = st[`plat${d.id}`] || (st[`plat${d.id}`] = $('.platter', unit));
      if (plat) setOnce(`p${d.id}`, Math.round(((d.position || 0) * 200) % 360 * 2) / 2, (a) => plat.setAttribute('transform', `rotate(${a} ${plat.dataset.cx} ${plat.dataset.cy})`));
      toggle($('[data-ctl="play"]', unit), 'hw-blink', !d.playing && Boolean(d.buffer));
      toggle($('[data-ctl="play"]', unit), 'hw-off', !d.buffer);
      toggle($('[data-ctl="cue"]', unit), 'hw-blink', !d.playing && Boolean(d.buffer) && Math.abs(d.position - d.mainCue) > 0.05);
      toggle($('[data-ctl="reloop"]', unit), 'hw-off', !(d.loop && d.loop.active));
      toggle($('[data-ctl="sync"]', unit), 'hw-on', Boolean(d.synced));
      toggle($('[data-ctl="master"]', unit), 'hw-off', A.refDeck !== d);
      toggle($('[data-ctl="vinyl"]', unit), 'hw-off', !st.vinyl[d.id]);
      for (let n = 0; n < 8; n++) toggle($(`[data-ctl="hot-${n}"]`, unit), 'hw-off', !(d.cues || []).some((c) => c.num === n && c.kind !== 'memory'));
      // écran
      const scr = $('.hw-screen', unit);
      setOnce(`t${d.id}`, tr ? tr.title || '' : '', (v) => { $('.hs-title', scr).textContent = v || A.t('Charge un morceau : sélecteur ou glisser-déposer'); });
      setOnce(`a${d.id}`, tr ? tr.artist || '' : '', (v) => { $('.hs-artist', scr).textContent = v; });
      setOnce(`s${d.id}`, tr && A.local.isLocal(tr.path) ? 'USB' : 'NAS', (v) => { $('.hs-src', scr).textContent = v; });
      setOnce(`k${d.id}`, tr ? tr.key || '' : '', (v) => { const k = $('.hs-key', scr); k.textContent = v ? A.showKey(v) : ''; k.style.color = v ? A.keyColor(v) || '#fff' : ''; });
      const rem = st.remain[d.id];
      const tv = d.buffer ? (rem ? A.fmt(-(d.duration - d.position) / d.rate, true) : A.fmt(d.position, true)) : '--:--';
      setOnce(`tm${d.id}`, `${rem}|${tv}`, () => { $('.hs-time b', scr).textContent = tv; $('.hs-tlab', scr).textContent = rem ? 'REMAIN' : 'ELAPSED'; });
      const pct = (d.rate - 1) * 100;
      setOnce(`tp${d.id}`, `${pct.toFixed(2)}|${d.range}`, () => { $('.hs-tempo b', scr).textContent = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`; $('.hs-range', scr).textContent = `TEMPO ±${d.range}`; });
      setOnce(`bp${d.id}`, d.bpm ? (d.bpm * d.rate).toFixed(1) : '—', (v) => { $('.hs-bpm b', scr).textContent = v; });
    }
  }

  /** Technicarr : une platine vinyle par deck ; la forme d'onde générale du deck passe dans le bandeau au-dessus. */
  function buildTurntables(stage) {
    tts = [];
    for (const unit of $$('.hw-tt', stage)) {
      const d = A.decks[unit.dataset.deck];
      moved.push({ el: d.overEl, parent: d.overEl.parentNode, next: d.overEl.nextSibling });
      $('.tt-over', unit).appendChild(d.overEl);
      $('.tt-clock', unit).addEventListener('click', () => { st.remain[d.id] = !st.remain[d.id]; });
      tts.push(new window.FadarrTechnicarr.Turntable(unit, d, A));
    }
  }
  function ttTick(now) {
    for (const t of tts) {
      t.frame(now);
      const d = t.d; const unit = t.unit; const tr = d.track; const id = d.id;
      setOnce(`tt${id}`, tr ? tr.title || '' : '', (v) => { $('.tt-title', unit).textContent = v || A.t('Charge un morceau depuis la bibliothèque (A / B)'); });
      setOnce(`ta${id}`, tr ? tr.artist || '' : '', (v) => { $('.tt-artist', unit).textContent = v; });
      setOnce(`tk${id}`, tr ? tr.key || '' : '', (v) => { const k = $('.tt-key', unit); k.textContent = v ? A.showKey(v) : ''; k.style.color = v ? A.keyColor(v) || '#fff' : ''; });
      const rem = st.remain[id];
      const tv = d.buffer ? (rem ? A.fmt(-(d.duration - d.position) / d.rate, true) : A.fmt(d.position, true)) : '--:--';
      setOnce(`tm${id}`, `${rem}|${tv}`, () => { $('.tt-time', unit).textContent = tv; $('.tt-tlab', unit).textContent = rem ? 'REMAIN' : 'ELAPSED'; });
      setOnce(`bp${id}`, d.bpm ? (d.bpm * d.rate * (t.S.rpm / 33.3333)).toFixed(1) : '—', (v) => { $('.tt-bpm', unit).textContent = v; });
    }
  }

  /** Xonarr : anneaux des touches de filtre et position des inverseurs. */
  function xoneLights(stage) {
    const X = window.FadarrXone.state;
    for (const n of ['1', '2']) {
      const u = X.units[n];
      for (const k of ['hpf', 'bpf', 'lpf', 'on']) ring(stage, `f${n}-${k}`, k === 'on' ? u.on : u.mode === k);
    }
    const xa = A.xfAssign;
    for (const [n, id] of [['1', 'A'], ['2', 'B']]) {
      lever(stage, `ch${n}-filt`, FILT_POS[X.assign[id]]);
      lever(stage, `ch${n}-xfa`, XFA_POS[xa[id]]);
    }
  }
  function ring(stage, ctl, on) {
    setOnce(`r${ctl}`, on, () => {
      const g = $(`.hw-mixer [data-ctl="${ctl}"]`, stage); if (!g) return;
      const r = $('.ring', g); const glow = $('.glow', g);
      r.setAttribute('stroke', on ? r.dataset.col : '#111'); if (glow) glow.setAttribute('opacity', on ? '0.45' : '0');
    });
  }
  function lever(stage, ctl, pos) {
    setOnce(`l${ctl}`, pos, () => {
      const g = $(`.hw-mixer [data-ctl="${ctl}"]`, stage); if (!g) return;
      $('.lever', g).setAttribute('transform', `rotate(${pos * 35} ${g.dataset.cx} ${g.dataset.cy})`);
    });
  }

  /** Vu-mètre de 16 LED : 0 dBFS du signal ≈ +6 sur la graduation (comme une table qui a de la marge), retombée douce. */
  function meter(ctl, pk, dt) {
    const db = pk > 0 ? 20 * Math.log10(pk) + 6 : -60;
    const prev = st.meters[ctl] ?? -60;
    const lvl = db > prev ? db : Math.max(db, prev - 24 * dt);
    st.meters[ctl] = lvl;
    const lit = Math.max(0, Math.min(16, Math.floor((lvl + 33) / 3) + 1));
    setOnce(`m${ctl}`, mixerOf(mounted) === 'xonarr' ? Math.round(lvl) : lit, (n) => {
      const g = $(`.hw-mixer [data-ctl="${ctl}"]`); if (!g) return;
      // Pionarr : 16 LED numérotées (data-i) ; Xonarr : une LED par seuil en dB (data-db), éteinte = LED noire
      for (const r of g.querySelectorAll('.seg')) r.setAttribute('opacity', r.dataset.db !== undefined ? (lvl >= Number(r.dataset.db) ? '1' : '0.07') : Number(r.dataset.i) < n ? '1' : '0.16');
    });
  }

  window.fadarrHw = { mount: (n) => mount(n), unmount };
}());
