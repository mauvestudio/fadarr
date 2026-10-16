#!/bin/bash
# Install or update mixarr on an Unraid server (Compose Manager plugin) from this computer.
# Installe ou met à jour mixarr sur un serveur Unraid (plugin Compose Manager) depuis cet ordinateur.
#
# Usage : bash installer-unraid.sh      (settings / réglages : deploy.env, see deploy.env.example)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f "$HERE/deploy.env" ] || { echo "⚠️  deploy.env missing: copy deploy.env.example to deploy.env and fill it in. / Copie deploy.env.example en deploy.env et remplis-le."; exit 1; }
# shellcheck disable=SC1091
. "$HERE/deploy.env"
: "${UNRAID:?UNRAID missing in deploy.env}" "${MIXARR_APP:?}" "${MIXARR_DATA:?}" "${MIXARR_MUSIC:?}"
MIXARR_PORT="${MIXARR_PORT:-3010}"
PROJ=/boot/config/plugins/compose.manager/projects/mixarr
HOST="${UNRAID#*@}"

chmod -R u+rwX,go+rX "$HERE/src" "$HERE/public" 2>/dev/null || true
echo "📦 1/2 Code -> $UNRAID:$MIXARR_APP"
ssh "$UNRAID" "mkdir -p '$MIXARR_APP' '$MIXARR_DATA' && chown 99:100 '$MIXARR_DATA'"
rsync -a --delete --exclude node_modules --exclude data --exclude .git --exclude '.DS_Store' --exclude '.maj-*' \
  --exclude deploy.env --exclude .env "$HERE/" "$UNRAID:$MIXARR_APP/"

echo "🐳 2/2 Docker stack « mixarr » (build + start, 1-2 min the first time)"
ssh "$UNRAID" "test -d '$MIXARR_MUSIC' || { echo '⚠️  Music folder not found: $MIXARR_MUSIC'; exit 1; }
  mkdir -p $PROJ && cp '$MIXARR_APP/compose.yaml' $PROJ/compose.yaml && echo mixarr > $PROJ/name
  { grep -v '^MIXARR_\(APP\|DATA\|MUSIC\|PORT\)=' $PROJ/.env 2>/dev/null; printf 'MIXARR_APP=%s\nMIXARR_DATA=%s\nMIXARR_MUSIC=%s\nMIXARR_PORT=%s\n' '$MIXARR_APP' '$MIXARR_DATA' '$MIXARR_MUSIC' '$MIXARR_PORT'; } > $PROJ/.env.new && mv $PROJ/.env.new $PROJ/.env
  cd $PROJ && docker compose -p mixarr -f compose.yaml --env-file .env up -d --build && docker ps --filter name=mixarr --format '✅ {{.Names}} : {{.Status}}'"

echo "🎛️  mixarr : http://$HOST:$MIXARR_PORT"
