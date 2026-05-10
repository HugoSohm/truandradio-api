import { FastifyInstance, FastifyPluginOptions } from "fastify";
import fs from "fs";
import path from "path";
import { getPlaylistsSchema, createPlaylistSchema, updatePlaylistSchema, deletePlaylistSchema } from "../schemas/playlists";

import env from "../lib/env";

const AUDIO_DIR = path.join(env.STORAGE_PATH, env.AUDIO_DOWNLOAD_DIR);
const COVER_DIR = path.join(env.STORAGE_PATH, env.COVER_DOWNLOAD_DIR);

const KEBAB_CASE_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function getDirectories(source: string) {
    if (!fs.existsSync(source)) return [];
    return fs.readdirSync(source, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
}

export default async function playlistsRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
    fastify.get("/playlists", { schema: getPlaylistsSchema }, async (request, reply) => {
        const mp3Playlists = getDirectories(AUDIO_DIR);
        const coverPlaylists = getDirectories(COVER_DIR);
        const allPlaylists = new Set([...mp3Playlists, ...coverPlaylists]);
        return Array.from(allPlaylists).sort();
    });

    fastify.post<{ Body: { name: string } }>("/playlists", { schema: createPlaylistSchema }, async (request, reply) => {
        const { name } = request.body;

        if (!KEBAB_CASE_REGEX.test(name)) {
            return reply.status(400).send({ error: "Playlist name must be in kebab-case (e.g., my-playlist-name)" });
        }

        const mp3Path = path.join(AUDIO_DIR, name);
        const coverPath = path.join(COVER_DIR, name);

        let created = false;
        if (!fs.existsSync(mp3Path)) {
            fs.mkdirSync(mp3Path, { recursive: true });
            created = true;
        }
        if (!fs.existsSync(coverPath)) {
            fs.mkdirSync(coverPath, { recursive: true });
            created = true;
        }

        if (!created) {
            return reply.status(400).send({ error: "Playlist already exists" });
        }

        return { success: true, message: "Playlist created", playlist: name };
    });

    fastify.put<{ Params: { name: string }, Body: { newName: string } }>("/playlists/:name", { schema: updatePlaylistSchema }, async (request, reply) => {
        const { name } = request.params;
        const { newName } = request.body;

        if (!KEBAB_CASE_REGEX.test(newName)) {
            return reply.status(400).send({ error: "New playlist name must be in kebab-case (e.g., new-playlist-name)" });
        }

        if (name === newName) {
            return reply.status(400).send({ error: "New name must be different from the old name" });
        }

        const mp3OldPath = path.join(AUDIO_DIR, name);
        const coverOldPath = path.join(COVER_DIR, name);
        const mp3NewPath = path.join(AUDIO_DIR, newName);
        const coverNewPath = path.join(COVER_DIR, newName);

        const mp3Exists = fs.existsSync(mp3OldPath);
        const coverExists = fs.existsSync(coverOldPath);

        if (!mp3Exists && !coverExists) {
            return reply.status(404).send({ error: "Playlist not found" });
        }

        if (fs.existsSync(mp3NewPath) || fs.existsSync(coverNewPath)) {
            return reply.status(400).send({ error: "A playlist with the new name already exists" });
        }

        if (mp3Exists) {
            fs.renameSync(mp3OldPath, mp3NewPath);
        }
        if (coverExists) {
            fs.renameSync(coverOldPath, coverNewPath);
        }

        return { success: true, message: "Playlist renamed", playlist: newName };
    });

    fastify.delete<{ Params: { name: string } }>("/playlists/:name", { schema: deletePlaylistSchema }, async (request, reply) => {
        const { name } = request.params;

        const mp3Path = path.join(AUDIO_DIR, name);
        const coverPath = path.join(COVER_DIR, name);

        const mp3Exists = fs.existsSync(mp3Path);
        const coverExists = fs.existsSync(coverPath);

        if (!mp3Exists && !coverExists) {
            return reply.status(404).send({ error: "Playlist not found" });
        }

        if (mp3Exists) {
            fs.rmSync(mp3Path, { recursive: true, force: true });
        }
        if (coverExists) {
            fs.rmSync(coverPath, { recursive: true, force: true });
        }

        return { success: true, message: "Playlist deleted" };
    });
}
