FROM node:20-alpine
# ffmpeg : lecture des AIFF dans Chrome (conversion à la volée en WAV, sans perte)
RUN apk add --no-cache ffmpeg tini
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY public ./public
RUN chmod -R a+rX /app   # lisible par l'utilisateur du conteneur (99:100 sur Unraid), quels que soient les droits d'origine
ENV PORT=3010 MUSIC_DIR=/music DATA_DIR=/app/data NODE_ENV=production
EXPOSE 3010
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
