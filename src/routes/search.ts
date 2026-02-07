import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { searchTracks } from "../utils/downloader";
import { getBodyFieldValue } from "../utils/helpers";
import { searchSchema } from "../schemas/search";

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
}
