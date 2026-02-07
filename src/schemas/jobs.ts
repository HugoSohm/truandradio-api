export const jobStatusSchema = {
    description: 'Get status of a download job',
    tags: ['jobs'],
    querystring: {
        type: 'object',
        required: ['id'],
        properties: {
            id: { type: 'string', description: 'The job ID' }
        }
    },
    response: {
        200: {
            type: 'object',
            properties: {
                id: { type: 'string' },
                status: { type: 'string' },
                progress: { type: 'number' },
                result: {
                    type: 'object',
                    nullable: true,
                    properties: {
                        mp3Path: { type: 'string' },
                        coverPath: { type: 'string' },
                        metadata: {
                            type: 'object',
                            properties: {
                                title: { type: 'string' },
                                artists: { type: 'array', items: { type: 'string' } },
                                coverUrl: { type: 'string' },
                                source: { type: 'string' }
                            }
                        }
                    }
                },
                error: { type: 'string', nullable: true }
            }
        }
    }
};
