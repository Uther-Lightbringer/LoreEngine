# ============================================
# AI Visual Novel - Production Docker Image
# ============================================
# This image contains only executable code
# Data is stored at runtime in /app/server/data
# ============================================

# Stage 1: Build frontend
FROM node:20 AS frontend-builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY src ./src
COPY index.html .
COPY vite.config.js .

# Build frontend - VITE_API_URL set to empty so frontend uses relative paths
ENV VITE_API_URL=
RUN npm run build

# ============================================
# Stage 2: Production runtime
FROM node:20 AS production

WORKDIR /app

# Copy built frontend
COPY --from=frontend-builder /app/dist ./dist

# Copy server source code (NOT data!)
COPY server/package*.json ./server/
COPY server/config.js ./server/
COPY server/index.js ./server/
COPY server/database.js ./server/
COPY server/routes ./server/routes/
COPY server/middleware ./server/middleware/

# Install server dependencies
RUN cd ./server && npm install

# Create empty data directory and cache directory (for runtime database and image cache)
RUN mkdir -p /app/server/data /app/server/CacheImages && chown -R node:node /app

USER node

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "/app/server/index.js"]
