# Notices

## rbxport

fadarr's USB export for CDJ players (`src/usb/pdb.js`, `src/usb/anlz.js`, `src/usb/analyze.js`, `src/usb/export.js`)
is a JavaScript port of parts of **rbxport** — <https://github.com/chrisle/rbxport> — Copyright (c) 2026 Chris Le and
contributors, licensed under the GNU General Public License, version 2 or (at your option) any later version:

- `crates/rbl-pdb` (DeviceSQL `export.pdb` page and row encoding, the fixed rows rekordbox writes),
- `crates/rbl-anlz` (ANLZ framing, beat grid, cue lists, waveform encodings and their measured scales),
- `crates/rbl-analysis` (three-band waveform columns),
- `crates/rbl-export` (USB layout: FAT-safe names, analysis directory hash, stable track ids).

The byte-level knowledge behind these files comes from rbxport's reverse-engineering and its format reference
(`docs/reference/usb-export-db.md`). Thank you to its authors. fadarr's output was checked byte for byte against
rbxport's own writers during development.

Because of this, fadarr is distributed under GPL-2.0-or-later (it was MIT up to 0.9.1).

## Trademarks

Not affiliated with AlphaTheta / Pioneer DJ or Native Instruments. rekordbox, CDJ, Traktor are trademarks of their owners.
