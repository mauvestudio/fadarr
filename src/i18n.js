/**
 * Messages du serveur en anglais (le français est la langue source) : choisis d'après l'en-tête X-Lang envoyé par l'interface.
 * Server messages in English (French is the source language), picked from the X-Lang header sent by the UI.
 */
const EN = {
  "Indique d'abord dans les Réglages le chemin du dossier musique sur ton Mac (ex. /Volumes/music/Electronic).": 'First set the music folder path on your Mac in Settings (e.g. /Volumes/music/Electronic).',
  'Aucune playlist à exporter.': 'No playlist to export.',
  'NAS déconnecté : reconnecte-le avec le bouton en haut.': 'NAS disconnected: reconnect it with the button at the top.',
  'Morceau inconnu de la bibliothèque.': 'Track not found in the library.',
  'Playlist introuvable.': 'Playlist not found.',
  'Les playlists Traktor sont en lecture seule : fais-en une copie fadarr pour la modifier.': 'Traktor playlists are read-only: make a fadarr copy to edit it.',
  'Les playlists Traktor se mettent à jour en réimportant collection.nml.': 'Traktor playlists update when you re-import collection.nml.',
  'Fichier vide.': 'Empty file.',
  "Analyse d'abord ta bibliothèque (bouton « Analyser le NAS ») : l'import retrouve les morceaux du NAS d'après la collection Traktor.": 'Scan your library first (“Scan NAS” button): the import matches Traktor tracks to files on the NAS.',
  "Ce fichier n'est pas un collection.nml de Traktor (balise NML absente).": 'This is not a Traktor collection.nml file (no NML tag).',
  'Requête interdite (origine externe)': 'Forbidden request (external origin)',
  'Route inconnue': 'Unknown route',
  'Authentification requise': 'Authentication required',
  'Choisis au moins une playlist.': 'Pick at least one playlist.',
  'Préparation introuvable (le serveur a peut-être redémarré).': 'Preparation not found (the server may have restarted).',
  'Fichier introuvable.': 'File not found.',
  'Date invalide pour export.pdb.': 'Invalid date for export.pdb.',
  "Analyseur absent : reconstruis l'image Docker (ou lance npm run build:analyzer).": 'Analyzer missing: rebuild the Docker image (or run npm run build:analyzer).'
};

function tr(req, msg) {
  const lang = String((req && req.headers && req.headers['x-lang']) || '').toLowerCase();
  return lang === 'en' && EN[msg] ? EN[msg] : msg;
}

module.exports = { tr };
