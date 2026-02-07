import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { downloadMedia } from './downloader';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
export const connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
});

export const downloadQueue = new Queue('downloads', { connection });

export const setupWorker = () => {
    const worker = new Worker('downloads', async (job: Job) => {
        const { url, cookies, overrides, mp3SubPath, coverSubPath } = job.data;

        await job.updateProgress(10);
        console.log(`[Queue] Processing job ${job.id} for ${url}`);

        try {
            const result = await downloadMedia(url, cookies, overrides, mp3SubPath, coverSubPath);
            await job.updateProgress(100);
            return result;
        } catch (error: any) {
            console.error(`[Queue] Job ${job.id} failed:`, error);
            throw error;
        }
    }, { connection, concurrency: 2 });

    worker.on('completed', job => {
        console.log(`[Queue] Job ${job.id} completed!`);
    });

    worker.on('failed', (job, err) => {
        console.error(`[Queue] Job ${job?.id} failed with error: ${err.message}`);
    });

    return worker;
};
