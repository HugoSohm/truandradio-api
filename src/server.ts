import 'dotenv/config';
import Fastify from "fastify";
import healthRoutes from "./routes/health";
import infoRoutes from "./routes/info";
import downloadRoutes from "./routes/download";
import searchRoutes from "./routes/search";
import jobRoutes from "./routes/jobs";
import { setupWorker } from "./utils/queue";
import formbody from '@fastify/formbody';
import multipart from '@fastify/multipart';
import { normalizationHook } from './hooks/normalization';
import { errorHandler } from './handlers/errorHandler';
import { authHook } from './handlers/auth';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

const app = Fastify({
    logger: true,
});

app.register(formbody);
app.register(multipart, { attachFieldsToBody: true });

app.register(swagger, {
    swagger: {
        info: {
            title: 'Galere Radio API',
            description: 'API for retrieving information and downloading media with metadata support.',
            version: '1.1.0'
        },
        securityDefinitions: {
            apiKey: {
                type: 'apiKey',
                name: 'x-api-key',
                in: 'header'
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

app.register(healthRoutes);
app.register(infoRoutes);
app.register(downloadRoutes);
app.register(searchRoutes);
app.register(jobRoutes);

app.setErrorHandler(errorHandler);

const PORT = Number(process.env.PORT) || 3000;

const start = async () => {
    try {
        setupWorker();
        await app.listen({ port: PORT, host: "0.0.0.0" });
        console.log(`🚀 Server running on http://localhost:${PORT}`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

start();
