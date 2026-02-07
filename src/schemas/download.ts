export const infoSchema = {
    description: 'Get information about a media URL',
    tags: ['download'],
    body: {
        type: 'object',
        required: ['url'],
        properties: {
            url: { type: 'string' },
            cookies: {
                anyOf: [
                    { type: 'array' },
                    { type: 'string' }
                ]
            }
        }
    },
    response: {
        200: {
            type: 'object',
            additionalProperties: true,
            properties: {
                title: { type: 'string' },
                artists: { type: 'array', items: { type: 'string' } },
                coverUrl: { type: 'string' },
                source: { type: 'string' }
            }
        }
    }
};

export const downloadSchema = {
    description: 'Queue a media download',
    tags: ['download'],
    body: {
        type: 'object',
        required: ['url'],
        properties: {
            url: { type: 'string' },
            title: { type: 'string' },
            artists: {
                anyOf: [
                    { type: 'array', items: { type: 'string' } },
                    { type: 'string' }
                ]
            },
            cookies: {
                anyOf: [
                    { type: 'array' },
                    { type: 'string' }
                ]
            },
            mp3SubPath: { type: 'string' },
            coverSubPath: { type: 'string' }
        }
    },
    response: {
        202: {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                jobId: { type: 'string' },
                message: { type: 'string' }
            }
        }
    }
};
