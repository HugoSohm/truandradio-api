export const coverUploadSchema = {
    summary: 'Upload a cover for a file',
    description: 'Upload a cover image for an existing audio file identified by its ID.',
    tags: ['files'],
    consumes: ['multipart/form-data'],
    body: {
        type: 'object',
        required: ['id'],
        properties: {
            id: {
                type: 'string',
                description: 'The ID of the audio file (Title-Artist)'
            },
            file: {
                isFile: true,
                description: 'The image file to upload'
            },
            url: {
                type: 'string',
                description: 'The URL of the mask image to download'
            }
        },
        anyOf: [
            { required: ['file'] },
            { required: ['url'] }
        ]
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

export const playlistSyncSchema = {
    summary: 'Update playlists for a file',
    description: 'Adds or removes a file from playlists to match the provided array.',
    tags: ['files'],
    body: {
        type: 'object',
        required: ['id', 'playlists'],
        properties: {
            id: { type: 'string' },
            playlists: {
                type: 'array',
                items: { type: 'string' }
            }
        }
    },
    response: {
        200: {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                message: { type: 'string' }
            }
        }
    }
};

export const getFilesSchema = {
    summary: 'List and filter files',
    description: 'Retrieves all files globally. Optionally filter by a specific playlist.',
    tags: ['files'],
    querystring: {
        type: 'object',
        properties: {
            playlist: { type: 'string', description: 'Filter tracks mapped to this specific playlist name' }
        }
    },
    response: {
        200: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    title: { type: 'string' },
                    artists: { type: 'array', items: { type: 'string' } },
                    playlists: { type: 'array', items: { type: 'string' } },
                    audioUrl: { type: 'string' },
                    coverUrl: { type: 'string' }
                }
            }
        }
    }
};

export const deleteFileSchema = {
    summary: 'Delete files globally or locally',
    description: 'Deletes a track by its ID comprehensively across all playlists, or manually target an isolated file.',
    tags: ['files'],
    querystring: {
        type: 'object',
        properties: {
            id: { type: 'string', description: 'Track ID to universally delete' },
            type: { type: 'string', description: 'Target explicit file kind (audio or cover)' },
            filename: { type: 'string', description: 'Target explicit raw filename' },
            playlist: { type: 'string', description: 'Scope the deletion to a specific playlist (optional)' }
        }
    },
    response: {
        200: {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
                deleted: { type: 'array', items: { type: 'string' } },
                errors: { type: 'array', items: { type: 'string' } }
            }
        },
        400: {
            type: 'object',
            properties: { error: { type: 'string' } }
        },
        404: {
            type: 'object',
            properties: { error: { type: 'string' } }
        }
    }
};
