"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMonitoringScheduler = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const db_1 = require("./config/db");
const queue_1 = require("./queue");
const store_1 = require("./store");
const crypto_1 = require("crypto");
/**
 * Runs every hour and checks which monitored sites are due for an audit.
 * - daily: re-audits if last audit was >24h ago
 * - weekly: re-audits if last audit was >7d ago
 */
const startMonitoringScheduler = () => {
    node_cron_1.default.schedule('0 * * * *', async () => {
        console.log('[Scheduler] Checking monitored sites...');
        const now = new Date();
        try {
            const sites = await db_1.prisma.monitoredSite.findMany();
            for (const site of sites) {
                const lastAudit = site.lastAuditedAt;
                let isDue = false;
                if (!lastAudit) {
                    isDue = true;
                }
                else {
                    const hoursElapsed = (now.getTime() - lastAudit.getTime()) / 1000 / 3600;
                    if (site.interval === 'daily' && hoursElapsed >= 24)
                        isDue = true;
                    if (site.interval === 'weekly' && hoursElapsed >= 168)
                        isDue = true;
                }
                if (isDue) {
                    console.log(`[Scheduler] Triggering audit for ${site.url} (${site.interval})`);
                    const jobId = (0, crypto_1.randomUUID)();
                    await (0, store_1.createJob)(jobId, site.url, site.userId);
                    await queue_1.auditQueue.add(`monitor-audit-${jobId}`, {
                        url: site.url,
                        jobId,
                        userId: site.userId,
                        monitoredSiteId: site.id, // so the worker can save score back
                    });
                    // Mark as "in progress"
                    await db_1.prisma.monitoredSite.update({
                        where: { id: site.id },
                        data: { lastAuditedAt: now }
                    });
                }
            }
        }
        catch (err) {
            console.error('[Scheduler] Error during monitoring run:', err);
        }
    });
    console.log('[Scheduler] Monitoring scheduler started (runs every hour)');
};
exports.startMonitoringScheduler = startMonitoringScheduler;
