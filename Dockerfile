# Build stage
FROM node:22-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install --ignore-scripts

COPY . .
RUN npm run build

# Production stage
FROM node:22-slim

WORKDIR /app

# Install ffmpeg and curl
RUN apt-get update && apt-get install -y ffmpeg curl python3 && rm -rf /var/lib/apt/cache/*

# Copy built app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/scripts ./scripts

# Setup yt-dlp via postinstall/setup script
RUN node scripts/setup-ytdlp.js

# Create download directories
RUN mkdir -p mp3 cover

ENV PORT=3000
ENV MP3_DOWNLOAD_DIR=/app/mp3
ENV COVER_DOWNLOAD_DIR=/app/cover

# EXPOSE ${PORT} 
# Note: EXPOSE is informational. The port is controlled by the PORT environment variable.

CMD ["npm", "start"]
