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

# Install dependencies
RUN apt-get update && apt-get install -y ffmpeg curl python3 && rm -rf /var/lib/apt/lists/*

# Copy built app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/scripts ./scripts

# Setup yt-dlp
ADD https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest /tmp/ytdlp-release.json
RUN node scripts/setup-ytdlp.js

# Create directories and set permissions
RUN mkdir -p /app/mp3 /app/cover && chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=4242
ENV MP3_DOWNLOAD_DIR=/app/mp3
ENV COVER_DOWNLOAD_DIR=/app/cover

USER node

EXPOSE 4242
CMD ["npm", "start"]
