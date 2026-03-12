import cron from 'node-cron';
import { prisma } from './config/db';
import { auditQueue } from './queue';
import { createJob } from './store';
import { randomUUID } from 'crypto';

/**
 * Runs every hour and checks which monitored sites are due for an audit.
 * - daily: re-audits if last audit was >24h ago
 * - weekly: re-audits if last audit was >7d ago
 */
export const startMonitoringScheduler = () => {
    cron.schedule('0 * * * *', async () => {
        console.log('[Scheduler] Checking monitored sites...');
        const now = new Date();

        try {
            const sites = await prisma.monitoredSite.findMany();

            for (const site of sites) {
                const lastAudit = site.lastAuditedAt;
                let isDue = false;

                if (!lastAudit) {
                    isDue = true;
                } else {
                    const hoursElapsed = (now.getTime() - lastAudit.getTime()) / 1000 / 3600;
                    if (site.interval === 'daily' && hoursElapsed >= 24) isDue = true;
                    if (site.interval === 'weekly' && hoursElapsed >= 168) isDue = true;
                }

                if (isDue) {
                    console.log(`[Scheduler] Triggering audit for ${site.url} (${site.interval})`);
                    const jobId = randomUUID();
                    await createJob(jobId, site.url, site.userId);
                    await auditQueue.add(`monitor-audit-${jobId}`, {
                        url: site.url,
                        jobId,
                        userId: site.userId,
                        monitoredSiteId: site.id,    // so the worker can save score back
                    });

                    // Mark as "in progress"
                    await prisma.monitoredSite.update({
                        where: { id: site.id },
                        data: { lastAuditedAt: now }
                    });
                }
            }
        } catch (err) {
            console.error('[Scheduler] Error during monitoring run:', err);
        }
    });

    console.log('[Scheduler] Monitoring scheduler started (runs every hour)');
};
