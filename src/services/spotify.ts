import env from '../lib/env';
import { SourceType, TrackMetadata } from '../types/metadata';
import logger from '../utils/logger';

/**
 * Retrieves a Spotify access token using client credentials.
 */
export const getSpotifyAccessToken = async (): Promise<string> => {
    const clientId = env.SPOTIFY_CLIENT_ID;
    const clientSecret = env.SPOTIFY_CLIENT_SECRET;

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

/**
 * Retrieves track information from Spotify by track ID.
 */
export const getSpotifyTrackInfo = async (trackId: string): Promise<TrackMetadata> => {
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

/**
 * Searches for a track on Spotify by artist and title.
 */
export const searchSpotifyTrack = async (artist: string, title: string): Promise<TrackMetadata | null> => {
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
        logger.error({ module: 'Spotify Search', err: error }, `Search failed`);
        return null;
    }
};
