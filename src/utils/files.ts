import fs from 'fs';
import path from 'path';

/**
 * Lists files in a directory non-recursively.
 * @param dir The full path to the directory to list.
 * @param playlist The relative path from the base directory (optional).
 */
export const getFiles = (dir: string, playlist?: string): { name: string, relativePath: string }[] => {
    if (!fs.existsSync(dir)) return [];
    const list = fs.readdirSync(dir);
    return list
        .filter(f => !fs.statSync(path.join(dir, f)).isDirectory())
        .map(f => ({
            name: f,
            relativePath: playlist ? path.join(playlist, f) : f
        }));
};

/**
 * Recursively lists all files in a directory and its subdirectories.
 * @param dir The full path to the base directory.
 * @param basePath Used internally to build relative paths from the root directory.
 */
export const getFilesRecursive = (dir: string, basePath = ''): { name: string, relativePath: string, playlist: string }[] => {
    let results: { name: string, relativePath: string, playlist: string }[] = [];
    if (!fs.existsSync(dir)) return results;

    const list = fs.readdirSync(dir);
    for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            const newBasePath = path.join(basePath, file);
            results = results.concat(getFilesRecursive(fullPath, newBasePath));
        } else {
            results.push({
                name: file,
                relativePath: path.join(basePath, file).replace(/\\/g, '/'),
                playlist: basePath.replace(/\\/g, '/') || 'root' // Use 'root' or empty for base dir
            });
        }
    }
    return results;
};

