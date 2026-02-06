# <img src="https://www.truand2lagalere.fr/images/apple-touch-icon.png" width="40" height="40" style="vertical-align: middle;"> Galere Radio API

API for retrieving information, downloading media, and grabbing cover art from various platforms with metadata support.

## 🌐 Supported Platforms

- 🎥 **YouTube** (via yt-dlp)
- ☁️ **SoundCloud** (via scdl)
- 🎧 **Spotify** (Metadata)
- 🎶 **Deezer** (Metadata)
- 🍎 **Apple Music** (Metadata)

## 📋 Prerequisites

- Node.js (v18+)

## ⚙️ Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables in a `.env` file (see `.env.sample`)
4. **Create the download directories manually** (see [Configuration](#-configuration))

## ⚙️ Configuration

The following environment variables are available:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | The port the server will listen on | `3000` |
| `MP3_DOWNLOAD_DIR` | Directory where MP3 files will be stored | `mp3` |
| `COVER_DOWNLOAD_DIR` | Directory where cover images will be stored | `covers` |
| `SPOTIFY_CLIENT_ID` | Your Spotify Application Client ID | - |
| `SPOTIFY_CLIENT_SECRET` | Your Spotify Application Client Secret | - |

> [!IMPORTANT]
> **Strict Directory Validation**: The server will fail to start if the directories specified in `MP3_DOWNLOAD_DIR` and `COVER_DOWNLOAD_DIR` do not exist. You **must** create them manually before running the application.

## 🚀 Usage

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

## 🛣️ API Routes

### Health Check
Check if the API is functional.

- **URL**: `/health`
- **Method**: `GET`
- **Response**:
  ```json
  { "status": "ok" }
  ```

### Track Information
Retrieve metadata from a URL without downloading the file.

- **URL**: `/info`
- **Method**: `POST`
- **Body**: Supports `application/json`, `multipart/form-data`, and `application/x-www-form-urlencoded`.
  - `url` (**Required**): The media URL (YouTube, SoundCloud, etc.).
  - `cookies` (Optional): A JSON array of cookies.
- **Response**:
  ```json
  {
    "title": "Track Title",
    "artists": ["Artist 1"],
    "coverUrl": "https://..."
  }
  ```

### Download
Download the media, convert it to MP3, apply metadata, and download the cover art.

- **URL**: `/download`
- **Method**: `POST`
- **Body**: Supports `application/json`, `multipart/form-data`, and `application/x-www-form-urlencoded`.
  - `url` (**Required**): The media URL.
  - `title` (Optional): Custom title to apply to the MP3 file.
  - `artists` (Optional): An array/list of artists (e.g., `["Artist 1", "Artist 2"]` in JSON, or comma-separated in forms).
  - `cookies` (Optional): A JSON array of cookies.
- **Response**:
  ```json
  {
    "success": true,
    "mp3Path": "mp3/filename.mp3",
    "coverPath": "cover/filename.jpg"
  }
  ```

## 🔓 Bypassing YouTube Restrictions

Some YouTube videos may require cookies to bypass age or region restrictions.

### How to export cookies with EditThisCookie

1. Install the **EditThisCookie** extension in your browser ([Chrome Web Store](https://chrome.google.com/webstore/detail/editthiscookie/fngmhnnpnoocnehlgrffbeobnadjmcij)).
2. Log in to YouTube and go to any YouTube page.
3. Click on the extension icon and then on the **Options** (wrench icon).
4. In the "Choose the format for the cookies" section, select **JSON**.
5. Go back to the extension main menu and click the **Export** button (arrow pointing out).
6. The cookies are now in your clipboard. You can paste this JSON array directly into the `cookies` field of the request body for `/info` or `/download` routes.

> ⚠️ **IMPORTANT**: The API supports JSON body, Form-data and x-www-form-urlencoded. When using tools like Postman, you can use any of these tabs.

## 🛠️ Technologies Used

- [Fastify](https://www.fastify.io/) - Fast and low overhead web framework
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - Media downloading (YouTube, Apple Music metadata)
- [soundcloud-downloader](https://github.com/SalaceP/soundcloud-downloader) - Specific downloader for SoundCloud
- [Spotify Web API](https://developer.spotify.com/documentation/web-api/) - Metadata retrieval for Spotify links
- [Deezer API](https://developers.deezer.com/api) - Metadata retrieval for Deezer links
- [fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) - Audio processing and metadata tagging
- [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) - Bundled FFmpeg binaries
- [TypeScript](https://www.typescriptlang.org/) - Type-safe programming language
