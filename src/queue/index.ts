import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { redisConnection } from '../config/redis';
import { runFullWebsiteAudit } from '../modules/audit';
import { io } from '../socket';
import { updateJobStatus } from '../store';

export const auditQueue = new Queue('audit-queue', {
    connection: new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null }) as any,
});

/**
 * Worker process to handle audit jobs
 */
const auditWorker = new Worker(
    'audit-queue',
    async (job: Job) => {
        const { url, jobId, userId, targetKeyword, isFast, parentJobId, monitoredSiteId } = job.data;
        console.log(`[Worker] Started job ${job.id} for ${url} (Target: ${targetKeyword || 'None'}, Fast: ${isFast || false}, Parent: ${parentJobId || 'None'}, Monitor: ${monitoredSiteId || 'None'})`);

        try {
            await runFullWebsiteAudit(url, jobId, userId, targetKeyword, isFast, parentJobId, monitoredSiteId);
            return { success: true };
        } catch (err: any) {
            console.error(`[Worker] Job ${job.id} failed:`, err);
            updateJobStatus(jobId, { status: 'failed', error: err.message });
            io.emit(`job-${jobId}-failed`, { error: err.message });
            throw err; // Ensure BullMQ registers failure
        }
    },
    {
        connection: new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null }) as any,
        concurrency: 2, // Allow 2 simultaneous audits
    }
);

auditWorker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed`);
});

auditWorker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
});
