import fs from 'fs';
import path from 'path';

export enum SourceType {
    YOUTUBE = 'youtube',
    SOUNDCLOUD = 'soundcloud',
    SPOTIFY = 'spotify',
    DEEZER = 'deezer',
    APPLE_MUSIC = 'apple_music'
}

export const getSourceFromUrl = (url: string): SourceType | null => {
    if (url.includes('youtube.com') || url.includes('youtu.be')) return SourceType.YOUTUBE;
    if (url.includes('soundcloud.com')) return SourceType.SOUNDCLOUD;
    if (url.includes('spotify.com')) return SourceType.SPOTIFY;
    if (url.includes('deezer.com') || url.includes('deezer.page.link')) return SourceType.DEEZER;
    if (url.includes('music.apple.com')) return SourceType.APPLE_MUSIC;
    return null;
};

export const sanitizeFilename = (str: string): string => {
    return str.replace(/[^a-z0-9\u00C0-\u024F\s,-]/gi, '').trim();
};

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

export const validateCookies = (cookies: any[]): boolean => {
    if (!Array.isArray(cookies)) return false;
    return cookies.every(cookie =>
        cookie &&
        typeof cookie === 'object' &&
        typeof cookie.name === 'string' &&
        typeof cookie.value === 'string'
    );
};

export const writeCookiesFile = (cookies: any[]): string => {
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

export const getBodyFieldValue = (field: any): any => {
    if (field && typeof field === 'object' && 'value' in field) {
        return field.value;
    }
    return field;
};
