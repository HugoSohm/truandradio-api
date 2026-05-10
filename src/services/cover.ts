import { execFile } from 'child_process';
import { promisify } from 'util';
import { SourceType } from '../types/metadata';
import logger from '../utils/logger';
import { searchSpotifyTrack } from './spotify';
import { YTDLP_PATH } from './yt-dlp';

const execFileAsync = promisify(execFile);

export interface CoverSearchResult {
    coverUrl: string;
    source: SourceType;
}

/**
 * Searches for a cover across multiple sources in order: Spotify, SoundCloud, YouTube.
 */
export const searchCoverAcrossSources = async (artist: string, title: string): Promise<CoverSearchResult | null> => {
    // 1. Spotify
    try {
        const spotifyResult = await searchSpotifyTrack(artist, title);
        if (spotifyResult && spotifyResult.coverUrl) {
            return {
                coverUrl: spotifyResult.coverUrl,
                source: SourceType.SPOTIFY
            };
        }
    } catch (e) {
        logger.warn({ module: 'CoverSearch', source: 'Spotify', err: e }, 'Spotify search failed');
    }

    // 2. SoundCloud
    try {
        const query = `${artist} - ${title}`;
        const scResult = await searchYtDlpCover(`scsearch1:${query}`);
        if (scResult) {
            return {
                coverUrl: scResult,
                source: SourceType.SOUNDCLOUD
            };
        }
    } catch (e) {
        logger.warn({ module: 'CoverSearch', source: 'SoundCloud', err: e }, 'SoundCloud search failed');
    }

    // 3. YouTube (last resort)
    try {
        const query = `${artist} - ${title}`;
        const ytResult = await searchYtDlpCover(`ytsearch1:${query}`);
        if (ytResult) {
            return {
                coverUrl: ytResult,
                source: SourceType.YOUTUBE
            };
        }
    } catch (e) {
        logger.warn({ module: 'CoverSearch', source: 'YouTube', err: e }, 'YouTube search failed');
    }

    return null;
};

/**
 * Uses yt-dlp to search for a track and extract its thumbnail.
 */
async function searchYtDlpCover(query: string): Promise<string | null> {
    const args = ['--flat-playlist', '--dump-json', '--no-playlist'];

    try {
        const { stdout } = await execFileAsync(YTDLP_PATH, [...args, query], { timeout: 30000 });
        if (!stdout.trim()) return null;

        const res = JSON.parse(stdout.split('\n')[0]);
        let coverUrl = res.thumbnail || '';

        if (!coverUrl && Array.isArray(res.thumbnails) && res.thumbnails.length > 0) {
            // Pick the highest resolution one
            coverUrl = res.thumbnails[res.thumbnails.length - 1].url || '';
        }

        // If it's a youtube link, we can fallback to higher res if possible
        if (!coverUrl && res.id && query.startsWith('ytsearch')) {
            coverUrl = `https://i.ytimg.com/vi/${res.id}/maxresdefault.jpg`;
        }

        return coverUrl || null;
    } catch (e) {
        return null;
    }
}
