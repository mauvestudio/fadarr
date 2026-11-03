# Analyseur audio (BPM, grille, tonalité, premier son) : qm-dsp + algorithmes de Mixxx, compilé à part
FROM alpine:3.22 AS analyzer
RUN apk add --no-cache g++
COPY analyzer /src
RUN LDFLAGS=-static sh /src/build.sh /usr/local/bin/fadarr-analyze && strip /usr/local/bin/fadarr-analyze

FROM node:22-alpine
# ffmpeg : lecture des AIFF dans Chrome (conversion à la volée en WAV, sans perte)
RUN apk add --no-cache ffmpeg tini
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY public ./public
COPY --from=analyzer /usr/local/bin/fadarr-analyze /usr/local/bin/fadarr-analyze
RUN chmod -R a+rX /app   # lisible par l'utilisateur du conteneur (99:100 sur Unraid), quels que soient les droits d'origine
ENV PORT=3010 MUSIC_DIR=/music DATA_DIR=/app/data NODE_ENV=production
EXPOSE 3010
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
