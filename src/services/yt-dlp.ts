import { execFile } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import pRetry from 'p-retry';
import path from 'path';
import { promisify } from 'util';
import { writeCookiesFile } from '../utils/cookies';
import logger from '../utils/logger';

const execFileAsync = promisify(execFile);

export const FFMPEG_STATIC_PATH = (ffmpegStatic && fs.existsSync(ffmpegStatic)) ? ffmpegStatic : null;
export const YTDLP_FILENAME = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
export const YTDLP_PATH = path.join(process.cwd(), YTDLP_FILENAME);

/**
 * Executes a yt-dlp command with the provided URL and options.
 */
export const executeYtDlp = async (url: string, cookies?: any[], extraArgs: string[] = []): Promise<any> => {
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
            logger.warn({ module: 'yt-dlp', attempt: error.attemptNumber, retriesLeft: error.retriesLeft }, `Command attempt failed`);
        }
    });
};

/**
 * Helper to run yt-dlp with custom arguments (e.g. for searching or playlists).
 */
export const runYtDlpRaw = async (args: string[]): Promise<string> => {
    const { stdout } = await execFileAsync(YTDLP_PATH, args, { timeout: 60000 });
    return stdout;
};
