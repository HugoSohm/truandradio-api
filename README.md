# <img src="https://www.truand2lagalere.fr/images/apple-touch-icon.png" width="40" height="40" style="vertical-align: middle;"> Galere Radio API

API for retrieving information, downloading media (queued), and grabbing cover art from various platforms with metadata support.

## ✨ Features

- 🔍 **Integrated Search**: Search for tracks directly on YouTube via the `/search` endpoint.
- 🕒 **Async Downloads**: Background processing via BullMQ with status tracking.
- 🖼️ **Metadata & Covers**: Automatic extraction of high-res cover art and tags.
- 🛡️ **Security**: Protected endpoints with API Key authentication.
- 🐋 **Docker Ready**: Pre-configured setup with Docker Compose.
- 📖 **API Docs**: Interactive documentation via Swagger UI.

## 🌟 Supported Platforms

- 🎥 **YouTube** (via yt-dlp)
- ☁️ **SoundCloud** (via scdl)
- 🎧 **Spotify** (Metadata & Search)
- 🎶 **Deezer** (Metadata & Search)
- 🍎 **Apple Music** (Metadata & Search)

## 🚀 Getting Started

### 🐋 Option 1: Docker (Recommended)

The easiest way to run the API with all its dependencies (including Redis):

1. **Prerequisites**: [Docker & Docker Compose](https://www.docker.com/products/docker-desktop/)
2. **Setup**: Create a `.env` file from `.env.sample`.
3. **Run**: 
   ```bash
   npm run deploy
   ```
4. **Access**: API at `http://localhost:3000` and Docs at `http://localhost:3000/docs`.

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
4. **Access**: API at `http://localhost:3000`.

## ⚙️ Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | The port the server will listen on | `3000` |
| `API_KEY` | Secret key required in `X-API-Key` header | - |
| `REDIS_URL` | URL for the Redis instance | `redis://localhost:6379` |
| `MP3_DOWNLOAD_DIR` | Directory where MP3 files will be stored | `mp3` |
| `COVER_DOWNLOAD_DIR` | Directory where cover images will be stored | `covers` |
| `SPOTIFY_CLIENT_ID` | Your Spotify Application Client ID | - |
| `SPOTIFY_CLIENT_SECRET` | Your Spotify Application Client Secret | - |

## 🛡️ Authentication

All routes (except `/health` and `/docs`) require an API Key if `API_KEY` is set in the environment.
Add the following header to your requests:
`X-API-Key: YOUR_API_KEY`

## 🛣️ API Routes

### Interactive Documentation
Static documentation is served at `/docs` (Swagger UI).

### Health Check
- **URL**: `/health`
- **Method**: `GET` (No Auth)

### Search
Search for tracks on YouTube.
- **URL**: `/search`
- **Method**: `POST`
- **Body**: `{ "artist": "Daft Punk", "title": "Get Lucky", "cookies": [...], "limit": 5 }` (artist, title, and cookies are optional, but at least artist or title is required)

### Get Info
Retrieve metadata for a given URL.
- **URL**: `/info`
- **Method**: `POST`
- **Body**: `{ "url": "..." }`

### Download (Queued)
Starts a background download job.
- **URL**: `/download`
- **Method**: `POST`
- **Body**: 
  ```json
  {
    "url": "https://www.youtube.com/watch?v=...",
    "title": "Custom Title" (optional),
    "artists": ["Artist 1", "Artist 2"] (optional),
    "cookies": [...], (optional, Netscape JSON format),
    "mp3SubPath": "subdir/...", (optional),
    "coverSubPath": "subdir/..." (optional)
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "jobId": "7",
    "message": "Download queued successfully"
  }
  ```

### Job Status
Check the status and result of a download.
- **URL**: `/jobs`
- **Method**: `GET`
- **Query Params**: `id=YOUR_JOB_ID`
- **Response**:
  ```json
  {
    "id": "7",
    "status": "completed",
    "progress": 100,
    "result": {
      "mp3Path": "/app/mp3/Song.mp3",
      "coverPath": "/app/cover/Song.jpg",
      "metadata": {
        "title": "Song Title",
        "artists": ["Artist"],
        "coverUrl": "...",
        "source": "youtube"
      }
    },
    "error": null
  }
  ```

## 🛠️ Technologies Used

- [Fastify](https://www.fastify.io/) - Web framework
- [BullMQ](https://docs.bullmq.io/) - Message queue & background jobs
- [Redis](https://redis.io/) - Data store for BullMQ
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - Media downloading
- [SoundCloud Downloader](https://github.com/dandv/soundcloud-downloader) - SoundCloud media fetching
- [fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) - Audio processing
- [Swagger](https://swagger.io/) - API Documentation
- [Docker](https://www.docker.com/) - Containerization
