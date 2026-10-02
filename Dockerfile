# Mythic in a container. The data folder is a volume: mount it to keep your data.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    MYTHIC_DATA_DIR=/data \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.mjs ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
# Inside the container Mythic listens on every interface; docker-compose.yml
# publishes it on 127.0.0.1 only. Set MYTHIC_PASSWORD to open it further.
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0"]
