import pino from 'pino';
import env from '../lib/env';

const isProduction = env.NODE_ENV === 'production';

export const loggerConfig = {
    level: env.LOG_LEVEL,
    transport: isProduction ? undefined : {
        target: 'pino-pretty',
        options: {
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
        },
    },
};

const logger = pino(loggerConfig);

export default logger;
