import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import scdl from 'soundcloud-downloader';
import { sanitizeFilename, parseArtistsTitle, validateCookies, writeCookiesFile, SourceType, getSourceFromUrl } from './helpers';

const execFileAsync = promisify(execFile);

if (ffmpegStatic) {
    ffmpeg.setFfmpegPath(ffmpegStatic);
}

const YTDLP_FILENAME = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const YTDLP_PATH = path.join(process.cwd(), YTDLP_FILENAME);
const MP3_DIR = path.resolve(process.env.MP3_DOWNLOAD_DIR ?? '')
const COVER_DIR = path.resolve(process.env.COVER_DOWNLOAD_DIR ?? '')

if (!fs.existsSync(MP3_DIR)) {
    throw new Error(`MP3 download directory not found: ${MP3_DIR}. Please create it manually.`);
}

if (!fs.existsSync(COVER_DIR)) {
    throw new Error(`Cover download directory not found: ${COVER_DIR}. Please create it manually.`);
}


export interface TrackMetadata {
    title: string;
    artists: string[];
    coverUrl: string;
    source: SourceType;
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

const executeYtDlp = async (url: string, cookies?: any[], extraArgs: string[] = []): Promise<any> => {
    const args = ['--dump-json', '--no-playlist', '--js-runtimes', 'node', ...extraArgs];

    if (ffmpegStatic) {
        args.push('--ffmpeg-location', ffmpegStatic);
    }

    let cookiesFile: string | null = null;
    if (cookies && cookies.length > 0) {
        cookiesFile = writeCookiesFile(cookies);
        args.push('--cookies', cookiesFile);
    }

    try {
        const { stdout } = await execFileAsync(YTDLP_PATH, [...args, url]);
        return JSON.parse(stdout);
    } finally {
        if (cookiesFile && fs.existsSync(cookiesFile)) {
            fs.unlinkSync(cookiesFile);
        }
    }
};

export const getTrackInfo = async (url: string, cookies?: any[]): Promise<TrackMetadata> => {
    const source = getSourceFromUrl(url);

    switch (source) {
        case SourceType.YOUTUBE: {
            if (cookies && cookies.length > 0 && !validateCookies(cookies)) {
                throw new Error('Invalid cookie format. Each cookie must have at least "name" and "value" properties.');
            }

            console.log(`[YouTube] Fetching info with yt-dlp${cookies ? ` (${cookies.length} cookies)` : ''}`);
            const info = await executeYtDlp(url, cookies);

            const { title, artists } = parseArtistsTitle(info.title || 'Unknown Title', info.uploader || 'Unknown Artist');

            const coverUrl = info.thumbnail || info.thumbnails?.[info.thumbnails.length - 1]?.url || '';

            return {
                title,
                artists,
                coverUrl,
                source: SourceType.YOUTUBE
            };
        }

        case SourceType.SOUNDCLOUD: {
            const info = await scdl.getInfo(url);
            const { title, artists } = parseArtistsTitle(info.title || "Unknown Title", info.user?.username || "Unknown Artist");

            let coverUrl = info.artwork_url || info.user?.avatar_url || "";
            if (coverUrl) {
                coverUrl = coverUrl.replace('-large', '-t500x500');
            }

            return {
                title,
                artists,
                coverUrl,
                source: SourceType.SOUNDCLOUD
            };
        }

        case SourceType.SPOTIFY: {
            const trackIdMatch = url.match(/track\/([a-zA-Z0-9]+)/);
            if (!trackIdMatch) throw new Error("Invalid Spotify track URL");
            const trackId = trackIdMatch[1];
            console.log(`[Spotify] Fetching metadata for track ID: ${trackId}`);
            return await getSpotifyTrackInfo(trackId);
        }

        case SourceType.DEEZER: {
            let targetUrl = url;
            if (url.includes('deezer.page.link') || url.includes('link.deezer.com') || !url.includes('/track/')) {
                console.log(`[Deezer] Following redirect for: ${url}`);
                try {
                    const response = await fetch(url, { redirect: 'follow' });
                    targetUrl = response.url;
                    console.log(`[Deezer] Redirected to: ${targetUrl}`);
                } catch (e) {
                    console.warn(`[Deezer] Redirect failed: ${e}. Proceeding with original URL.`);
                }
            }

            const trackIdMatch = targetUrl.match(/track\/([0-9]+)/);
            if (!trackIdMatch) {
                console.log(`[Deezer] No track ID found in URL (${targetUrl}), falling back to yt-dlp`);
                const info = await executeYtDlp(targetUrl);
                return {
                    title: info.track || info.title,
                    artists: info.artist ? [info.artist] : [],
                    coverUrl: info.thumbnail || '',
                    source: SourceType.DEEZER
                };
            }
            const trackId = trackIdMatch[1];
            console.log(`[Deezer] Fetching metadata for track ID: ${trackId}`);
            return await getDeezerTrackInfo(trackId);
        }

        case SourceType.APPLE_MUSIC: {
            console.log(`[Apple Music] Fetching metadata with yt-dlp`);
            const info = await executeYtDlp(url);
            return {
                title: info.track || info.title,
                artists: info.artist ? [info.artist] : [],
                coverUrl: info.thumbnail || '',
                source: SourceType.APPLE_MUSIC
            };
        }

        default:
            throw new Error("Unsupported URL. YouTube, SoundCloud, Spotify, Deezer and Apple Music are supported.");
    }
};

export const downloadMedia = async (url: string, cookies?: any[], overrides?: { title?: string, artists?: string[] }): Promise<DownloadResult> => {
    if (!fs.existsSync(MP3_DIR)) {
        throw new Error(`MP3 download directory not found: ${MP3_DIR}. Please create it manually.`);
    }

    if (!fs.existsSync(COVER_DIR)) {
        throw new Error(`Cover download directory not found: ${COVER_DIR}. Please create it manually.`);
    }

    const metadata = await getTrackInfo(url, cookies);

    if (overrides) {
        if (overrides.title) metadata.title = overrides.title;
        if (overrides.artists && overrides.artists.length > 0) metadata.artists = overrides.artists;
    }

    const artistString = metadata.artists.join(', ');
    const filenameBase = sanitizeFilename(`${metadata.title}-${artistString}`);
    const mp3Path = path.join(MP3_DIR, `${filenameBase}.mp3`);
    const coverPath = path.join(COVER_DIR, `${filenameBase}.jpg`);

    if (metadata.coverUrl) {
        try {
            await downloadImage(metadata.coverUrl, coverPath);
        } catch (e) {
            console.error("Failed to download cover:", e);
        }
    }

    if (metadata.source === SourceType.YOUTUBE) {
        const tempBasePath = path.join(MP3_DIR, `temp-${Date.now()}`);
        const ytdlpArgs = [
            '-f', 'bestaudio',
            '--output', `${tempBasePath}.%(ext)s`,
            '--no-playlist',
            '--js-runtimes', 'node'
        ];

        if (ffmpegStatic) {
            ytdlpArgs.push('--ffmpeg-location', ffmpegStatic);
        }

        let cookiesFile: string | null = null;
        if (cookies && cookies.length > 0) {
            if (!validateCookies(cookies)) {
                throw new Error('Invalid cookie format. Each cookie must have at least "name" and "value" properties.');
            }
            cookiesFile = writeCookiesFile(cookies);
            ytdlpArgs.push('--cookies', cookiesFile);
        }

        try {
            await execFileAsync(YTDLP_PATH, [...ytdlpArgs, url]);

            const files = fs.readdirSync(MP3_DIR).filter(f => f.startsWith(`temp-`) && f.includes(tempBasePath.split(path.sep).pop()!));
            if (files.length === 0) {
                throw new Error('Downloaded audio file not found');
            }
            const tempAudioPath = path.join(MP3_DIR, files[0]);

            await new Promise<void>((resolve, reject) => {
                ffmpeg(tempAudioPath)
                    .audioBitrate(320)
                    .save(mp3Path)
                    .outputOptions('-metadata', `title=${metadata.title}`)
                    .outputOptions('-metadata', `artist=${artistString}`)
                    .on('end', () => resolve())
                    .on('error', (err) => reject(err));
            });

            if (fs.existsSync(tempAudioPath)) {
                fs.unlinkSync(tempAudioPath);
            }
        } finally {
            if (cookiesFile && fs.existsSync(cookiesFile)) {
                fs.unlinkSync(cookiesFile);
            }
        }
    } else if (metadata.source === SourceType.SPOTIFY || metadata.source === SourceType.DEEZER || metadata.source === SourceType.APPLE_MUSIC) {
        const query = `${metadata.artists.join(' ')} - ${metadata.title}`;
        console.log(`[Search] Searching YouTube for: ${query} (${metadata.source})`);
        const searchUrl = `ytsearch1:${query}`;

        const tempBasePath = path.join(MP3_DIR, `temp-${Date.now()}`);
        const ytdlpArgs = [
            '-f', 'bestaudio',
            '--output', `${tempBasePath}.%(ext)s`,
            '--no-playlist'
        ];

        if (ffmpegStatic) {
            ytdlpArgs.push('--ffmpeg-location', ffmpegStatic);
        }

        try {
            await execFileAsync(YTDLP_PATH, [...ytdlpArgs, searchUrl]);

            const files = fs.readdirSync(MP3_DIR).filter(f => f.startsWith(`temp-`) && f.includes(tempBasePath.split(path.sep).pop()!));
            if (files.length === 0) {
                throw new Error('Search result download failed');
            }
            const tempAudioPath = path.join(MP3_DIR, files[0]);

            await new Promise<void>((resolve, reject) => {
                ffmpeg(tempAudioPath)
                    .audioBitrate(320)
                    .save(mp3Path)
                    .outputOptions('-metadata', `title=${metadata.title}`)
                    .outputOptions('-metadata', `artist=${artistString}`)
                    .on('end', () => resolve())
                    .on('error', (err) => reject(err));
            });

            if (fs.existsSync(tempAudioPath)) {
                fs.unlinkSync(tempAudioPath);
            }
        } catch (e) {
            console.error("Spotify search/download failed:", e);
            throw e;
        }
    } else {
        const audioStream = await scdl.download(url);
        await new Promise<void>((resolve, reject) => {
            ffmpeg(audioStream)
                .audioBitrate(320)
                .save(mp3Path)
                .outputOptions('-metadata', `title=${metadata.title}`)
                .outputOptions('-metadata', `artist=${artistString}`)
                .on('end', () => resolve())
                .on('error', (err) => reject(err));
        });
    }

    return {
        mp3Path,
        coverPath,
        metadata
    };
};
