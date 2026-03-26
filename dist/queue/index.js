"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditQueue = void 0;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const audit_1 = require("../modules/audit");
const socket_1 = require("../socket");
const store_1 = require("../store");
exports.auditQueue = new bullmq_1.Queue('audit-queue', {
    connection: new ioredis_1.default(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null }),
});
/**
 * Worker process to handle audit jobs
 */
const auditWorker = new bullmq_1.Worker('audit-queue', async (job) => {
    const { url, jobId, userId, targetKeyword, isFast, parentJobId, monitoredSiteId } = job.data;
    console.log(`[Worker] Started job ${job.id} for ${url} (Target: ${targetKeyword || 'None'}, Fast: ${isFast || false}, Parent: ${parentJobId || 'None'}, Monitor: ${monitoredSiteId || 'None'})`);
    try {
        await (0, audit_1.runFullWebsiteAudit)(url, jobId, userId, targetKeyword, isFast, parentJobId, monitoredSiteId);
        return { success: true };
    }
    catch (err) {
        console.error(`[Worker] Job ${job.id} failed:`, err);
        (0, store_1.updateJobStatus)(jobId, { status: 'failed', error: err.message });
        socket_1.io.emit(`job-${jobId}-failed`, { error: err.message });
        throw err; // Ensure BullMQ registers failure
    }
}, {
    connection: new ioredis_1.default(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null }),
    concurrency: 2, // Allow 2 simultaneous audits
});
auditWorker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed`);
});
auditWorker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
});
