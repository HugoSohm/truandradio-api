import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import scdl from 'soundcloud-downloader';
import pRetry from 'p-retry';
import { sanitizeFilename, parseArtistsTitle, validateCookies, writeCookiesFile, SourceType, getSourceFromUrl } from './helpers';

const execFileAsync = promisify(execFile);

const FFMPEG_STATIC_PATH = (ffmpegStatic && fs.existsSync(ffmpegStatic)) ? ffmpegStatic : null;

if (FFMPEG_STATIC_PATH) {
    ffmpeg.setFfmpegPath(FFMPEG_STATIC_PATH);
}

const YTDLP_FILENAME = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const YTDLP_PATH = path.join(process.cwd(), YTDLP_FILENAME);
const MP3_DIR = path.resolve(process.env.MP3_DOWNLOAD_DIR ?? 'mp3');
const COVER_DIR = path.resolve(process.env.COVER_DOWNLOAD_DIR ?? 'cover');

if (!fs.existsSync(MP3_DIR)) {
    fs.mkdirSync(MP3_DIR, { recursive: true });
}
if (!fs.existsSync(COVER_DIR)) {
    fs.mkdirSync(COVER_DIR, { recursive: true });
}

export interface TrackMetadata {
    title: string;
    artists: string[];
    coverUrl: string;
    source: SourceType;
    url?: string;
}

export interface DownloadResult {
    mp3Path: string;
    coverPath: string;
    metadata: TrackMetadata;
}

const downloadImage = async (url: string, filepath: string): Promise<void> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buffer));
};

const getSpotifyAccessToken = async (): Promise<string> => {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET is missing in .env');
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to get Spotify access token: ${error}`);
    }

    const data: any = await response.json();
    return data.access_token;
};

const getSpotifyTrackInfo = async (trackId: string): Promise<TrackMetadata> => {
    const token = await getSpotifyAccessToken();
    const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to fetch Spotify track: ${error}`);
    }

    const track: any = await response.json();
    return {
        title: track.name,
        artists: track.artists.map((a: any) => a.name),
        coverUrl: track.album.images[0]?.url || '',
        source: SourceType.SPOTIFY
    };
};

const getDeezerTrackInfo = async (trackId: string): Promise<TrackMetadata> => {
    const response = await fetch(`https://api.deezer.com/track/${trackId}`);

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to fetch Deezer track: ${error}`);
    }

    const track: any = await response.json();
    if (track.error) {
        throw new Error(`Deezer API error: ${track.error.message}`);
    }

    return {
        title: track.title,
        artists: [track.artist.name],
        coverUrl: track.album.cover_xl || track.album.cover_big || track.album.cover_medium || '',
        source: SourceType.DEEZER
    };
};

const searchSpotifyTrack = async (artist: string, title: string): Promise<TrackMetadata | null> => {
    try {
        const token = await getSpotifyAccessToken();
        const query = encodeURIComponent(`artist:${artist} track:${title}`);
        const response = await fetch(`https://api.spotify.com/v1/search?q=${query}&type=track&limit=1`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) return null;

        const data: any = await response.json();
        const track = data.tracks?.items?.[0];

        if (!track) return null;

        return {
            title: track.name,
            artists: track.artists.map((a: any) => a.name),
            coverUrl: track.album.images[0]?.url || '',
            source: SourceType.SPOTIFY
        };
    } catch (error) {
        console.error(`[Spotify Search] Failed: ${error}`);
        return null;
    }
};

const executeYtDlp = async (url: string, cookies?: any[], extraArgs: string[] = []): Promise<any> => {
    const args = ['--dump-json', '--no-playlist', '--js-runtimes', 'node', ...extraArgs];

    if (FFMPEG_STATIC_PATH) {
        args.push('--ffmpeg-location', FFMPEG_STATIC_PATH);
    }

    let cookiesFile: string | null = null;
    if (cookies && cookies.length > 0) {
        cookiesFile = writeCookiesFile(cookies);
        args.push('--cookies', cookiesFile);
    }

    return await pRetry(async () => {
        try {
            const { stdout } = await execFileAsync(YTDLP_PATH, [...args, url], { timeout: 60000 });
            return JSON.parse(stdout);
        } catch (error: any) {
            throw error;
        } finally {
            if (cookiesFile && fs.existsSync(cookiesFile)) {
                try { fs.unlinkSync(cookiesFile); } catch (e) { }
            }
        }
    }, {
        retries: 3,
        onFailedAttempt: error => {
            console.log(`Attempt ${error.attemptNumber} failed. There are ${error.retriesLeft} retries left.`);
        }
    });
};

export const searchTracks = async (artist?: string, title?: string, limit: number = 5, cookies?: any[]): Promise<TrackMetadata[]> => {
    const query = [artist, title].filter(Boolean).join(' ');
    const searchUrl = `ytsearch${limit}:${query}`;
    console.log(`[Search] Searching for: ${query}`);
    const args = ['--flat-playlist', '--dump-json'];

    let cookieFile: string | null = null;
    if (cookies && cookies.length > 0 && validateCookies(cookies)) {
        cookieFile = writeCookiesFile(cookies);
        args.push('--cookies', cookieFile);
    }

    try {
        const { stdout } = await execFileAsync(YTDLP_PATH, [...args, searchUrl], { timeout: 30000 });
        const results = stdout.trim() === '' ? [] : stdout.trim().split('\n').map(line => JSON.parse(line));

        return results.map(res => {
            const { title, artists } = parseArtistsTitle(res.title || 'Unknown Title', res.uploader || 'Unknown Artist');

            let coverUrl = res.thumbnail || '';
            if (!coverUrl && Array.isArray(res.thumbnails) && res.thumbnails.length > 0) {
                coverUrl = res.thumbnails[res.thumbnails.length - 1].url || '';
            }

            if (!coverUrl && res.id) {
                coverUrl = `https://i.ytimg.com/vi/${res.id}/mqdefault.jpg`;
            }

            return {
                title,
                artists,
                coverUrl,
                url: `https://www.youtube.com/watch?v=${res.id}`,
                source: SourceType.YOUTUBE
            };
        });
    } finally {
        if (cookieFile && fs.existsSync(cookieFile)) {
            fs.unlinkSync(cookieFile);
        }
    }
};

export const getTrackInfo = async (url: string, cookies?: any[]): Promise<TrackMetadata> => {
    const source = getSourceFromUrl(url);

    switch (source) {
        case SourceType.YOUTUBE: {
            if (cookies && cookies.length > 0 && !validateCookies(cookies)) {
                throw new Error('Invalid cookie format.');
            }

            console.log(`[YouTube] Fetching info: ${url}`);
            const info = await executeYtDlp(url, cookies);
            const { title: parsedTitle, artists: parsedArtists } = parseArtistsTitle(info.title || 'Unknown Title', info.uploader || 'Unknown Artist');

            // Try Spotify lookup for cleaner metadata
            const spotifyInfo = await searchSpotifyTrack(parsedArtists[0], parsedTitle);
            if (spotifyInfo) {
                console.log(`[Spotify] Found match for YouTube track: ${spotifyInfo.artists.join(', ')} - ${spotifyInfo.title}`);
                return { ...spotifyInfo, source: SourceType.YOUTUBE }; // Keep source as YouTube for downstream
            }

            const coverUrl = info.thumbnail || info.thumbnails?.[info.thumbnails.length - 1]?.url || '';
            return { title: parsedTitle, artists: parsedArtists, coverUrl, source: SourceType.YOUTUBE };
        }

        case SourceType.SOUNDCLOUD: {
            return await pRetry(async () => {
                const info = await scdl.getInfo(url);
                const { title, artists } = parseArtistsTitle(info.title || "Unknown Title", info.user?.username || "Unknown Artist");
                let coverUrl = info.artwork_url || info.user?.avatar_url || "";
                if (coverUrl) coverUrl = coverUrl.replace('-large', '-t500x500');
                return { title, artists, coverUrl, source: SourceType.SOUNDCLOUD };
            }, { retries: 2 });
        }

        case SourceType.SPOTIFY: {
            const trackIdMatch = url.match(/track\/([a-zA-Z0-9]+)/);
            if (!trackIdMatch) throw new Error("Invalid Spotify track URL");
            return await getSpotifyTrackInfo(trackIdMatch[1]);
        }

        case SourceType.DEEZER: {
            let targetUrl = url;
            if (url.includes('deezer.page.link') || url.includes('link.deezer.com') || !url.includes('/track/')) {
                try {
                    const response = await fetch(url, { redirect: 'follow' });
                    targetUrl = response.url;
                } catch (e) {
                    console.warn(`[Deezer] Redirect failed: ${e}`);
                }
            }

            const trackIdMatch = targetUrl.match(/track\/([0-9]+)/);
            if (!trackIdMatch) {
                const info = await executeYtDlp(targetUrl);
                return {
                    title: info.track || info.title,
                    artists: info.artist ? [info.artist] : [],
                    coverUrl: info.thumbnail || '',
                    source: SourceType.DEEZER
                };
            }
            return await getDeezerTrackInfo(trackIdMatch[1]);
        }

        case SourceType.APPLE_MUSIC: {
            const info = await executeYtDlp(url);
            return {
                title: info.track || info.title,
                artists: info.artist ? [info.artist] : [],
                coverUrl: info.thumbnail || '',
                source: SourceType.APPLE_MUSIC
            };
        }

        default:
            throw new Error("Unsupported URL.");
    }
};

export const downloadMedia = async (url: string, cookies?: any[], overrides?: { title?: string, artists?: string[] }, mp3SubPath?: string, coverSubPath?: string): Promise<DownloadResult> => {
    const targetMp3Dir = mp3SubPath ? path.join(MP3_DIR, mp3SubPath) : MP3_DIR;
    const targetCoverDir = coverSubPath ? path.join(COVER_DIR, coverSubPath) : COVER_DIR;

    if (!fs.existsSync(targetMp3Dir)) fs.mkdirSync(targetMp3Dir, { recursive: true });
    if (!fs.existsSync(targetCoverDir)) fs.mkdirSync(targetCoverDir, { recursive: true });

    const metadata = await getTrackInfo(url, cookies);

    if (overrides) {
        if (overrides.title) metadata.title = overrides.title;
        if (overrides.artists && overrides.artists.length > 0) metadata.artists = overrides.artists;
    }

    const artistString = metadata.artists.join(', ');
    const filenameBase = sanitizeFilename(`${metadata.title}-${artistString}`);
    const mp3Path = path.join(targetMp3Dir, `${filenameBase}.mp3`);
    const coverPath = path.join(targetCoverDir, `${filenameBase}.jpg`);

    const tempBasePath = path.join(targetMp3Dir, `temp-${Date.now()}`);
    let downloadUrl = url;

    if ([SourceType.SPOTIFY, SourceType.DEEZER, SourceType.APPLE_MUSIC].includes(metadata.source)) {
        const query = `${metadata.artists.join(' ')} - ${metadata.title}`;
        console.log(`[Search] YouTube search for: ${query}`);
        downloadUrl = `ytsearch1:${query}`;
    }

    if (metadata.source !== SourceType.SOUNDCLOUD) {
        const ytdlpArgs = [
            '-f', 'bestaudio',
            '--output', `${tempBasePath}.%(ext)s`,
            '--no-playlist',
            '--js-runtimes', 'node'
        ];

        if (FFMPEG_STATIC_PATH) ytdlpArgs.push('--ffmpeg-location', FFMPEG_STATIC_PATH);

        let cookiesFile: string | null = null;
        if (cookies && cookies.length > 0) {
            cookiesFile = writeCookiesFile(cookies);
            ytdlpArgs.push('--cookies', cookiesFile);
        }

        try {
            await pRetry(async () => {
                await execFileAsync(YTDLP_PATH, [...ytdlpArgs, downloadUrl], { timeout: 300000 });
            }, { retries: 2 });

            const files = fs.readdirSync(targetMp3Dir).filter(f => f.startsWith(`temp-`) && f.includes(tempBasePath.split(path.sep).pop()!));
            if (files.length === 0) throw new Error('Downloaded audio file not found');
            const tempAudioPath = path.join(targetMp3Dir, files[0]);

            await new Promise<void>((resolve, reject) => {
                ffmpeg(tempAudioPath)
                    .audioBitrate(320)
                    .save(mp3Path)
                    .outputOptions('-metadata', `title=${metadata.title}`, '-metadata', `artist=${artistString}`)
                    .on('end', () => resolve())
                    .on('error', (err) => reject(err));
            });

            if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);
        } finally {
            if (cookiesFile && fs.existsSync(cookiesFile)) try { fs.unlinkSync(cookiesFile); } catch (e) { }
        }
    } else {
        const audioStream = await scdl.download(url);
        await new Promise<void>((resolve, reject) => {
            ffmpeg(audioStream)
                .audioBitrate(320)
                .save(mp3Path)
                .outputOptions('-metadata', `title=${metadata.title}`, '-metadata', `artist=${artistString}`)
                .on('end', () => resolve())
                .on('error', (err) => reject(err));
        });
    }

    if (metadata.coverUrl) {
        try {
            await pRetry(() => downloadImage(metadata.coverUrl, coverPath), { retries: 2 });
        } catch (e) {
            console.error("Failed to download cover:", e);
        }
    }

    return { mp3Path, coverPath, metadata };
};
