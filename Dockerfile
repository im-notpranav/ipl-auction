# IPL Live Auction Arena: one Node process serving the built React app, the REST API
# and the WebSocket server on $PORT. Works on Railway, Render, Fly.io and Koyeb.

# ---- build: install everything, build the client (dist/) and bundle the server ----
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- runtime: the server bundle has its npm packages inlined, so no node_modules ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    STATE_FILE=/data/auction_rooms_state.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
# Runs as root so it can write to a platform volume mounted at /data.
RUN mkdir -p /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist-server/server.cjs"]
