#!/bin/bash
# Install or update fadarr on an Unraid server (Compose Manager plugin) from this computer.
# Installe ou met à jour fadarr sur un serveur Unraid (plugin Compose Manager) depuis cet ordinateur.
#
# Usage : bash installer-unraid.sh      (settings / réglages : deploy.env, see deploy.env.example)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HERE/deploy.env" ] || { echo "⚠️  deploy.env missing: copy deploy.env.example to deploy.env and fill it in. / Copie deploy.env.example en deploy.env et remplis-le."; exit 1; }
# shellcheck disable=SC1091
. "$HERE/deploy.env"
: "${UNRAID:?UNRAID missing in deploy.env}" "${FADARR_APP:?}" "${FADARR_DATA:?}" "${FADARR_MUSIC:?}"
FADARR_PORT="${FADARR_PORT:-3010}"
PROJ=/boot/config/plugins/compose.manager/projects/fadarr
HOST="${UNRAID#*@}"

chmod -R u+rwX,go+rX "$HERE/src" "$HERE/public" 2>/dev/null || true
# Ancien dossier de données (avant le renommage mixarr -> fadarr) : migré automatiquement s'il existe et que le nouveau est vide.
FADARR_OLD_DATA="${FADARR_OLD_DATA:-/mnt/user/appdata/mixarr/data}"
echo "📦 1/2 Code -> $UNRAID:$FADARR_APP"
ssh "$UNRAID" "mkdir -p '$FADARR_APP' '$FADARR_DATA'
  if [ -z \"\$(ls -A '$FADARR_DATA' 2>/dev/null)\" ] && [ -d '$FADARR_OLD_DATA' ] && [ \"$FADARR_DATA\" != '$FADARR_OLD_DATA' ]; then
    cp -a '$FADARR_OLD_DATA/.' '$FADARR_DATA/' 2>/dev/null && echo '↪︎  Données migrées depuis $FADARR_OLD_DATA (playlists et cues conservés).'; fi
  chown -R 99:100 '$FADARR_DATA'"
rsync -a --delete --exclude node_modules --exclude data --exclude .git --exclude '.DS_Store' --exclude '.maj-*' \
  --exclude deploy.env --exclude .env "$HERE/" "$UNRAID:$FADARR_APP/"

echo "🐳 2/2 Docker stack « fadarr » (build + start, 1-2 min the first time)"
ssh "$UNRAID" "test -d '$FADARR_MUSIC' || { echo '⚠️  Music folder not found: $FADARR_MUSIC'; exit 1; }
  mkdir -p $PROJ && cp '$FADARR_APP/compose.yaml' $PROJ/compose.yaml && echo fadarr > $PROJ/name
  { grep -v '^FADARR_\(APP\|DATA\|MUSIC\|PORT\)=' $PROJ/.env 2>/dev/null; printf 'FADARR_APP=%s\nFADARR_DATA=%s\nFADARR_MUSIC=%s\nFADARR_PORT=%s\n' '$FADARR_APP' '$FADARR_DATA' '$FADARR_MUSIC' '$FADARR_PORT'; } > $PROJ/.env.new && mv $PROJ/.env.new $PROJ/.env
  cd $PROJ && docker compose -p fadarr -f compose.yaml --env-file .env up -d --build && docker ps --filter name=fadarr --format '✅ {{.Names}} : {{.Status}}'"

echo "🎛️  fadarr : http://$HOST:$FADARR_PORT"
