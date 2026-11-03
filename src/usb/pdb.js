/**
 * export.pdb : la base « DeviceSQL » que les CDJ (NXS2, CDJ-3000, XDJ…) lisent sur une clé USB.
 *
 * Portage en JavaScript du constructeur de rbxport (crates/rbl-pdb, GPL-2.0-or-later, © Chris Le et contributeurs,
 * https://github.com/chrisle/rbxport), d'après son code et sa référence du format (docs/reference/usb-export-db.md).
 * Les commentaires [OBS] renvoient aux observations faites par rbxport sur des clés écrites par rekordbox.
 *
 * Tout est en petit-boutiste. Page 0 = en-tête du fichier ; chaque table commence par une page d'index, puis ses pages de
 * données ; les lignes forment un tas qui grandit depuis 0x28, leurs positions un index qui grandit depuis la fin de page.
 */
'use strict';

const PAGE_SIZE = 4096;
const PAGE_HEADER_LEN = 0x28;
const ROW_GROUP_LEN = 0x24;
const NO_PAGE = 0x03ffffff;

/** La ligne la plus longue qu'une page accepte (une ligne ne peut pas déborder sur la page suivante). */
const maxRowLen = (pageSize = PAGE_SIZE) => pageSize - (PAGE_HEADER_LEN + ROW_GROUP_LEN + 8);

// ---------------------------------------------------------------------------
// Chaînes DeviceSQL
// ---------------------------------------------------------------------------

const isAscii = (s) => /^[\x00-\x7f]*$/.test(s);

/** ASCII court : un octet de longueur « (len+1)*2+1 », puis le texte, sans terminateur. */
function shortAscii(text) {
  const b = Buffer.from(text, 'latin1');
  return Buffer.concat([Buffer.from([Math.min(0xff, (b.length + 1) * 2 + 1)]), b]);
}

/** ASCII long : 0x40, u16 longueur (en-tête de 4 octets compris), 0x00, texte. */
function longAscii(text) {
  const b = Buffer.from(text, 'latin1');
  const h = Buffer.alloc(4); h[0] = 0x40; h.writeUInt16LE(Math.min(0xffff, 4 + b.length), 1);
  return Buffer.concat([h, b]);
}

/** UTF-16LE : 0x90, u16 longueur (en-tête compris), 0x00, texte, SANS terminateur (une CDJ-2000NXS gelait avec, #321). */
function longUtf16(text) {
  const b = Buffer.from(text, 'utf16le');
  const h = Buffer.alloc(4); h[0] = 0x90; h.writeUInt16LE(Math.min(0xffff, 4 + b.length), 1);
  return Buffer.concat([h, b]);
}

function deviceSqlString(text) {
  const s = String(text ?? '');
  if (isAscii(s)) return s.length < 0x7e ? shortAscii(s) : longAscii(s);
  return longUtf16(s);
}

/**
 * Ajoute une chaîne à une ligne comme rekordbox : une chaîne longue (ASCII long ou UTF-16) commence sur un multiple de 4
 * de la ligne, des zéros comblent l'écart. Renvoie la position de la chaîne dans la ligne.
 */
function pushString(row, text) {
  const enc = deviceSqlString(text);
  if (enc[0] === 0x40 || enc[0] === 0x90) while (row.length % 4) row.push(0);
  const at = row.length;
  for (const v of enc) row.push(v);
  return at;
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

const groupsFor = (n) => Math.ceil(n / 16);

class PageBuilder {
  constructor(pageSize, pageType) {
    this.pageSize = pageSize; this.pageType = pageType;
    this.heap = []; this.offsets = [];
  }

  /** Espace libre pour les lignes, index de la page compris. */
  freeSpace() {
    const groups = Math.max(1, groupsFor(this.offsets.length));
    return this.pageSize - PAGE_HEADER_LEN - this.heap.length - groups * ROW_GROUP_LEN;
  }

  /** Une ligne de `len` octets tient encore (avec la marge de 8 octets que garde rbxport). */
  fits(len) { return this.freeSpace() >= len + 8; }

  /** Ajoute une ligne alignée sur 4 octets ; renvoie son numéro sur la page. */
  push(row) {
    while (this.heap.length % 4) this.heap.push(0);
    this.offsets.push(this.heap.length);
    for (const v of row) this.heap.push(v);
    return this.offsets.length - 1;
  }

  get rowCount() { return this.offsets.length; }

  /** Rend la page (toutes les lignes présentes). Champs d'en-tête comme les pages de rekordbox [OBS 7.2.11]. */
  finish() {
    const p = Buffer.alloc(this.pageSize);
    const n = this.offsets.length;
    const lastRowMarked = n > 0xff; // page de plus de 255 lignes : en-tête « dernière ligne » (#349)
    p.writeUInt32LE(this.pageType, 0x08);
    const packed = (n & 0x1fff) | ((n & 0x7ff) << 13);
    p[0x18] = packed & 0xff; p[0x19] = (packed >> 8) & 0xff; p[0x1a] = (packed >> 16) & 0xff;
    p[0x1b] = 0x24; // page de données
    const used = Math.ceil(this.heap.length / 4) * 4;
    const free = Math.max(0, this.pageSize - PAGE_HEADER_LEN - used - (2 * n + 4 * groupsFor(n)));
    p.writeUInt16LE(free, 0x1c);
    p.writeUInt16LE(used, 0x1e);
    if (lastRowMarked) { p.writeUInt16LE(1, 0x20); p.writeUInt16LE(Math.max(0, n - 1), 0x22); } else p.writeUInt16LE(n, 0x20);
    Buffer.from(this.heap).copy(p, PAGE_HEADER_LEN);
    const groups = groupsFor(n);
    for (let g = 0; g < groups; g++) {
      const base = this.pageSize - g * ROW_GROUP_LEN;
      const inGroup = g < groups - 1 ? 16 : n - g * 16;
      let present = 0;
      for (let r = 0; r < inGroup; r++) {
        present |= 1 << r;
        p.writeUInt16LE(this.offsets[g * 16 + r], base - (6 + 2 * r));
      }
      const second = !lastRowMarked ? present : (g === groups - 1 ? 1 << (inGroup - 1) : 0);
      p.writeUInt16LE(present & 0xffff, base - 4);
      p.writeUInt16LE(second & 0xffff, base - 2);
    }
    return p;
  }
}

/** Page d'index qui ouvre chaque table : sans elle, rekordbox déclare la base corrompue [OBS 7.2.11]. */
function indexPage(pageSize, pageIndex, pageType, nextPage, firstDataPage) {
  const p = Buffer.alloc(pageSize);
  p.writeUInt32LE(pageIndex, 0x04);
  p.writeUInt32LE(pageType, 0x08);
  p.writeUInt32LE(nextPage, 0x0c);
  p.writeUInt32LE(1, 0x10);
  p[0x1b] = 0x64;
  p.writeUInt16LE(0x1fff, 0x20);
  p.writeUInt16LE(0x1fff, 0x22);
  p.writeUInt16LE(0x03ec, 0x24);
  const body = PAGE_HEADER_LEN;
  p.writeUInt32LE(pageIndex, body);
  p.writeUInt32LE(firstDataPage ?? NO_PAGE, body + 4);
  p.writeUInt32LE(NO_PAGE, body + 8);
  let at = body + 18;
  for (let i = 0; i < 1004 && at + 4 <= pageSize; i++, at += 4) { p[at] = 0xff; p[at + 1] = 0x1f; p[at + 2] = 0xf8; p[at + 3] = 0xff; }
  if (at + 2 <= pageSize) { p[at] = 0xff; p[at + 1] = 0x1f; }
  return p;
}

/**
 * Construit un fichier : en-tête, puis pour chaque table sa page d'index et sa première page, puis le reste des pages
 * table par table (la 19 « property » d'abord, comme rekordbox), chaque dernière page pointant vers une page vide
 * « candidate » nommée par l'en-tête. Les pages vides de la fin ne sont pas écrites.
 */
class FileBuilder {
  constructor(pageSize = PAGE_SIZE) { this.pageSize = pageSize; this.tables = []; }

  /** rows : tableau de Buffer/Array. numbered : la ligne porte son numéro sur la page ×32 aux octets 2-3. */
  addTable(pageType, rows, numbered = false) {
    const pages = [];
    let b = new PageBuilder(this.pageSize, pageType);
    for (const r of rows) {
      if (r.length > maxRowLen(this.pageSize)) throw new Error(`Ligne trop longue pour export.pdb (table ${pageType}, ${r.length} octets).`);
      if (!b.fits(r.length)) { pages.push(b); b = new PageBuilder(this.pageSize, pageType); }
      const row = Array.from(r);
      if (numbered) { const v = Math.min(0xffff, b.rowCount * 32); row[2] = v & 0xff; row[3] = v >> 8; }
      b.push(row);
    }
    pages.push(b);
    this.tables.push({ pageType, pages: pages.map((x) => ({ rows: x.rowCount, buf: x.finish() })) });
  }

  finish() {
    const ps = this.pageSize;
    let next = 1; let sequence = 1;
    const entries = []; const pages = []; const held = [];
    this.tables.forEach(({ pageType, pages: tp }, at) => {
      const hasRows = tp.some((x) => x.rows > 0);
      const indexAt = next++;
      if (hasRows) {
        const first = next++;
        pages.push(indexPage(ps, indexAt, pageType, first, first));
        const p0 = tp[0].buf; p0.writeUInt32LE(first, 0x04);
        pages.push(p0);
        held.push({ at, rest: tp.slice(1).map((x) => x.buf), firstPage: p0 });
        entries.push({ pageType, first: indexAt, last: first, candidate: 0 });
      } else {
        const candidate = next++;
        pages.push(indexPage(ps, indexAt, pageType, candidate, null));
        pages.push(Buffer.alloc(ps));
        entries.push({ pageType, first: indexAt, last: indexAt, candidate });
      }
    });
    // Ordre d'écriture : property (19) d'abord, puis l'ordre des tables [OBS 7.2.11].
    held.sort((a, b) => {
      const ka = entries[a.at].pageType === 19 ? -1 : entries[a.at].pageType;
      const kb = entries[b.at].pageType === 19 ? -1 : entries[b.at].pageType;
      return ka - kb;
    });
    for (const h of held) {
      let last = h.firstPage; let lastIndex = last.readUInt32LE(0x04);
      sequence += 1; last.writeUInt32LE(sequence, 0x10);
      for (const page of h.rest) {
        const index = next++;
        page.writeUInt32LE(index, 0x04);
        sequence += 1; page.writeUInt32LE(sequence, 0x10);
        last.writeUInt32LE(index, 0x0c);
        pages.push(page);
        last = page; lastIndex = index;
      }
      const candidate = next++;
      pages.push(Buffer.alloc(ps));
      last.writeUInt32LE(candidate, 0x0c);
      entries[h.at].last = lastIndex;
      entries[h.at].candidate = candidate;
    }
    while (pages.length && pages[pages.length - 1].every((v) => v === 0)) pages.pop();
    const head = Buffer.alloc(ps);
    head.writeUInt32LE(ps, 0x04);
    head.writeUInt32LE(entries.length, 0x08);
    head.writeUInt32LE(next, 0x0c);
    head.writeUInt32LE(1, 0x10);
    head.writeUInt32LE(sequence + 1, 0x14); // une de plus que la dernière page : aucune page n'est « en cours d'écriture »
    entries.forEach((e, i) => {
      const at = 28 + i * 16;
      head.writeUInt32LE(e.pageType, at);
      head.writeUInt32LE(e.candidate, at + 4);
      head.writeUInt32LE(e.first, at + 8);
      head.writeUInt32LE(e.last, at + 12);
    });
    return Buffer.concat([head, ...pages]);
  }
}

// ---------------------------------------------------------------------------
// Lignes
// ---------------------------------------------------------------------------

const u16 = (row, at, v) => { row[at] = v & 0xff; row[at + 1] = (v >> 8) & 0xff; };
const u32 = (row, at, v) => { const x = v >>> 0; row[at] = x & 0xff; row[at + 1] = (x >>> 8) & 0xff; row[at + 2] = (x >>> 16) & 0xff; row[at + 3] = (x >>> 24) & 0xff; };
const le32 = (v) => { const r = [0, 0, 0, 0]; u32(r, 0, v); return r; };

const TRACK_FIXED_LEN = 0x5e;
const TRACK_STRINGS = 21;
const SLOT = { ISRC: 0, HOT_CUE_AUTO_LOAD: 7, DATE_ADDED: 10, RELEASE_DATE: 11, MIX_NAME: 12, ANALYZE_PATH: 14, ANALYZE_DATE: 15, COMMENT: 16, TITLE: 17, FILENAME: 19, FILE_PATH: 20 };

/** Code de format audio d'après le nom du fichier sur la clé : MP3 1, M4A 4, FLAC 5, WAV 11, AIFF 12. */
function audioFileType(name) {
  const e = String(name).toLowerCase().split('.').pop();
  return { mp3: 1, m4a: 4, mp4: 4, aac: 4, flac: 5, wav: 11, aif: 12, aiff: 12 }[e] || 0;
}

/**
 * Ligne de morceau : 0x5e octets fixes + 21 positions de chaînes (relatives au début de la ligne).
 * Sous-type 0x24 et « trailers » 0x29 / 3 indispensables (sinon la CDJ-3000 ignore les morceaux) [OBS].
 */
function trackRow(t) {
  const strings = new Array(TRACK_STRINGS).fill('');
  strings[SLOT.ISRC] = t.isrc || '';
  strings[SLOT.HOT_CUE_AUTO_LOAD] = t.hotCueAutoLoad ? 'ON' : '';
  strings[SLOT.DATE_ADDED] = t.dateAdded || '';
  strings[SLOT.RELEASE_DATE] = t.releaseDate || '';
  strings[SLOT.MIX_NAME] = t.mixName || '';
  strings[SLOT.ANALYZE_PATH] = t.analyzePath || '';
  strings[SLOT.COMMENT] = t.comment || '';
  strings[SLOT.TITLE] = t.title || '';
  strings[SLOT.FILENAME] = t.filename || '';
  strings[SLOT.FILE_PATH] = t.filePath || '';
  const row = new Array(TRACK_FIXED_LEN + TRACK_STRINGS * 2).fill(0);
  u16(row, 0x00, 0x24);
  u32(row, 0x08, t.sampleRate || 0);
  u32(row, 0x10, Math.min(0xffffffff, t.fileSize || 0));
  u32(row, 0x14, t.masterContentId || 0);
  u32(row, 0x18, t.masterDbId || 0);
  u32(row, 0x1c, t.artworkId || 0);
  u32(row, 0x20, t.keyId || 0);
  u32(row, 0x28, t.labelId || 0);
  u32(row, 0x30, t.bitrate || 0);
  u32(row, 0x34, t.trackNumber || 0);
  u32(row, 0x38, t.tempoX100 || 0);
  u32(row, 0x3c, t.genreId || 0);
  u32(row, 0x40, t.albumId || 0);
  u32(row, 0x44, t.artistId || 0);
  u32(row, 0x48, t.id);
  u16(row, 0x4c, t.discNumber || 0);
  u16(row, 0x4e, t.playCount || 0);
  u16(row, 0x50, t.year || 0);
  u16(row, 0x52, t.sampleDepth || 0);
  u16(row, 0x54, Math.min(0xffff, t.durationSec || 0));
  u16(row, 0x56, 0x29);
  row[0x58] = t.colorId || 0;
  row[0x59] = t.rating || 0;
  u16(row, 0x5a, audioFileType(t.filename));
  u16(row, 0x5c, 3);
  const offs = strings.map((s) => pushString(row, s));
  offs.forEach((o, i) => u16(row, TRACK_FIXED_LEN + i * 2, o));
  return row;
}

/** genres, labels, artwork : u32 id puis la chaîne. */
const simpleNamedRow = (id, name) => [...le32(id), ...deviceSqlString(name)];
/** keys : l'id deux fois, puis le nom. */
const keyRow = (id, name) => [...le32(id), ...le32(id), ...deviceSqlString(name)];
/** colors : 4 zéros, id (u8), id (u16), 1 octet, nom [OBS 7.2.11]. */
function colorRow(id, name) { const r = new Array(8).fill(0); r[4] = id & 0xff; u16(r, 5, id); return [...r, ...deviceSqlString(name)]; }

/** artists : sous-type 0x60, id à 0x04, 0x03 à 0x08, position du nom à 0x09 (0x0a court, 0x0c long) [OBS]. */
function artistRow(id, name) {
  const r = new Array(10).fill(0);
  u16(r, 0, 0x60); u32(r, 4, id); r[8] = 0x03;
  r[9] = pushString(r, name);
  return r;
}

/** albums : sous-type 0x80, artiste à 0x08, id à 0x0c (et pas l'inverse !), 0x03 à 0x14, position du nom à 0x15. */
function albumRow(id, artistId, name) {
  const r = new Array(0x16).fill(0);
  u16(r, 0, 0x80); u32(r, 0x08, artistId); u32(r, 0x0c, id); r[0x14] = 0x03;
  r[0x15] = pushString(r, name);
  return r;
}

/** playlist_tree : parent, un mot à zéro, ordre parmi ses frères (depuis 0), id, dossier ?, puis le nom (5 mots). */
const playlistRow = (id, parentId, sortOrder, isFolder, name) => [...le32(parentId), ...le32(0), ...le32(sortOrder), ...le32(id), ...le32(isFolder ? 1 : 0), ...deviceSqlString(name)];
/** playlist_entries : position (depuis 1), morceau, playlist. */
const playlistEntryRow = (index, trackId, playlistId) => [...le32(index), ...le32(trackId), ...le32(playlistId)];

/** La ligne « property » (type 19) : nombre de morceaux, date, version « 1000 », nom de la clé, couleur de fond. */
function propertyRow({ contents, createdDate, deviceName = '', background = 0 }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(createdDate)) throw new Error('Date invalide pour export.pdb.');
  const r = [0x80, 0x02, 0x00, 0x00, ...le32(contents), 0x00, background & 0xff, 0x00, 0x00];
  r.push(...shortAscii(createdDate), 0x19, 0x1e, ...shortAscii('1000'), ...deviceSqlString(deviceName), 0, 0, 0, 0, 0, 0, 0, 0);
  while (r.length % 4) r.push(0);
  return r;
}

// Lignes fixes que rekordbox écrit dans toute clé (colonnes de navigation, menus History) [OBS 7.2.11, annexe A de rbxport].
const hexRows = (s) => s.trim().split(/\s+/).map((h) => Buffer.from(h, 'hex'));
const COLUMNS = hexRows(`
0100800090120000FAFF470045004E0052004500FBFF0000 0200810090140000FAFF410052005400490053005400FBFF
0300820090120000FAFF41004C00420055004D00FBFF0000 0400830090120000FAFF54005200410043004B00FBFF0000
05008500900E0000FAFF420050004D00FBFF0000 0600860090140000FAFF52004100540049004E004700FBFF
0700870090100000FAFF5900450041005200FBFF 0800880090160000FAFF520045004D004900580045005200FBFF0000
0900890090120000FAFF4C004100420045004C00FBFF0000 0A008A0090260000FAFF4F0052004900470049004E0041004C002000410052005400490053005400FBFF0000
0B008B00900E0000FAFF4B0045005900FBFF0000 0C008D00900E0000FAFF430055004500FBFF0000
0D008E0090120000FAFF43004F004C004F005200FBFF0000 0E00920090100000FAFF540049004D004500FBFF
0F00930090160000FAFF4200490054005200410054004500FBFF0000 10009400901A0000FAFF460049004C00450020004E0041004D004500FBFF0000
1100840090180000FAFF50004C00410059004C00490053005400FBFF 1200980090200000FAFF48004F00540020004300550045002000420041004E004B00FBFF
1300950090160000FAFF48004900530054004F0052005900FBFF0000 1400910090140000FAFF530045004100520043004800FBFF
1500960090180000FAFF43004F004D004D0045004E0054005300FBFF 16008C00901C0000FAFF4400410054004500200041004400440045004400FBFF
1700970090220000FAFF44004A00200050004C0041005900200043004F0055004E005400FBFF0000 1800900090140000FAFF46004F004C00440045005200FBFF
1900A10090160000FAFF440045004600410055004C005400FBFF0000 1A00A20090180000FAFF41004C00500048004100420045005400FBFF
1B00AA0090180000FAFF4D00410054004300480049004E004700FBFF`);
const HISTORY_PLAYLISTS = hexRows(`0100010063010000 0500060005010000 0600070063010000 0700080063010000 0800090063010000 09000A0063010000
0A000B0063010000 0D000F0063010000 0E00130004010000 0F00140006010000 1000150063010000 1200170063010000 0200020002000100
0300030003000200 0400040001000300 0B000C0063000400 1100050063000500 1300160063000600 1400120063000700 1B001A0063020800
1800110063000900 16001B0063000A00`);
const HISTORY_ENTRIES = hexRows(`0100060001000000 1500070003000000 0E00080001000000 0800090001000000 09000A0001000000 0A000B0001000000
0F000D0001000000 0D000F0001000000 1700100001000000 1600110001000000 1900000000010000 1A00010000020000 0200020000030000
0300030000040000 0500040000050000 0600050000060000 0B000C0000070000`);

/** Les 8 couleurs de morceau, dans l'ordre de rekordbox (id 1 à 8). */
const COLORS = ['Pink', 'Red', 'Orange', 'Yellow', 'Green', 'Aqua', 'Blue', 'Purple'];

/**
 * Construit export.pdb avec les vingt tables que rekordbox écrit, dans son ordre.
 * @param {{tracks: object[], genres: Map, artists: Map, albums: Map, labels: Map, keys: Map,
 *          playlists: {id, parentId, sortOrder, folder, name}[], entries: {index, trackId, playlistId}[],
 *          deviceName?: string, createdDate: string, background?: number}} db  (Map nom -> id)
 */
function buildPdb(db) {
  const f = new FileBuilder(PAGE_SIZE);
  const named = (m, fn) => [...m.entries()].sort((a, b) => a[1] - b[1]).map(([name, id]) => fn(id, name));
  f.addTable(0, db.tracks.map(trackRow), true);
  f.addTable(1, named(db.genres, simpleNamedRow));
  f.addTable(2, named(db.artists, artistRow), true);
  f.addTable(3, named(db.albums, (id, name) => albumRow(id, 0, name)), true);
  f.addTable(4, named(db.labels, simpleNamedRow));
  f.addTable(5, named(db.keys, keyRow));
  f.addTable(6, COLORS.map((name, i) => colorRow(i + 1, name)));
  f.addTable(7, db.playlists.map((p) => playlistRow(p.id, p.parentId, p.sortOrder, p.folder, p.name)));
  f.addTable(8, db.entries.map((e) => playlistEntryRow(e.index, e.trackId, e.playlistId)));
  for (let t = 9; t <= 15; t++) f.addTable(t, []);
  f.addTable(16, COLUMNS);
  f.addTable(17, HISTORY_PLAYLISTS);
  f.addTable(18, HISTORY_ENTRIES);
  f.addTable(19, [propertyRow({ contents: db.tracks.length, createdDate: db.createdDate, deviceName: db.deviceName || '', background: db.background || 0 })], true);
  return f.finish();
}

module.exports = { buildPdb, trackRow, artistRow, albumRow, keyRow, colorRow, simpleNamedRow, playlistRow, playlistEntryRow, propertyRow, deviceSqlString, maxRowLen, audioFileType, FileBuilder, PAGE_SIZE, COLORS };
