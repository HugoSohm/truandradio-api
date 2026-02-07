import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getTrackInfo } from "../utils/downloader";
import { infoSchema } from "../schemas/download";
import { InfoBody } from "../types/download";

export default async function infoRoutes(app: FastifyInstance) {
    app.post("/info", { schema: infoSchema }, async (request: FastifyRequest<{ Body: InfoBody }>, reply: FastifyReply) => {
        const { url, cookies: cookiesRaw } = request.body;

        try {
            let cookies: any[] | undefined;
            if (cookiesRaw) {
                if (typeof cookiesRaw === 'string') {
                    try {
                        cookies = JSON.parse(cookiesRaw);
                    } catch (e) {
                        return reply.status(400).send({ error: "Invalid cookies format. Must be valid JSON array string." });
                    }
                } else {
                    cookies = cookiesRaw;
                }
            }
            const info = await getTrackInfo(url, cookies);
            return reply.send(info);
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({ error: "Failed to get info", details: error.message });
        }
    });
}
