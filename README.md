# <img src="https://www.truandradio.fr/images/apple-touch-icon.png" width="40" height="40" style="vertical-align: middle;"> Truand Radio API

API for retrieving information, downloading media (queued), and grabbing cover art from various platforms with metadata support.

## ✨ Features

- 📥 **Local Async Downloads**: Download MP3 and Cover art to the server via the `/download` endpoint.
- ⚡ **Direct Streaming**: Download MP3 directly to your browser via the `/download/stream` endpoint.
- 🔍 **Integrated Search**: Search for tracks directly on YouTube via the `/search` endpoint.
- 🏷️ **Metadata & Tags**: Extraction of high-res cover art and ID3 tags via the `/info` endpoint.
- 🎵 **Playlist Support**: Automatically detect and download entire YouTube playlists.
- 🛡️ **Security**: Protected endpoints with API Key authentication.
- 🐋 **Docker Ready**: Pre-configured setup with Docker Compose.
- 📖 **API Docs**: Interactive specification documentation via Swagger UI _(OpenAPI 3.0)_.

## 🌟 Supported Platforms

- 🔴 **YouTube** (via yt-dlp)
- ☁️ **SoundCloud** (via scdl)
- 🟢 **Spotify** (Metadata & search on Youtube)
- 🟣 **Deezer** (Metadata & search on Youtube)
- 🍎 **Apple Music** (Metadata & search on Youtube)

## 🚀 Getting Started

### 🐋 Option 1: Docker (Recommended)

The easiest way to run the API with all its dependencies (including Redis):

1. **Prerequisites**: [Docker & Docker Compose](https://www.docker.com/products/docker-desktop/)
2. **Setup**: Create a `.env` file from `.env.sample`.
3. **Run**: 
   ```bash
   npm run deploy
   ```
4. **Access**: API at `http://localhost:${PORT}` and Docs at `http://localhost:${PORT}/docs`.

---

### 💻 Option 2: Local Development

If you prefer to run the project directly on your machine:

1. **Prerequisites**:
   - Node.js (v20+)
   - Redis (Running on `localhost:6379`)
2. **Setup**:
   ```bash
   npm install
   cp .env.sample .env
   ```
3. **Run**:
   ```bash
   npm run dev
   ```
4. **Access**: API at `http://localhost:${PORT}`.

## ⚙️ Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | The port the server will listen on | `3000` |
| `API_KEY` | Secret key required in `X-API-Key` header | - |
| `REDIS_URL` | URL for the Redis instance | `redis://localhost:6379` |
| `REDIS_PASSWORD` | Password for the Redis instance (optional) | - |
| `MP3_DOWNLOAD_DIR` | Directory where MP3 files will be stored | `/mp3` |
| `COVER_DOWNLOAD_DIR` | Directory where cover images will be stored | `/cover` |
| `SPOTIFY_CLIENT_ID` | Your Spotify Application Client ID | - |
| `SPOTIFY_CLIENT_SECRET` | Your Spotify Application Client Secret | - |
| `BASE_URL` | (Optional) Custom base URL for file listing (e.g., https://api.example.com) | `http://localhost:${PORT}` |

## 🛡️ Authentication

All routes (except `/health` and `/docs`) require an API Key if `API_KEY` is set in the environment.
Add the following header to your requests:
`X-API-Key: YOUR_API_KEY`

## 🛣️ API Routes

All API routes, parameters, and example payloads are comprehensively documented via the interactive OpenAPI 3.0 interface.

👉 **Access the Live Documentation**: [http://localhost:3000/docs](http://localhost:3000/docs)

## 🛠️ Technologies Used

- [Fastify](https://www.fastify.io/) - Web framework
- [BullMQ](https://docs.bullmq.io/) - Message queue & background jobs
- [Redis](https://redis.io/) - Data store for BullMQ
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - Media downloading
- [SoundCloud Downloader](https://github.com/dandv/soundcloud-downloader) - SoundCloud media fetching
- [fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) - Audio processing
- [Swagger](https://swagger.io/) - API Documentation
- [Docker](https://www.docker.com/) - Containerization
