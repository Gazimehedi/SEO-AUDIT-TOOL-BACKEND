import { prisma } from './config/db';
import { redisConnection } from './config/redis';

// Use Redis hash for active jobs
const JOB_KEY_PREFIX = 'audit:job:';

export const getJobStatus = async (jobId: string) => {
    const data = await redisConnection.get(`${JOB_KEY_PREFIX}${jobId}`);
    return data ? JSON.parse(data) : null;
};

export const updateJobStatus = async (jobId: string, data: any) => {
    const current = await getJobStatus(jobId) || {};
    const updated = { ...current, ...data };
    await redisConnection.set(`${JOB_KEY_PREFIX}${jobId}`, JSON.stringify(updated), 'EX', 3600); // 1 hour TTL
};

export const createJob = async (jobId: string, url: string, userId?: string, projectId?: string) => {
    const job = {
        id: jobId,
        url,
        userId,
        projectId,
        status: 'pending',
        progress: { crawled: 0, total: 1 },
        score: null,
        results: null,
        createdAt: new Date().toISOString()
    };
    await redisConnection.set(`${JOB_KEY_PREFIX}${jobId}`, JSON.stringify(job), 'EX', 3600);
    return job;
};

/**
 * Persist a finalized job to the database
 */
export const persistAudit = async (jobId: string) => {
    const job = await getJobStatus(jobId);
    if (!job) return null;

    try {
        const saved = await prisma.audit.create({
            data: {
                id: job.id,
                url: job.url,
                userId: job.userId,
                status: job.status,
                score: job.score,
                results: job.results,
                projectId: job.projectId,
            }
        });

        // Once saved, we can potentially remove from memory after some delay
        // but we'll leave it for now so GET /api/audit/:id still works
        return saved;
    } catch (err) {
        console.error(`Error persisting audit ${jobId}:`, err);
        return null;
    }
};
