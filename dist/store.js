"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.persistAudit = exports.createJob = exports.updateJobStatus = exports.getJobStatus = void 0;
const db_1 = require("./config/db");
const redis_1 = require("./config/redis");
// Use Redis hash for active jobs
const JOB_KEY_PREFIX = 'audit:job:';
const getJobStatus = async (jobId) => {
    const data = await redis_1.redisConnection.get(`${JOB_KEY_PREFIX}${jobId}`);
    return data ? JSON.parse(data) : null;
};
exports.getJobStatus = getJobStatus;
const updateJobStatus = async (jobId, data) => {
    const current = await (0, exports.getJobStatus)(jobId) || {};
    const updated = { ...current, ...data };
    await redis_1.redisConnection.set(`${JOB_KEY_PREFIX}${jobId}`, JSON.stringify(updated), 'EX', 3600); // 1 hour TTL
};
exports.updateJobStatus = updateJobStatus;
const createJob = async (jobId, url, userId, projectId) => {
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
    await redis_1.redisConnection.set(`${JOB_KEY_PREFIX}${jobId}`, JSON.stringify(job), 'EX', 3600);
    return job;
};
exports.createJob = createJob;
/**
 * Persist a finalized job to the database
 */
const persistAudit = async (jobId) => {
    const job = await (0, exports.getJobStatus)(jobId);
    if (!job)
        return null;
    try {
        const saved = await db_1.prisma.audit.create({
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
    }
    catch (err) {
        console.error(`Error persisting audit ${jobId}:`, err);
        return null;
    }
};
exports.persistAudit = persistAudit;
