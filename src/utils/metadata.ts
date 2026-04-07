import { parseFile } from 'music-metadata';
import path from 'path';
import { SourceType } from '../types/metadata';

/**
 * Identifies the source type from a given URL.
 */
export const getSourceFromUrl = (url: string): SourceType | null => {
    if (url.includes('youtube.com') || url.includes('youtu.be')) return SourceType.YOUTUBE;
    if (url.includes('soundcloud.com')) return SourceType.SOUNDCLOUD;
    if (url.includes('spotify.com')) return SourceType.SPOTIFY;
    if (url.includes('deezer.com') || url.includes('deezer.page.link')) return SourceType.DEEZER;
    if (url.includes('music.apple.com')) return SourceType.APPLE_MUSIC;
    return null;
};

/**
 * Parses artist and title information from a raw title string.
 */
export const parseArtistsTitle = (fullTitle: string, uploaderName: string): { title: string, artists: string[] } => {
    let title = fullTitle;
    let artists: string[] = [uploaderName];

    const separatorRegex = / - /;
    if (separatorRegex.test(title)) {
        const parts = title.split(separatorRegex);
        if (parts.length >= 2) {
            // Assuming "Artist - Title"
            artists = [parts[0].trim()];
            title = parts.slice(1).join(" - ").trim();
        }
    }

    title = title.replace(/\([^)]*Official[^)]*\)/gi, '')
        .replace(/\([^)]*Video[^)]*\)/gi, '')
        .replace(/\(^\)/g, '').trim();

    return { title, artists };
};

/**
 * Gets the audio ID from ID3 tags (Title-Artist) or falls back to filename.
 */
export const getAudioId = async (filePath: string): Promise<string> => {
    try {
        const metadata = await parseFile(filePath);
        const { title, artists, artist } = metadata.common;
        
        // If 'artists' array exists, join them for a complete artist string
        const artistValue = (artists && artists.length > 0) ? artists.join(', ') : artist;

        if (title && artistValue) {
            return `${title}-${artistValue}`;
        } else if (title) {
            return title;
        } else if (artistValue) {
            return artistValue;
        }
    } catch (error) {
        // Fallback to filename if parsing fails or tags are missing
    }
    return path.parse(filePath).name;
};
