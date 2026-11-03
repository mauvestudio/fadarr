/**
 * Lecture d'une clé USB préparée pour CDJ (par Rekordbox ou par fadarr) : export.pdb + analyses ANLZ.
 * Fonctionne dans le navigateur (window.FadarrUsbRead) et dans Node (require), sur des Uint8Array / Buffer.
 *
 * Format : celui que fadarr écrit (src/usb/pdb.js, src/usb/anlz.js, portage de rbxport, GPL-2.0-or-later),
 * lu dans l'autre sens ; règles de lecture des cues et de la grille comme l'import Rekordbox de Mixxx
 * (src/library/rekordbox/rekordboxfeature.cpp, GPL-2.0-or-later) : grille du .DAT, cues de préférence du .EXT.
 * export.pdb est en petit-boutiste, les fichiers ANLZ en gros-boutiste.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FadarrUsbRead = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const T = { tracks: 0, genres: 1, artists: 2, albums: 3, labels: 4, keys: 5, colors: 6, playlistTree: 7, playlistEntries: 8, artwork: 13 };
  const HEADER = 0x28;
  const GROUP = 0x24;

  const u8 = (b, o) => b[o];
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  const be16 = (b, o) => (b[o] << 8) | b[o + 1];
  const be32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

  function latin1(b, start, end) { let s = ''; for (let i = start; i < end && i < b.length; i++) s += String.fromCharCode(b[i]); return s; }
  function utf16(b, start, end, big) {
    let s = '';
    for (let i = start; i + 1 < end && i + 1 < b.length; i += 2) {
      const c = big ? (b[i] << 8) | b[i + 1] : b[i] | (b[i + 1] << 8);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }

  /** Chaîne DeviceSQL à la position `o` : ASCII court (octet impair), ASCII long (0x40), UTF-16LE (0x90). */
  function dstr(b, o) {
    if (o <= 0 || o >= b.length) return '';
    const k = b[o];
    if (k & 1) return latin1(b, o + 1, o + 1 + ((k >> 1) - 1));
    const len = u16(b, o + 1);
    if (k === 0x40) return latin1(b, o + 4, o + len);
    if (k === 0x90) return utf16(b, o + 4, o + len, false).normalize('NFC');
    return '';
  }

  /** Toutes les lignes d'une table : on suit les pages de la première à la dernière ; les pages d'index sont ignorées. */
  function tableRows(b, pageSize, table) {
    const rows = [];
    if (!table) return rows;
    let page = table.first;
    const seen = new Set();
    while (!seen.has(page)) {
      seen.add(page);
      const base = page * pageSize;
      if (base + pageSize > b.length) break;
      const flags = b[base + 0x1b];
      if ((flags & 0x40) === 0) { // page de données (0x24, 0x34…) ; 0x64 = page d'index
        const packed = b[base + 0x18] | (b[base + 0x19] << 8) | (b[base + 0x1a] << 16);
        const offsets = packed & 0x1fff;
        const groups = Math.ceil(offsets / 16);
        for (let g = 0; g < groups; g++) {
          const gb = base + pageSize - g * GROUP;
          const present = u16(b, gb - 4);
          const inGroup = Math.min(16, offsets - g * 16);
          for (let r = 0; r < inGroup; r++) {
            if (!(present & (1 << r))) continue;
            const off = u16(b, gb - (6 + 2 * r));
            rows.push(base + HEADER + off);
          }
        }
      }
      if (page === table.last) break;
      page = u32(b, base + 0x0c);
    }
    return rows;
  }

  /** Lit export.pdb. Renvoie { tracks, playlists, deviceName? } avec les noms résolus. */
  function readPdb(b) {
    if (b.length < 0x40 || u32(b, 0) !== 0) throw new Error('Ce fichier n\'est pas un export.pdb.');
    const pageSize = u32(b, 4);
    const n = u32(b, 8);
    if (pageSize < 512 || pageSize > 65536 || n > 64) throw new Error('export.pdb illisible (en-tête inattendu).');
    const tables = {};
    for (let i = 0; i < n; i++) {
      const o = 0x1c + i * 16;
      tables[u32(b, o)] = { first: u32(b, o + 8), last: u32(b, o + 12) };
    }
    const named = (type, idAt, nameAt) => {
      const m = new Map();
      for (const r of tableRows(b, pageSize, tables[type])) m.set(u32(b, r + idAt), dstr(b, r + nameAt));
      return m;
    };
    const genres = named(T.genres, 0, 4);
    const labels = named(T.labels, 0, 4);
    const keys = named(T.keys, 0, 8);
    const colors = new Map();
    for (const r of tableRows(b, pageSize, tables[T.colors])) colors.set(u16(b, r + 5), dstr(b, r + 8));
    const artists = new Map();
    for (const r of tableRows(b, pageSize, tables[T.artists])) {
      const sub = u16(b, r);
      const at = sub === 0x64 ? u16(b, r + 0x0a) : u8(b, r + 9);
      artists.set(u32(b, r + 4), dstr(b, r + at));
    }
    const albums = new Map();
    for (const r of tableRows(b, pageSize, tables[T.albums])) {
      const sub = u16(b, r);
      const at = sub === 0x84 ? u16(b, r + 0x16) : u8(b, r + 0x15);
      albums.set(u32(b, r + 0x0c), dstr(b, r + at));
    }
    const s = (r, i) => dstr(b, r + u16(b, r + 0x5e + i * 2));
    const tracks = [];
    for (const r of tableRows(b, pageSize, tables[T.tracks])) {
      tracks.push({
        id: u32(b, r + 0x48),
        title: s(r, 17),
        artist: artists.get(u32(b, r + 0x44)) || '',
        album: albums.get(u32(b, r + 0x40)) || '',
        genre: genres.get(u32(b, r + 0x3c)) || '',
        label: labels.get(u32(b, r + 0x28)) || '',
        key: keys.get(u32(b, r + 0x20)) || '',
        bpm: u32(b, r + 0x38) / 100 || null,
        duration: u16(b, r + 0x54) || null,
        bitrate: u32(b, r + 0x30) || null,
        sampleRate: u32(b, r + 0x08) || null,
        fileSize: u32(b, r + 0x10) || null,
        year: u16(b, r + 0x50) || null,
        rating: u8(b, r + 0x59),
        colorId: u8(b, r + 0x58),
        color: colors.get(u8(b, r + 0x58)) || '',
        comment: s(r, 16),
        dateAdded: s(r, 10),
        filePath: s(r, 20),
        fileName: s(r, 19),
        analyzePath: s(r, 14)
      });
    }
    const nodes = new Map();
    for (const r of tableRows(b, pageSize, tables[T.playlistTree])) {
      nodes.set(u32(b, r + 12), { id: u32(b, r + 12), parentId: u32(b, r), sort: u32(b, r + 8), folder: u32(b, r + 16) !== 0, name: dstr(b, r + 20), entries: [] });
    }
    for (const r of tableRows(b, pageSize, tables[T.playlistEntries])) {
      const p = nodes.get(u32(b, r + 8));
      if (p) p.entries.push({ index: u32(b, r), trackId: u32(b, r + 4) });
    }
    const folderPath = (node) => {
      const parts = [];
      let p = nodes.get(node.parentId); const guard = new Set();
      while (p && !guard.has(p.id)) { guard.add(p.id); parts.unshift(p.name); p = nodes.get(p.parentId); }
      return parts;
    };
    const ordered = [...nodes.values()].sort((a, b2) => a.parentId - b2.parentId || a.sort - b2.sort);
    const playlists = ordered.filter((p) => !p.folder).map((p) => ({
      id: p.id, name: p.name, folder: folderPath(p).join(' / '),
      trackIds: p.entries.sort((x, y) => x.index - y.index).map((e) => e.trackId)
    }));
    return { tracks, playlists };
  }

  /** Sections d'un fichier ANLZ (.DAT / .EXT / .2EX) : [{ tag, at (début de section), headerLen, len }]. */
  function anlzSections(b) {
    if (b.length < 12 || latin1(b, 0, 4) !== 'PMAI') return [];
    const out = [];
    let o = be32(b, 4);
    while (o + 12 <= b.length) {
      const tag = latin1(b, o, o + 4);
      const lh = be32(b, o + 4); const lt = be32(b, o + 8);
      if (lt < 12 || o + lt > b.length) break;
      out.push({ tag, at: o, headerLen: lh, len: lt });
      o += lt;
    }
    return out;
  }

  /** Grille : [{ beatNumber (1-4), tempoX100, timeMs }]. */
  function readGrid(b) {
    const s = anlzSections(b).find((x) => x.tag === 'PQTZ');
    if (!s) return [];
    const n = be32(b, s.at + 20);
    const beats = [];
    for (let i = 0; i < n; i++) {
      const o = s.at + s.headerLen + i * 8;
      if (o + 8 > s.at + s.len) break;
      beats.push({ beatNumber: be16(b, o), tempoX100: be16(b, o + 2), timeMs: be32(b, o + 4) });
    }
    return beats;
  }

  /** Cues : [{ slot (0 = mémoire, 1-16 = A-P), timeMs, loopTimeMs|null, colorId, colorCode, rgb|null, comment }]. PCO2 si présent, sinon PCOB. */
  function readCues(b) {
    const secs = anlzSections(b);
    const modern = secs.filter((x) => x.tag === 'PCO2');
    const list = modern.length ? modern : secs.filter((x) => x.tag === 'PCOB');
    const cues = [];
    for (const s of list) {
      const isModern = s.tag === 'PCO2';
      const count = be16(b, s.at + (isModern ? 16 : 18));
      let o = s.at + s.headerLen;
      for (let i = 0; i < count && o + 12 <= s.at + s.len; i++) {
        const eTag = latin1(b, o, o + 4);
        const len = be32(b, o + 8);
        if ((eTag !== 'PCP2' && eTag !== 'PCPT') || len < 12) break;
        const slot = be32(b, o + 12);
        const at = isModern ? o + 16 : o + 28;
        const type = b[at];
        const timeMs = be32(b, at + 4);
        const loopRaw = be32(b, at + 8);
        const cue = { slot, timeMs, loopTimeMs: type === 2 && loopRaw !== 0xffffffff ? loopRaw : null, colorId: 0, colorCode: 0, rgb: null, comment: '' };
        if (isModern && len >= 48) {
          cue.colorId = b[o + 28];
          const cl = be32(b, o + 40);
          if (cl > 0 && o + 44 + cl <= o + len) cue.comment = utf16(b, o + 44, o + 44 + cl, true);
          const c = o + 44 + cl;
          if (c + 4 <= o + len) {
            cue.colorCode = b[c];
            if (b[c + 1] || b[c + 2] || b[c + 3]) cue.rgb = [b[c + 1], b[c + 2], b[c + 3]];
          }
        }
        if (!isModern && b[o + 16] === 0 && slot === 0 && timeMs === 0xffffffff) { o += len; continue; } // entrée vide
        cues.push(cue);
        o += len;
      }
    }
    return cues.sort((a, c) => a.timeMs - c.timeMs);
  }

  /** Grille constante d'après les temps : BPM le plus fréquent et position du premier « 1 » (secondes). */
  function gridSummary(beats) {
    if (!beats.length) return null;
    const counts = new Map();
    for (const x of beats) counts.set(x.tempoX100, (counts.get(x.tempoX100) || 0) + 1);
    const tempo = [...counts.entries()].sort((a, c) => c[1] - a[1])[0][0];
    const first = beats.find((x) => x.beatNumber === 1) || beats[0];
    const bpm = tempo / 100;
    if (!(bpm > 0)) return null;
    // premier temps (quel qu'il soit) ramené au « 1 » le plus proche du début
    const beat = 60 / bpm;
    let start = first.timeMs / 1000;
    while (start - 4 * beat >= -0.001) start -= 4 * beat;
    return { bpm, gridStart: start, variable: counts.size > 1 };
  }

  return { readPdb, anlzSections, readGrid, readCues, gridSummary, _dstr: dstr };
}));
