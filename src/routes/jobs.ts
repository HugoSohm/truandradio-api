import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { downloadQueue } from "../utils/queue";
import { jobStatusSchema } from "../schemas/jobs";

export default async function jobRoutes(app: FastifyInstance) {
    app.get("/jobs", {
        schema: jobStatusSchema
    }, async (request: FastifyRequest<{ Querystring: { id: string } }>, reply: FastifyReply) => {
        const { id } = request.query;
        const job = await downloadQueue.getJob(id);

        if (!job) {
            return reply.status(404).send({ error: "Job not found" });
        }

        const state = await job.getState();
        const progress = job.progress;

        return reply.send({
            id: job.id,
            status: state,
            progress: typeof progress === 'number' ? progress : 0,
            result: job.returnvalue || null,
            error: job.failedReason || null
        });
    });
}
