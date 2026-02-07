import { FastifyError, FastifyReply, FastifyRequest } from "fastify";

export const errorHandler = (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (error.validation) {
        return reply.status(400).send({
            error: "Bad Request",
            message: "Validation failed",
            details: error.validation.map((err: any) => {
                let field = "body";
                if (err.instancePath) {
                    field = err.instancePath.replace(/^\//, '').replace(/\//g, '.');
                } else if (err.keyword === 'required' && err.params && err.params.missingProperty) {
                    field = err.params.missingProperty;
                } else if (err.keyword !== 'type') {
                    field = err.keyword;
                }

                return {
                    field,
                    message: err.message
                };
            })
        });
    }

    request.log.error(error);
    reply.status(error.statusCode || 500).send({
        error: error.name || "Internal Server Error",
        message: error.message || "An unexpected error occurred"
    });
};
