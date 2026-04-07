import 'dotenv/config';
import Fastify from "fastify";
import healthRoutes from "./routes/health";
import infoRoutes from "./routes/info";
import downloadRoutes from "./routes/download";
import searchRoutes from "./routes/search";
import jobRoutes from "./routes/jobs";
import filesRoutes from "./routes/files";
import { setupWorker, connection, downloadQueue } from './services/queue';
import formbody from '@fastify/formbody';
import multipart, { ajvFilePlugin } from '@fastify/multipart';
import { normalizationHook } from './hooks/normalization';
import { errorHandler } from './handlers/errorHandler';
import { authHook } from './handlers/auth';
import staticPlugin from '@fastify/static';
import path from 'path';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import pRetry, { AbortError } from 'p-retry';

const isProduction = process.env.NODE_ENV === 'production';

const app = Fastify({
    logger: isProduction ? true : {
        transport: {
            target: 'pino-pretty',
            options: {
                translateTime: 'HH:MM:ss',
                ignore: 'pid,hostname',
            },
        },
    },
    forceCloseConnections: true,
    ajv: {
        plugins: [ajvFilePlugin as any]
    }
});

// Intercept all favicon requests natively (including Swagger's embedded ones)
app.addHook('onRequest', async (request, reply) => {
    if (request.url.includes('favicon.ico') || request.url.includes('favicon-16x16.png') || request.url.includes('favicon-32x32.png')) {
        return reply.redirect('https://www.truand2lagalere.fr/images/favicon-16x16.png');
    }
});

app.register(formbody);
app.register(multipart, { attachFieldsToBody: true });

app.register(swagger, {
    openapi: {
        info: {
            title: 'Galere Radio API',
            description: 'API for retrieving information and downloading media with metadata support.',
            version: '1.1.0'
        },
        components: {
            securitySchemes: {
                apiKey: {
                    type: 'apiKey',
                    name: 'x-api-key',
                    in: 'header'
                }
            }
        },
        security: [{ apiKey: [] }]
    }
});

app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
        docExpansion: 'list',
        deepLinking: false
    }
});

app.addHook('preHandler', authHook);
app.addHook('preValidation', normalizationHook);

// Serve MP3 files
app.register(staticPlugin, {
    root: path.resolve(process.env.MP3_DOWNLOAD_DIR ?? 'mp3'),
    prefix: '/mp3/',
    decorateReply: false // Need to disable decoration to allow multiple registrations
});

// Serve Cover files
app.register(staticPlugin, {
    root: path.resolve(process.env.COVER_DOWNLOAD_DIR ?? 'cover'),
    prefix: '/cover/',
    decorateReply: false
});

app.register(healthRoutes);
app.register(infoRoutes);
app.register(downloadRoutes);
app.register(searchRoutes);
app.register(jobRoutes);
app.register(filesRoutes);

app.setErrorHandler(errorHandler);

const PORT = Number(process.env.PORT) || 3000;

const start = async () => {
    let worker: any;

    app.addHook('onClose', async () => {
        app.log.info('Executing Gracful Shutdown: Closing Redis connections and workers...');
        if (worker) await worker.close();
        await downloadQueue.close();
        await connection.quit();
    });

    const shutdown = async (signal: string) => {
        app.log.info(`Handling ${signal} signal. Shutting down...`);
        // Force exit after 2 seconds in dev to be snappy
        const forceExit = setTimeout(() => {
            process.exit(1);
        }, 2000);

        try {
            // this single call triggers the 'onClose' hook above automatically!
            await app.close();
            clearTimeout(forceExit);
            process.exit(0);
        } catch (err) {
            process.exit(1);
        }
    };

    // Register handlers before listen
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));

    try {
        worker = setupWorker();

        await pRetry(async () => {
            try {
                await app.listen({ port: PORT, host: "0.0.0.0" });
                const displayUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
                app.log.info(`Server running on ${displayUrl}`);
            } catch (err: any) {
                if (err.code === 'EADDRINUSE') {
                    app.log.warn(`Port ${PORT} busy, retrying...`);
                    throw err;
                }
                throw new AbortError(err);
            }
        }, {
            retries: 10,
            minTimeout: 500,
            maxTimeout: 2000,
            onFailedAttempt: error => {
                app.log.warn(`Server attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`);
            }
        });

    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

start();
