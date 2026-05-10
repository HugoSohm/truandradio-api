import { execFile, spawn } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import pRetry from 'p-retry';
import path from 'path';
import scdl from 'soundcloud-downloader';
import { PassThrough, Readable } from 'stream';
import { promisify } from 'util';

import { SourceType, TrackMetadata } from '../types/metadata';
import { DownloadResult } from '../types/responses';
import { validateCookies, writeCookiesFile } from '../utils/cookies';
import { getSourceFromUrl, parseArtistsTitle } from '../utils/metadata';
import { sanitizeFilename } from '../utils/string';

import os from 'os';
import env from '../lib/env';
import logger from '../utils/logger';
import { getDeezerTrackInfo } from './deezer';
import { downloadImage } from './image';
import { getSpotifyTrackInfo, searchSpotifyTrack } from './spotify';
import { executeYtDlp, FFMPEG_STATIC_PATH, YTDLP_PATH } from './yt-dlp';

const execFileAsync = promisify(execFile);

if (FFMPEG_STATIC_PATH) {
    ffmpeg.setFfmpegPath(FFMPEG_STATIC_PATH);
}


// We no longer need to create local directories as we will use os.tmpdir() for staging.

/**
 * Searches for tracks using yt-dlp.
 */
export const searchTracks = async (artist?: string, title?: string, limit: number = 5, cookies?: any[]): Promise<TrackMetadata[]> => {
    const query = [artist, title].filter(Boolean).join(' ');
    const searchUrl = `ytsearch${limit}:${query}`;
    logger.info({ module: 'Search' }, `Searching for: ${query}`);
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
            try { fs.unlinkSync(cookieFile); } catch (e) { }
        }
    }
};

/**
 * Extracts playlist information using yt-dlp.
 */
export const getPlaylistInfo = async (url: string, cookies?: any[]): Promise<TrackMetadata[]> => {
    logger.info({ module: 'Playlist' }, `Extracting info for: ${url}`);
    const args = ['--flat-playlist', '--dump-json'];

    let cookieFile: string | null = null;
    if (cookies && cookies.length > 0 && validateCookies(cookies)) {
        cookieFile = writeCookiesFile(cookies);
        args.push('--cookies', cookieFile);
    }

    try {
        const { stdout } = await execFileAsync(YTDLP_PATH, [...args, url], { timeout: 60000 });
        const results = stdout.trim() === '' ? [] : stdout.trim().split('\n').map(line => {
            try { return JSON.parse(line); } catch (e) { return null; }
        }).filter(Boolean);

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
            try { fs.unlinkSync(cookieFile); } catch (e) { }
        }
    }
};

/**
 * Orchestrates metadata extraction from various sources.
 */
export const getTrackInfo = async (url: string, cookies?: any[]): Promise<TrackMetadata[]> => {
    const source = getSourceFromUrl(url);

    if (source === SourceType.YOUTUBE && url.includes('list=')) {
        return await getPlaylistInfo(url, cookies);
    }

    switch (source) {
        case SourceType.YOUTUBE: {
            if (cookies && cookies.length > 0 && !validateCookies(cookies)) {
                throw new Error('Invalid cookie format.');
            }

            const info = await executeYtDlp(url, cookies);
            const { title: parsedTitle, artists: parsedArtists } = parseArtistsTitle(info.title || 'Unknown Title', info.uploader || 'Unknown Artist');

            const spotifyInfo = await searchSpotifyTrack(parsedArtists[0], parsedTitle);
            if (spotifyInfo) {
                logger.info({ module: 'Spotify' }, `Found match for YouTube track: ${spotifyInfo.artists.join(', ')} - ${spotifyInfo.title}`);
                return [{ ...spotifyInfo, source: SourceType.YOUTUBE, url }];
            }

            const coverUrl = info.thumbnail || info.thumbnails?.[info.thumbnails.length - 1]?.url || '';
            return [{ title: parsedTitle, artists: parsedArtists, coverUrl, source: SourceType.YOUTUBE, url }];
        }

        case SourceType.SOUNDCLOUD: {
            let targetUrl = url;
            if (url.includes('on.soundcloud.com')) {
                try {
                    const response = await fetch(url, { redirect: 'follow', method: 'HEAD' });
                    targetUrl = response.url;
                } catch (e) {
                    logger.warn({ module: 'SoundCloud', err: e }, `Redirect failed for ${url}`);
                }
            }

            return await pRetry(async () => {
                const info = await scdl.getInfo(targetUrl);
                const { title, artists } = parseArtistsTitle(info.title || "Unknown Title", info.user?.username || "Unknown Artist");
                let coverUrl = info.artwork_url || info.user?.avatar_url || "";
                if (coverUrl) coverUrl = coverUrl.replace('-large', '-t500x500');
                return [{ title, artists, coverUrl, source: SourceType.SOUNDCLOUD, url: targetUrl }];
            }, { retries: 2 });
        }

        case SourceType.SPOTIFY: {
            let targetUrl = url;
            if (url.includes('spotify.link')) {
                try {
                    const response = await fetch(url, { redirect: 'follow', method: 'HEAD' });
                    targetUrl = response.url;
                } catch (e) {
                    logger.warn({ module: 'Spotify', err: e }, `Redirect failed for ${url}`);
                }
            }
            const trackIdMatch = targetUrl.match(/track\/([a-zA-Z0-9]+)/);
            if (!trackIdMatch) throw new Error("Invalid Spotify track URL");
            const info = await getSpotifyTrackInfo(trackIdMatch[1]);
            return [{ ...info, url: targetUrl }];
        }

        case SourceType.DEEZER: {
            let targetUrl = url;
            if (url.includes('deezer.page.link') || url.includes('link.deezer.com') || !url.includes('/track/')) {
                try {
                    const response = await fetch(url, { redirect: 'follow' });
                    targetUrl = response.url;
                } catch (e) {
                    logger.warn({ module: 'Deezer', err: e }, `Redirect failed`);
                }
            }

            const trackIdMatch = targetUrl.match(/track\/([0-9]+)/);
            if (!trackIdMatch) {
                const info = await executeYtDlp(targetUrl);
                return [{
                    title: info.track || info.title,
                    artists: info.artist ? [info.artist] : [],
                    coverUrl: info.thumbnail || '',
                    source: SourceType.DEEZER,
                    url: targetUrl
                }];
            }
            const info = await getDeezerTrackInfo(trackIdMatch[1]);
            return [{ ...info, url: targetUrl }];
        }

        case SourceType.APPLE_MUSIC: {
            const info = await executeYtDlp(url);
            return [{
                title: info.track || info.title,
                artists: info.artist ? [info.artist] : [],
                coverUrl: info.thumbnail || '',
                source: SourceType.APPLE_MUSIC,
                url
            }];
        }

        default:
            throw new Error("Unsupported URL.");
    }
};

/**
 * Downloads media and covers and processes them with FFmpeg.
 */
export const downloadMedia = async (url: string, cookies?: any[], overrides?: { title?: string, artists?: string[] }, playlists?: string[]): Promise<DownloadResult> => {
    // We use a temporary directory for the entire process
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'radio-api-'));

    try {
        const metadataResults = await getTrackInfo(url, cookies);
        if (metadataResults.length === 0) throw new Error('No metadata found for URL');
        const metadata = metadataResults[0];

        if (overrides) {
            if (overrides.title) metadata.title = overrides.title;
            if (overrides.artists && overrides.artists.length > 0) metadata.artists = overrides.artists;
        }

        const artistString = sanitizeFilename(metadata.artists.join(', '));
        const titleString = sanitizeFilename(metadata.title);
        const filenameBase = sanitizeFilename(`${titleString}-${artistString}`);

        const audioPath = path.join(tempDir, `${filenameBase}.mp3`);
        const coverPath = path.join(tempDir, `${filenameBase}.jpg`);

        const tempAudioOutputPath = path.join(tempDir, `downloaded-audio`);
        let downloadUrl = url;

        if ([SourceType.SPOTIFY, SourceType.DEEZER, SourceType.APPLE_MUSIC].includes(metadata.source)) {
            const query = `${metadata.artists.join(' ')} - ${metadata.title}`;
            logger.info({ module: 'Search' }, `YouTube search for: ${query}`);
            downloadUrl = `ytsearch1:${query}`;
        }

        if (metadata.source !== SourceType.SOUNDCLOUD) {
            const ytdlpArgs = [
                '-f', 'bestaudio',
                '--output', `${tempAudioOutputPath}.%(ext)s`,
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

                const files = fs.readdirSync(tempDir).filter(f => f.startsWith(`downloaded-audio`));
                if (files.length === 0) throw new Error('Downloaded audio file not found');
                const tempAudioPath = path.join(tempDir, files[0]);

                await new Promise<void>((resolve, reject) => {
                    ffmpeg(tempAudioPath)
                        .audioBitrate(320)
                        .save(audioPath)
                        .outputOptions('-metadata', `title=${titleString}`, '-metadata', `artist=${artistString}`)
                        .on('end', () => resolve())
                        .on('error', (err) => reject(err));
                });

                if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);
            } finally {
                if (cookiesFile && fs.existsSync(cookiesFile)) try { fs.unlinkSync(cookiesFile); } catch (e) { }
            }
        } else {
            const audioStream = await scdl.download(metadata.url || url);
            await new Promise<void>((resolve, reject) => {
                ffmpeg(audioStream)
                    .audioBitrate(320)
                    .save(audioPath)
                    .outputOptions('-metadata', `title=${titleString}`, '-metadata', `artist=${artistString}`)
                    .on('end', () => resolve())
                    .on('error', (err) => reject(err));
            });
        }

        if (metadata.coverUrl) {
            try {
                await pRetry(() => downloadImage(metadata.coverUrl, coverPath), { retries: 2 });
            } catch (e) {
                logger.error({ err: e }, "Failed to download cover");
            }
        }

        const playlistsArray = playlists && playlists.length > 0 ? playlists : [''];
        const mainPlaylist = playlistsArray[0];
        const relativeAudioPath = mainPlaylist ? `${mainPlaylist}/${path.basename(audioPath)}` : path.basename(audioPath);
        const relativeCoverPath = mainPlaylist ? `${mainPlaylist}/${path.basename(coverPath)}` : path.basename(coverPath);

        // Save to target directories (S3 mount)
        for (const p of playlistsArray) {
            const finalAudioDir = path.join(env.STORAGE_PATH, env.AUDIO_DOWNLOAD_DIR, p);
            const finalCoverDir = path.join(env.STORAGE_PATH, env.COVER_DOWNLOAD_DIR, p);

            if (!fs.existsSync(finalAudioDir)) fs.mkdirSync(finalAudioDir, { recursive: true });
            if (!fs.existsSync(finalCoverDir)) fs.mkdirSync(finalCoverDir, { recursive: true });

            fs.copyFileSync(audioPath, path.join(finalAudioDir, path.basename(audioPath)));
            if (fs.existsSync(coverPath)) {
                fs.copyFileSync(coverPath, path.join(finalCoverDir, path.basename(coverPath)));
            }
        }

        const baseUrl = env.BASE_URL?.replace(/\/$/, '') || '';

        return {
            audioUrl: `${baseUrl}/mp3/${relativeAudioPath}`,
            coverUrl: `${baseUrl}/cover/${relativeCoverPath}`,
            metadata
        };
    } finally {
        // Always clean up the temporary directory
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (e) {
            logger.warn({ err: e, path: tempDir }, "Failed to remove temporary download directory");
        }
    }
};

/**
 * Returns a media stream for playback.
 */
export const getMediaStream = async (url: string, cookies?: any[], overrides?: { title?: string, artists?: string[] }) => {
    const metadataResults = await getTrackInfo(url, cookies);
    if (metadataResults.length === 0) throw new Error('No metadata found for URL');
    const metadata = metadataResults[0];

    if (overrides) {
        if (overrides.title) metadata.title = overrides.title;
        if (overrides.artists && overrides.artists.length > 0) metadata.artists = overrides.artists;
    }

    const artistString = sanitizeFilename(metadata.artists.join(', '));
    const titleString = sanitizeFilename(metadata.title);
    const filename = sanitizeFilename(`${titleString}-${artistString}`) + '.mp3';

    let inputStream: Readable;
    let downloadUrl = url;

    if ([SourceType.SPOTIFY, SourceType.DEEZER, SourceType.APPLE_MUSIC].includes(metadata.source)) {
        const query = `${metadata.artists.join(' ')} - ${metadata.title}`;
        downloadUrl = `ytsearch1:${query}`;
    }

    if (metadata.source !== SourceType.SOUNDCLOUD) {
        const ytdlpArgs = [
            '-f', 'bestaudio',
            '--output', '-',
            '--no-playlist',
            '--js-runtimes', 'node'
        ];

        if (FFMPEG_STATIC_PATH) ytdlpArgs.push('--ffmpeg-location', FFMPEG_STATIC_PATH);

        let cookiesFile: string | null = null;
        if (cookies && cookies.length > 0) {
            cookiesFile = writeCookiesFile(cookies);
            ytdlpArgs.push('--cookies', cookiesFile);
        }

        const ytProcess = spawn(YTDLP_PATH, [...ytdlpArgs, downloadUrl]);
        inputStream = ytProcess.stdout;

        ytProcess.on('close', () => {
            if (cookiesFile && fs.existsSync(cookiesFile)) {
                try { fs.unlinkSync(cookiesFile); } catch (e) { }
            }
        });
    } else {
        inputStream = await scdl.download(metadata.url || url);
    }

    const outStream = new PassThrough();

    ffmpeg(inputStream)
        .audioBitrate(320)
        .format('mp3')
        .outputOptions(
            '-metadata', `title=${titleString}`,
            '-metadata', `artist=${artistString}`,
            '-id3v2_version', '3',
            '-write_id3v1', '1'
        )
        .on('error', (err) => {
            logger.error({ err }, '[FFmpeg Stream Error]');
            outStream.destroy(err);
        })
        .pipe(outStream);

    return {
        stream: outStream,
        filename,
        metadata
    };
};
