import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
// @ts-ignore
import scdl from 'soundcloud-downloader';

const execFileAsync = promisify(execFile);

// Ensure ffmpeg binary is set
if (ffmpegStatic) {
    ffmpeg.setFfmpegPath(ffmpegStatic);
}

const YTDLP_FILENAME = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
const YTDLP_PATH = path.join(process.cwd(), YTDLP_FILENAME);

const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR
    ? path.resolve(process.env.DOWNLOAD_DIR)
    : path.join(process.cwd(), 'downloads');

if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR);
}

export enum SourceType {
    YOUTUBE = 'youtube',
    SOUNDCLOUD = 'soundcloud'
}

export interface TrackMetadata {
    title: string;
    artists: string[]; // List of artists
    coverUrl: string;
    source: SourceType;
    _raw?: any; // Internal use for optimization
}

export interface DownloadResult {
    mp3Path: string;
    coverPath: string;
    metadata: TrackMetadata;
}

const sanitizeFilename = (str: string): string => {
    return str.replace(/[^a-z0-9\u00C0-\u024F\s-]/gi, '').trim();
};

const downloadImage = async (url: string, filepath: string): Promise<void> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buffer));
};

const parseArtistsTitle = (fullTitle: string, uploaderName: string): { title: string, artists: string[] } => {
    let title = fullTitle;
    let artists: string[] = [uploaderName];

    // Attempt to parse "Artist - Title" format
    const separatorRegex = / - /;
    if (separatorRegex.test(title)) {
        const parts = title.split(separatorRegex);
        if (parts.length >= 2) {
            // Assuming "Artist - Title"
            artists = [parts[0].trim()];
            title = parts.slice(1).join(" - ").trim();
        }
    }

    // Clean up title (remove (Official Video), empty brackets, etc.)
    title = title.replace(/\([^)]*Official[^)]*\)/gi, '')
        .replace(/\([^)]*Video[^)]*\)/gi, '')
        .replace(/\(^\)/g, '').trim();

    return { title, artists };
};

const validateCookies = (cookies: any[]): boolean => {
    if (!Array.isArray(cookies)) return false;
    return cookies.every(cookie =>
        cookie &&
        typeof cookie === 'object' &&
        typeof cookie.name === 'string' &&
        typeof cookie.value === 'string'
    );
};

// Helper to write cookies to Netscape format for yt-dlp
const writeCookiesFile = (cookies: any[]): string => {
    const tempPath = path.join(process.cwd(), `cookies-${Date.now()}.txt`);
    const netscapeCookies = cookies.map(cookie => {
        const domain = cookie.domain || '.youtube.com';
        const flag = domain.startsWith('.') ? 'TRUE' : 'FALSE';
        const path = cookie.path || '/';
        const secure = cookie.secure ? 'TRUE' : 'FALSE';
        const expiration = cookie.expirationDate ? Math.floor(cookie.expirationDate) : 0;
        const name = cookie.name;
        const value = cookie.value;
        return `${domain}\t${flag}\t${path}\t${secure}\t${expiration}\t${name}\t${value}`;
    }).join('\n');

    fs.writeFileSync(tempPath, `# Netscape HTTP Cookie File\n${netscapeCookies}`, 'utf-8');
    return tempPath;
};

// Helper to execute yt-dlp and get JSON output
const executeYtDlp = async (url: string, cookies?: any[], extraArgs: string[] = []): Promise<any> => {
    const args = ['--dump-json', '--no-playlist', ...extraArgs];

    // Add ffmpeg location if available
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
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        if (cookies && cookies.length > 0 && !validateCookies(cookies)) {
            throw new Error('Invalid cookie format. Each cookie must have at least "name" and "value" properties.');
        }

        console.log(`[YouTube] Fetching info with yt-dlp${cookies ? ` (${cookies.length} cookies)` : ''}`);
        const info = await executeYtDlp(url, cookies);

        const { title, artists } = parseArtistsTitle(info.title || 'Unknown Title', info.uploader || 'Unknown Artist');

        // Select high-res thumbnail
        const coverUrl = info.thumbnail || info.thumbnails?.[info.thumbnails.length - 1]?.url || '';

        return {
            title,
            artists,
            coverUrl,
            source: SourceType.YOUTUBE,
            _raw: info
        };

    } else if (url.includes('soundcloud.com')) {
        const info = await scdl.getInfo(url); // scdl usually handles this, or usage is different
        const { title, artists } = parseArtistsTitle(info.title || "Unknown Title", info.user?.username || "Unknown Artist");

        let coverUrl = info.artwork_url || info.user?.avatar_url || "";
        if (coverUrl) {
            coverUrl = coverUrl.replace('-large', '-t500x500'); // Better quality
        }

        return {
            title,
            artists,
            coverUrl,
            source: SourceType.SOUNDCLOUD,
            _raw: info
        };
    }
    throw new Error("Unsupported URL. Only YouTube and SoundCloud are supported.");
};

export const downloadMedia = async (url: string, cookies?: any[], overrides?: { title?: string, artists?: string[] }): Promise<DownloadResult> => {
    // 1. Get Info
    const metadata = await getTrackInfo(url, cookies);

    // 2. Apply Overrides
    if (overrides) {
        if (overrides.title) metadata.title = overrides.title;
        if (overrides.artists && overrides.artists.length > 0) metadata.artists = overrides.artists;
    }

    const artistString = metadata.artists.join(', ');
    const filenameBase = sanitizeFilename(`${metadata.title}-${artistString}`);

    const mp3Path = path.join(DOWNLOAD_DIR, `${filenameBase}.mp3`);
    const coverPath = path.join(DOWNLOAD_DIR, `${filenameBase}.jpg`);

    // 3. Download Cover
    if (metadata.coverUrl) {
        try {
            await downloadImage(metadata.coverUrl, coverPath);
        } catch (e) {
            console.error("Failed to download cover:", e);
        }
    }

    // 4. Download & Convert Audio
    if (metadata.source === SourceType.YOUTUBE) {
        // Use yt-dlp to download audio (without conversion)
        const tempBasePath = path.join(DOWNLOAD_DIR, `temp-${Date.now()}`);
        const ytdlpArgs = [
            '-f', 'bestaudio',
            '--output', `${tempBasePath}.%(ext)s`,
            '--no-playlist'
        ];

        // Add ffmpeg location if available
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

            // Find the downloaded file (extension varies: webm, m4a, opus, etc.)
            const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.startsWith(`temp-`) && f.includes(tempBasePath.split(path.sep).pop()!));
            if (files.length === 0) {
                throw new Error('Downloaded audio file not found');
            }
            const tempAudioPath = path.join(DOWNLOAD_DIR, files[0]);

            // Convert to MP3 with metadata using ffmpeg
            await new Promise<void>((resolve, reject) => {
                ffmpeg(tempAudioPath)
                    .audioBitrate(320)
                    .save(mp3Path)
                    .outputOptions('-metadata', `title=${metadata.title}`)
                    .outputOptions('-metadata', `artist=${artistString}`)
                    .on('end', () => resolve())
                    .on('error', (err) => reject(err));
            });

            // Clean up temp file
            if (fs.existsSync(tempAudioPath)) {
                fs.unlinkSync(tempAudioPath);
            }
        } finally {
            if (cookiesFile && fs.existsSync(cookiesFile)) {
                fs.unlinkSync(cookiesFile);
            }
        }
    } else {
        // SoundCloud: keep existing stream-based approach
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
