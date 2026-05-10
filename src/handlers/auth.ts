import { FastifyRequest, FastifyReply } from 'fastify';
import env from '../lib/env';

export const authHook = async (request: FastifyRequest, reply: FastifyReply) => {
    const publicPaths = [
        '/health', '/docs', '/docs/uiConfig', '/docs/initOAuth', '/docs/json', '/docs/yaml',
        '/mp3', '/cover'
    ];
    if (publicPaths.some(path => request.url.startsWith(path))) {
        return;
    }

    const apiKey = request.headers['x-api-key'];
    const expectedApiKey = env.API_KEY;

    if (!expectedApiKey) {
        request.log.warn('API_KEY is not set in environment variables. Access granted by default.');
        return;
    }

    if (apiKey !== expectedApiKey) {
        return reply.status(401).send({ error: 'Unauthorized: Invalid or missing API Key' });
    }
};
