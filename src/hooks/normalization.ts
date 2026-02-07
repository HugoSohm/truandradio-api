import { FastifyReply, FastifyRequest } from "fastify";
import { getBodyFieldValue } from "../utils/helpers";

export const normalizationHook = async (request: FastifyRequest) => {
    if (request.body === undefined || request.body === null) {
        request.body = {};
    }

    if (typeof request.body !== 'object') return;

    const body = request.body as Record<string, any>;
    const normalizedBody: Record<string, any> = {};

    for (const key of Object.keys(body)) {
        normalizedBody[key] = getBodyFieldValue(body[key]);
    }

    if (typeof normalizedBody.cookies === 'string' && normalizedBody.cookies.trim() !== '') {
        try {
            normalizedBody.cookies = JSON.parse(normalizedBody.cookies);
        } catch (e) {
        }
    }

    if (typeof normalizedBody.artists === 'string' && normalizedBody.artists.trim() !== '') {
        try {
            const parsed = JSON.parse(normalizedBody.artists);
            if (Array.isArray(parsed)) {
                normalizedBody.artists = parsed;
            } else {
                normalizedBody.artists = [normalizedBody.artists];
            }
        } catch (e) {
            if (normalizedBody.artists.includes(',')) {
                normalizedBody.artists = normalizedBody.artists.split(',').map((s: string) => s.trim());
            } else {
                normalizedBody.artists = [normalizedBody.artists.trim()];
            }
        }
    } else if (Array.isArray(normalizedBody.artists)) {
        normalizedBody.artists = normalizedBody.artists.map((a: any) => getBodyFieldValue(a));
    }

    request.body = normalizedBody;
};
