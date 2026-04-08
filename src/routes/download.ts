import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { downloadQueue } from "../services/queue";
import { getMediaStream } from "../services/downloader";
import { downloadSchema, streamSchema } from "../schemas/download";
import { DownloadBody, StreamBody } from "../types/requests";

export default async function downloadRoutes(app: FastifyInstance) {
    app.post("/download", {
        schema: downloadSchema
    }, async (request: FastifyRequest<{ Body: DownloadBody }>, reply: FastifyReply) => {
        const { tracks, cookies: cookiesRaw } = request.body;

        try {
            let cookies: any[] | undefined;
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

            const results = [];
            for (const track of tracks) {
                const parsedArtists = Array.isArray(track.artists) ? track.artists :
                    (typeof track.artists === 'string' ? [track.artists] : undefined);

                const sanitizedTitle = track.title ? track.title.replace(/[\x00-\x1F\x7F]/g, "") : undefined;
                const sanitizedArtists = parsedArtists && parsedArtists.length > 0 ? 
                    parsedArtists.map(a => a.replace(/[\x00-\x1F\x7F]/g, "")) : undefined;

                const job = await downloadQueue.add('download', {
                    url: track.url,
                    cookies,
                    overrides: {
                        title: sanitizedTitle,
                        artists: sanitizedArtists
                    },
                    playlists: track.playlists
                });
                results.push({ url: track.url, jobId: job.id });
            }

            return reply.status(202).send({
                success: true,
                message: `${tracks.length} download(s) queued successfully`,
                count: tracks.length,
                jobs: results
            });
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({ error: "Failed to queue download", details: error.message });
        }
    });

    app.post("/download/stream", {
        schema: streamSchema
    }, async (request: FastifyRequest<{ Body: StreamBody }>, reply: FastifyReply) => {
        const { url, title, artists, cookies: cookiesRaw } = request.body;

        try {
            let cookies: any[] | undefined;
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

            const parsedArtists = Array.isArray(artists) ? artists : undefined;

            const { stream, filename } = await getMediaStream(url, cookies, {
                title,
                artists: parsedArtists && parsedArtists.length > 0 ? parsedArtists : undefined
            });

            return reply
                .header('Content-Disposition', `attachment; filename="${filename}"`)
                .header('Content-Type', 'audio/mpeg')
                .send(stream);
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({ error: "Failed to initialize stream", details: error.message });
        }
    });
}
