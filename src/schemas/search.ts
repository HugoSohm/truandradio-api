export const searchSchema = {
    description: 'Search for tracks on YouTube',
    tags: ['search'],
    body: {
        type: 'object',
        properties: {
            artist: { type: 'string', description: 'Artist name' },
            title: { type: 'string', description: 'Track title' },
            cookies: {
                anyOf: [
                    { type: 'array' },
                    { type: 'string' }
                ]
            },
            limit: { type: 'integer', default: 5, description: 'Number of results (max 10)' }
        }
    },
    response: {
        200: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    title: { type: 'string' },
                    artists: { type: 'array', items: { type: 'string' } },
                    coverUrl: { type: 'string' },
                    url: { type: 'string' },
                    source: { type: 'string' }
                }
            }
        }
    }
};
