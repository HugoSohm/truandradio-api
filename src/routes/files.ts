import { FastifyInstance, FastifyPluginOptions } from "fastify";
import fs from "fs";
import path from "path";
import { coverUploadSchema, deleteFileSchema, getFilesSchema, playlistSyncSchema } from "../schemas/files";
import { getFilesRecursive } from "../utils/files";
import { getAudioInfo } from "../utils/metadata";
import env from "../lib/env";
import { normalizeForPairing, sanitizeFilename } from "../utils/string";

const AUDIO_DIR = env.AUDIO_DOWNLOAD_DIR;
const COVER_DIR = env.COVER_DOWNLOAD_DIR;

export default async function filesRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
    fastify.post<{ Body: { id: any, file: any, url: any } }>("/files/cover", { schema: coverUploadSchema }, async (request, reply) => {
        const { id, file, url } = request.body;

        const rawId = id?.value || (typeof id === 'string' ? id : undefined);
        const rawUrl = url?.value || (typeof url === 'string' ? url : undefined);
        const targetPlaylists = new Set<string>();

        if (!rawId) return reply.status(400).send({ error: "Missing ID" });
        if (!file && !rawUrl) return reply.status(400).send({ error: "Missing file or URL" });

        const checkValue = (val?: string) => val && (val.includes("..") || val.startsWith("/") || val.startsWith("\\"));
        if (checkValue(rawId)) {
            return reply.status(400).send({ error: "Invalid ID" });
        }

        const audioExtensions = [".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac"];

        // Find all playlists where this audio exists
        const audioFiles = getFilesRecursive(AUDIO_DIR);
        const results = await Promise.all(audioFiles.map(async (fileObj) => {
            const fullPath = path.join(AUDIO_DIR, fileObj.relativePath);
            const ext = path.extname(fileObj.relativePath).toLowerCase();
            if (audioExtensions.includes(ext)) {
                const { id: idFromTags } = await getAudioInfo(fullPath);
                if (idFromTags === rawId || normalizeForPairing(idFromTags) === normalizeForPairing(rawId)) {
                    return {
                        playlist: fileObj.playlist === 'root' ? '' : fileObj.playlist,
                        originalName: path.parse(fileObj.name).name
                    };
                }
            }
            return null;
        }));
        const audioResults = results.filter((r): r is { playlist: string, originalName: string } => r !== null);

        const originalNames = new Set<string>();
        originalNames.add(rawId);

        for (const res of audioResults) {
            targetPlaylists.add(res.playlist);
            originalNames.add(res.originalName);
        }

        if (targetPlaylists.size === 0) {
            return reply.status(404).send({ error: "No matching audio file found for this ID anywhere" });
        }

        let ext = ".jpg";
        let data: Buffer;

        if (file && file.filename) {
            ext = path.parse(file.filename).ext;
            data = await file.toBuffer();
        } else if (rawUrl) {
            try {
                const response = await fetch(rawUrl);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                // Try to detect extension from URL or content-type
                const urlParsed = new URL(rawUrl);
                const detectedExt = path.extname(urlParsed.pathname);
                if (detectedExt && detectedExt.length > 1) {
                    ext = detectedExt;
                } else {
                    const contentType = response.headers.get('content-type');
                    if (contentType?.includes('image/png')) ext = '.png';
                    else if (contentType?.includes('image/webp')) ext = '.webp';
                    else if (contentType?.includes('image/gif')) ext = '.gif';
                }

                data = Buffer.from(await response.arrayBuffer());
            } catch (error) {
                return reply.status(400).send({ error: "Failed to download image from URL" });
            }
        } else {
            return reply.status(400).send({ error: "No file or URL provided" });
        }

        const newFilename = `${sanitizeFilename(rawId)}${ext}`;
        let firstWebPath = "";

        for (const playlist of targetPlaylists) {
            const targetCoverDir = path.join(COVER_DIR, playlist);
            if (!fs.existsSync(targetCoverDir)) {
                fs.mkdirSync(targetCoverDir, { recursive: true });
            }

            // Remove existing covers for this ID or associated filenames
            const currentCovers = fs.readdirSync(targetCoverDir).filter(f => {
                const name = path.parse(f).name;
                return Array.from(originalNames).some(on =>
                    name === on || normalizeForPairing(name) === normalizeForPairing(on)
                );
            });
            for (const c of currentCovers) {
                try { fs.unlinkSync(path.join(targetCoverDir, c)); } catch (e) { }
            }

            const savePath = path.join(targetCoverDir, newFilename);
            fs.writeFileSync(savePath, data);

            if (!firstWebPath) {
                firstWebPath = `/cover/${playlist ? playlist + '/' : ''}${newFilename}`;
            }
        }

        const PORT = env.PORT;
        let baseUrl = env.BASE_URL;
        if (!baseUrl) {
            baseUrl = `${request.protocol}://${request.hostname}:${PORT}`;
        }
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

        return {
            success: true,
            id: rawId,
            path: firstWebPath,
            url: `${baseUrl}${firstWebPath}`
        };
    });

    fastify.put<{ Body: { id: string, playlists: string[] } }>("/files/playlists", { schema: playlistSyncSchema }, async (request, reply) => {
        const { id, playlists } = request.body;
        const targetPlaylists = new Set(playlists.map(p => p.trim()).filter(Boolean));

        // Find existing audio sources to copy from
        const audioFiles = getFilesRecursive(AUDIO_DIR);
        let audioSource: string | null = null;
        let coverSource: string | null = null;
        const currentPlaylists = new Set<string>();

        // 1. Locate the audio source globally
        const audioResults = await Promise.all(audioFiles.map(async (fileObj) => {
            const fullPath = path.join(AUDIO_DIR, fileObj.relativePath);
            const ext = path.extname(fileObj.relativePath).toLowerCase();
            if ([".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac"].includes(ext)) {
                const { id: idFromTags } = await getAudioInfo(fullPath);
                if (idFromTags === id || normalizeForPairing(idFromTags) === normalizeForPairing(id)) {
                    return { fullPath, playlist: fileObj.playlist === 'root' ? '' : fileObj.playlist };
                }
            }
            return null;
        }));

        for (const res of audioResults) {
            if (res) {
                if (!audioSource) audioSource = res.fullPath;
                currentPlaylists.add(res.playlist);
            }
        }

        if (!audioSource) {
            return reply.status(404).send({ error: "No audio file found with this ID to synchronize" });
        }

        const audioParsed = path.parse(audioSource);
        const audioFilename = audioParsed.base;

        // 2. Locate the cover source globally
        const coverFiles = getFilesRecursive(COVER_DIR);
        for (const fileObj of coverFiles) {
            const parsed = path.parse(fileObj.relativePath);
            if (parsed.name === id || normalizeForPairing(parsed.name) === normalizeForPairing(id)) {
                if (!coverSource) coverSource = path.join(COVER_DIR, fileObj.relativePath);
                break;
            }
        }

        const coverFilename = coverSource ? path.parse(coverSource).base : null;

        // 3. Add to target playlists that don't have it (DO THIS FIRST BEFORE DELETING THE SOURCE)
        for (const p of targetPlaylists) {
            if (!currentPlaylists.has(p)) {
                // Audio
                const targetMp3Dir = path.join(AUDIO_DIR, p);
                if (!fs.existsSync(targetMp3Dir)) fs.mkdirSync(targetMp3Dir, { recursive: true });
                fs.copyFileSync(audioSource, path.join(targetMp3Dir, audioFilename));

                // Cover
                if (coverSource && coverFilename) {
                    const targetCoverDir = path.join(COVER_DIR, p);
                    if (!fs.existsSync(targetCoverDir)) fs.mkdirSync(targetCoverDir, { recursive: true });
                    fs.copyFileSync(coverSource, path.join(targetCoverDir, coverFilename));
                }
            }
        }

        // 4. Delete from playlists not in target (NOW SAFE TO DELETE)
        for (const p of currentPlaylists) {
            if (!targetPlaylists.has(p)) {
                const audioToRemove = path.join(AUDIO_DIR, p, audioFilename);
                try { if (fs.existsSync(audioToRemove)) fs.unlinkSync(audioToRemove); } catch (e) { }

                if (coverFilename) {
                    const coverToRemove = path.join(COVER_DIR, p, coverFilename);
                    try { if (fs.existsSync(coverToRemove)) fs.unlinkSync(coverToRemove); } catch (e) { }
                }
            }
        }

        return { success: true, message: `Successfully synchronized '${id}' across ${targetPlaylists.size} playlists` };
    });

    fastify.get<{ Querystring: { playlist?: string } }>("/files", { schema: getFilesSchema }, async (request, reply) => {
        const queryPlaylist = request.query.playlist;

        const checkValue = (val?: string) => val && (val.includes("..") || val.startsWith("/") || val.startsWith("\\"));
        if (checkValue(queryPlaylist)) {
            return reply.status(400).send({ error: "Invalid playlist" });
        }

        const audioExtensions = [".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac"];
        const PORT = env.PORT;
        let baseUrl = env.BASE_URL;
        if (!baseUrl) {
            baseUrl = `${request.protocol}://${request.hostname}:${PORT}`;
        }
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

        const fileMap = new Map<string, {
            id: string,
            playlists: Set<string>,
            audioUrl?: string,
            coverUrl?: string,
            title?: string,
            artists?: string[]
        }>();
        const normalizedIndex = new Map<string, string>(); // normalizedKey -> rawId

        const audioFiles = getFilesRecursive(AUDIO_DIR);
        const coverFiles = getFilesRecursive(COVER_DIR);

        // 1. Process Audios
        const audioResults = await Promise.all(audioFiles.map(async (fileObj) => {
            const { relativePath, playlist: playlistFolder } = fileObj;
            const fullPath = path.join(AUDIO_DIR, relativePath);
            const parsed = path.parse(relativePath);
            const ext = parsed.ext.toLowerCase();
            const playlistName = playlistFolder === 'root' ? '' : playlistFolder;

            if (audioExtensions.includes(ext)) {
                const info = await getAudioInfo(fullPath);
                const webPath = `/mp3/${relativePath.replace(/\\/g, '/')}`;
                return { id: info.id, title: info.title, artists: info.artists, playlistName, webPath, originalName: parsed.name };
            }
            return null;
        }));

        for (const res of audioResults) {
            if (res) {
                const { id, title, artists, playlistName, webPath, originalName } = res;
                if (!fileMap.has(id)) {
                    fileMap.set(id, {
                        id,
                        title,
                        artists,
                        playlists: new Set(),
                        audioUrl: `${baseUrl}${webPath}`
                    });
                    normalizedIndex.set(normalizeForPairing(id), id);
                }
                normalizedIndex.set(normalizeForPairing(originalName), id);
                if (playlistName) fileMap.get(id)!.playlists.add(playlistName);
            }
        }

        // 2. Process Covers
        for (const fileObj of coverFiles) {
            const { relativePath, playlist: playlistFolder } = fileObj;
            const parsed = path.parse(relativePath);
            const fileNameOnly = parsed.name;
            const playlistName = playlistFolder === 'root' ? '' : playlistFolder;
            const matchedRawId = fileMap.has(fileNameOnly) ? fileNameOnly : normalizedIndex.get(normalizeForPairing(fileNameOnly));

            if (matchedRawId) {
                const entry = fileMap.get(matchedRawId)!;
                const webPath = `/cover/${relativePath.replace(/\\/g, '/')}`;
                const currentUrl = `${baseUrl}${webPath}`;
                if (!entry.coverUrl || fileNameOnly === matchedRawId) {
                    entry.coverUrl = currentUrl;
                }
                if (playlistName) entry.playlists.add(playlistName);
            } else {
                const webPath = `/cover/${relativePath.replace(/\\/g, '/')}`;
                fileMap.set(fileNameOnly, {
                    id: fileNameOnly,
                    playlists: new Set(playlistName ? [playlistName] : []),
                    coverUrl: `${baseUrl}${webPath}`
                });
            }
        }

        let results = Array.from(fileMap.values()).map(entry => ({
            ...entry,
            playlists: Array.from(entry.playlists)
        }));

        if (queryPlaylist) {
            results = results.filter(r => r.playlists.includes(queryPlaylist));
        }

        return results;
    });

    fastify.delete<{ Querystring: { id?: string, type?: string, filename?: string, playlist?: string } }>("/files", { schema: deleteFileSchema }, async (request, reply) => {
        const { id, type, filename } = request.query;
        const queryPlaylist = request.query.playlist;

        const targetName = id || filename;
        const checkValue = (val?: string) => val && (val.includes("..") || val.startsWith("/") || val.startsWith("\\"));

        if (checkValue(targetName) || checkValue(queryPlaylist)) {
            return reply.status(400).send({ error: "Invalid ID, filename or playlist" });
        }

        if (id) {
            const deleted: string[] = [];
            const errors: string[] = [];
            const audioExtensions = [".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac"];

            // Delete Audios locally
            const audioFiles = getFilesRecursive(AUDIO_DIR);
            const audioResults = await Promise.all(audioFiles.map(async (fileObj) => {
                if (queryPlaylist && queryPlaylist !== 'root' && fileObj.playlist !== queryPlaylist) return null;

                const fullPath = path.join(AUDIO_DIR, fileObj.relativePath);
                const ext = path.extname(fileObj.relativePath).toLowerCase();

                if (audioExtensions.includes(ext)) {
                    const { id: idFromTags } = await getAudioInfo(fullPath);
                    if (idFromTags === id || normalizeForPairing(idFromTags) === normalizeForPairing(id)) {
                        return { fullPath, relativePath: fileObj.relativePath };
                    }
                }
                return null;
            }));

            for (const res of audioResults) {
                if (res) {
                    try {
                        fs.unlinkSync(res.fullPath);
                        deleted.push(`/mp3/${res.relativePath.replace(/\\/g, '/')}`);
                    } catch (err) {
                        errors.push(`Failed to delete audio: ${res.relativePath}`);
                    }
                }
            }

            // Delete Covers locally
            const coverFiles = getFilesRecursive(COVER_DIR);
            for (const fileObj of coverFiles) {
                if (queryPlaylist && queryPlaylist !== 'root' && fileObj.playlist !== queryPlaylist) continue;

                const fullPath = path.join(COVER_DIR, fileObj.relativePath);
                const parsed = path.parse(fileObj.relativePath);

                if (parsed.name === id || normalizeForPairing(parsed.name) === normalizeForPairing(id)) {
                    try {
                        fs.unlinkSync(fullPath);
                        deleted.push(`/cover/${fileObj.relativePath.replace(/\\/g, '/')}`);
                    } catch (err) {
                        errors.push(`Failed to delete cover: ${fileObj.relativePath}`);
                    }
                }
            }

            if (deleted.length === 0 && errors.length === 0) {
                return reply.status(404).send({ error: "No files found with this ID" });
            }

            return { success: true, deleted, errors: errors.length > 0 ? errors : undefined };
        }

        if (type && filename) {
            let baseDir: string;
            let targetSub: string;

            if (type === "mp3" || type === "audio") {
                baseDir = path.resolve(env.AUDIO_DOWNLOAD_DIR);
                targetSub = queryPlaylist || "";
            } else if (type === "cover") {
                baseDir = path.resolve(env.COVER_DOWNLOAD_DIR);
                targetSub = queryPlaylist || "";
            } else {
                return reply.status(400).send({ error: "Invalid type. Must be 'audio', 'mp3', or 'cover'" });
            }

            const filePath = path.join(baseDir, targetSub, filename);
            if (!fs.existsSync(filePath)) {
                return reply.status(404).send({ error: "File not found" });
            }

            try {
                fs.unlinkSync(filePath);
                return { success: true, message: `File ${filename} deleted from ${type}${targetSub ? ` in ${targetSub}` : ""}` };
            } catch (err) {
                fastify.log.error(err);
                return reply.status(500).send({ error: "Failed to delete file" });
            }
        }

        return reply.status(400).send({ error: "Missing required parameters (id OR type + filename)" });
    });
}
