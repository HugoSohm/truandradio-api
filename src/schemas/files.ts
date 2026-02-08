export const coverUploadSchema = {
    summary: 'Upload a cover for a file',
    description: 'Upload a cover image for an existing audio file identified by its ID.',
    tags: ['files'],
    consumes: ['multipart/form-data'],
    body: {
        type: 'object',
        required: ['id', 'file'],
        properties: {
            id: {
                type: 'string',
                description: 'The ID of the audio file (Title-Artist)'
            },
            audioSubPath: {
                type: 'string',
                description: 'Optional subdirectory for the audio file'
            },
            coverSubPath: {
                type: 'string',
                description: 'Optional subdirectory for the cover file'
            },
            subPath: {
                type: 'string',
                description: 'Fallback subdirectory if audioSubPath or coverSubPath are not provided'
            },
            file: {
                type: 'object',
                description: 'The image file to upload'
            }
        }
    },
    response: {
        200: {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                id: { type: 'string' },
                path: { type: 'string' }
            }
        },
        400: {
            type: 'object',
            properties: {
                error: { type: 'string' }
            }
        },
        404: {
            type: 'object',
            properties: {
                error: { type: 'string' }
            }
        }
    }
};
