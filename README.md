# mixarr

**Prepare your DJ sets in the browser, straight from your NAS.**
Audition tracks on two decks, build playlists, set hot cues, memory cues and loops — then hand everything to Rekordbox, which writes your USB stick.

*[Version française : LISEZMOI.md](LISEZMOI.md)*

![mixarr](docs/screenshot.png)

mixarr is a small self-hosted web app (Node.js, no framework, no build step). It runs in Docker next to your music
(Unraid, Synology, any Linux box) and you use it from any browser on your network or over Tailscale.

## Features

- **Two decks** — frequency-coloured waveforms (overview + zoom with beat grid), play / CUE, tempo ±8 / ±16 / ±50 %, SYNC,
  beat-phase meter, 8 hot cues (hot loops too), loops (IN/OUT, 4 or 8 beats), memory cues and memory loops, quantize.
- **Mixer** — gain, 3-band EQ, filter, channel faders, crossfader, master; three skins (*Base*, *Analog*, *Rotary*).
- **Library** — scans your music folder (only new or changed files are re-read), collapsible folder tree,
  sort by any column, BPM range filter, key shown as musical / Camelot / Open Key.
- **Built for set preparation** — once a track is loaded, the list highlights what mixes with it
  (Camelot-compatible key, BPM within 3 % or half/double tempo); one-click preview without loading a deck.
- **Traktor import** — reads `collection.nml`: playlists and folders, hot cues, memory cues, loops, BPM, beat grid, key, rating, comment.
  Tracks are matched to your files by name (accents and punctuation tolerated), then by artist + title; unmatched tracks are listed.
  Re-importing never overwrites cues you edited in mixarr.
- **Rekordbox export** — `rekordbox.xml` with playlists, cues (with colours), loops, BPM and grid; Rekordbox then builds the USB stick.
- **Safe by design** — the music folder is mounted read-only: mixarr never modifies an audio file. Everything it knows lives in `data/mixarr.json`.
- **NAS switch** — disconnect the NAS from the header (library and playlists stay browsable; loaded decks keep playing).
- **French / English** — and ready for more languages (see below).

## Install (Docker Compose)

```bash
git clone https://github.com/mauvestudio/mixarr.git && cd mixarr
cp .env.example .env        # set MIXARR_MUSIC to your music folder
docker compose up -d --build
```

Open `http://<server>:3010`, click **Scan NAS**, then **Import Traktor** and pick your `collection.nml`
(macOS: `~/Documents/Native Instruments/Traktor x.y/collection.nml`).

**Unraid** (Compose Manager plugin): copy `deploy.env.example` to `deploy.env`, fill it in, then from your computer run
`bash installer-unraid.sh` — it uploads the code, creates the *mixarr* stack and builds it. Same command to update.

Optional password: set `AUTH_USER` and `AUTH_PASSWORD` (recommended if mixarr is reachable from outside your home).

## Export to Rekordbox

1. In mixarr, ⚙ Settings: set the **music folder path as seen by your Mac** (e.g. `/Volumes/music/Electronic`).
2. **Export to Rekordbox**, tick the playlists, download `rekordbox.xml` (keep it at a fixed place and overwrite it each time).
3. Rekordbox › Preferences › Advanced › Database › *rekordbox xml*: select the file. In the tree, *rekordbox xml* › right-click a playlist › *Import Playlist*.

Cue timing between Traktor and Rekordbox can differ slightly on some MP3s: Settings › *MP3 cue offset* lets you calibrate it (WAV/AIFF are not affected).

## Keyboard

`Q` / `W` play deck A / B · `A` / `S` cue deck A / B · knobs: drag, mouse wheel, arrow keys, double-click to reset (Shift for fine control).

## Translations

All interface text goes through `public/i18n.js` (and `src/i18n.js` for server messages). French is the source language.
To add a language: copy the `en` block, translate the values and add the language to `LANGS`. Pull requests welcome.

## Development

```bash
npm install
MUSIC_DIR=/path/to/music DATA_DIR=./data npm start   # http://localhost:3010
```

`src/` server (Express): `library.js` (scan), `traktor.js` (NML import), `rekordbox.js` (XML export), `store.js` (database).
`public/` client: `app.js` (decks, Web Audio, waveforms, library), `app.css`, `i18n.js`. AIFF is converted to WAV on the fly with ffmpeg for browsers that cannot decode it.

## Roadmap

Beat-grid editing · MIDI controllers · waveform cache / mini-waveforms in the list · two-way Traktor sync.

## License

MIT — see [LICENSE](LICENSE). Not affiliated with Native Instruments or AlphaTheta/Pioneer DJ; Traktor and Rekordbox are trademarks of their owners.
