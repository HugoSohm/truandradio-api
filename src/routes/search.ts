import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { searchTracks } from "../services/downloader";
import { getBodyFieldValue } from "../utils/request";
import { SourceType } from "../types/metadata";
import { searchSchema, searchCoverSchema } from "../schemas/search";
import { searchCoverAcrossSources } from "../services/cover";
import { getFilesRecursive } from "../utils/files";
import { getAudioInfo } from "../utils/metadata";
import { normalizeForPairing } from "../utils/string";
import env from "../lib/env";
import path from "path";

const AUDIO_DIR = path.join(env.STORAGE_PATH, env.AUDIO_DOWNLOAD_DIR);

export default async function searchRoutes(app: FastifyInstance) {
    app.post("/search", {
        schema: searchSchema
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as any;
        const artist = getBodyFieldValue(body.artist);
        const title = getBodyFieldValue(body.title);
        const limit = Math.min(Number(getBodyFieldValue(body.limit) || 5), 10);
        let cookies: any[] | undefined;

        const cookiesRaw = getBodyFieldValue(body.cookies);
        if (cookiesRaw) {
            if (typeof cookiesRaw === 'string') {
                try {
                    cookies = JSON.parse(cookiesRaw);
                } catch (e) {
                    return reply.status(400).send({ error: "Invalid cookies format." });
                }
            } else {
                cookies = cookiesRaw;
            }
        }

        if (!artist && !title) {
            return reply.status(400).send({ error: "At least artist or title is required" });
        }

        try {
            const results = await searchTracks(artist, title, limit, cookies);
            return reply.send(results);
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({ error: "Search failed", details: error.message });
        }
    });

    app.get("/search/cover", {
        schema: searchCoverSchema
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const { id, artists: queryArtists, title: queryTitle } = request.query as { id?: string, artists?: string[], title?: string };

        let finalTitle = queryTitle;
        let trackArtists = queryArtists || [];

        // Resolve ID to Track Info only if artist or title is missing
        if ((trackArtists.length === 0 || !finalTitle) && id) {
            const audioFiles = getFilesRecursive(AUDIO_DIR);
            const audioExtensions = [".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac"];
            const normalizedTargetId = normalizeForPairing(id);

            for (const fileObj of audioFiles) {
                const ext = path.extname(fileObj.relativePath).toLowerCase();
                if (audioExtensions.includes(ext)) {
                    const fullPath = path.join(AUDIO_DIR, fileObj.relativePath);
                    const info = await getAudioInfo(fullPath);
                    if (info.id === id || normalizeForPairing(info.id) === normalizedTargetId) {
                        finalTitle = info.title;
                        trackArtists = info.artists;
                        break;
                    }
                }
            }

            // Fallback: Parse ID if not found in local files
            if (trackArtists.length === 0 || !finalTitle) {
                const parts = id.split('-');
                if (parts.length >= 2) {
                    finalTitle = parts[0].trim();
                    trackArtists = parts.slice(1).join('-').split(',').map(s => s.trim());
                }
            }
        }

        if (trackArtists.length === 0 || !finalTitle) {
            return reply.status(400).send({ error: "Missing required parameters (artists and title OR id)" });
        }

        // Use the primary artist for searching
        const mainArtist = trackArtists[0];

        try {
            const result = await searchCoverAcrossSources(mainArtist, finalTitle);
            if (!result) {
                return reply.status(404).send({ error: "No cover found across any source" });
            }

            return reply.send({
                id,
                title: finalTitle,
                artists: trackArtists,
                ...result
            });
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({ error: "Cover search failed", details: error.message });
        }
    });
}
