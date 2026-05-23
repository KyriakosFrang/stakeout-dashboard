# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies (layer-cached until package files change)
COPY package*.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci

# Build server (tsc) and client (vite)
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM node:20-alpine AS runtime
WORKDIR /app

# Copy compiled artefacts
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

# Install only server production dependencies
COPY package*.json ./
COPY server/package.json ./server/
RUN npm ci --workspace=server --omit=dev

ENV NODE_ENV=production
EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "server/dist/index.js"]
