import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file
dotenv.config();

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(4242),
    API_KEY: z.string().optional(),

    // Storage Configuration
    STORAGE_PATH: z.string().default('/app/storage'),
    AUDIO_DOWNLOAD_DIR: z.string().default('music/tracks'),
    COVER_DOWNLOAD_DIR: z.string().default('music/covers'),

    // Redis
    REDIS_PASSWORD: z.string().optional(),
    REDIS_URL: z.string().default('redis://localhost:6379'),

    // API
    BASE_URL: z.string().optional(),

    // Spotify
    SPOTIFY_CLIENT_ID: z.string().optional(),
    SPOTIFY_CLIENT_SECRET: z.string().optional(),


    // Logging
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
    console.error('❌ Invalid environment variables:', _env.error.format());
    process.exit(1);
}

export const env = _env.data;
export default env;
