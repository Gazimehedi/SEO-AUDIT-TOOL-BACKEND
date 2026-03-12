import { Router } from 'express';
import { prisma } from '../../config/db';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import { auditQueue } from '../../queue';
import { randomUUID } from 'crypto';
import { createJob } from '../../store';

export const monitoringRouter = Router();

/**
 * GET /api/monitoring - List all monitored sites for the current user
 */
monitoringRouter.get('/', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const sites = await prisma.monitoredSite.findMany({
            where: { userId: req.user!.userId },
            orderBy: { createdAt: 'desc' }
        });
        return res.json(sites);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch monitored sites' });
    }
});

/**
 * POST /api/monitoring - Add a site to monitoring
 */
monitoringRouter.post('/', authMiddleware, async (req: AuthRequest, res) => {
    const { url, interval = 'weekly', projectId } = req.body;
    const userId = req.user!.userId;

    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (!['daily', 'weekly'].includes(interval)) {
        return res.status(400).json({ error: 'Interval must be "daily" or "weekly"' });
    }

    try {
        new URL(url);
    } catch {
        return res.status(400).json({ error: 'Invalid URL format' });
    }

    try {
        // Check if already monitored
        const existing = await prisma.monitoredSite.findFirst({
            where: { url, userId }
        });
        if (existing) {
            return res.status(409).json({ error: 'This URL is already being monitored' });
        }

        const site = await prisma.monitoredSite.create({
            data: { url, interval, userId, projectId }
        });

        // Immediately trigger an initial audit
        const jobId = randomUUID();
        await createJob(jobId, url, userId, projectId);
        await auditQueue.add(`audit-${jobId}`, { url, jobId, userId, isFast: false, projectId, monitoredSiteId: site.id });

        return res.status(201).json({ site, initialJobId: jobId });
    } catch (err) {
        console.error('Failed to add monitored site:', err);
        return res.status(500).json({ error: 'Failed to add monitored site' });
    }
});

/**
 * DELETE /api/monitoring/:id - Remove a site from monitoring
 */
monitoringRouter.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
    const id = req.params.id as string;
    try {
        const site = await prisma.monitoredSite.findUnique({ where: { id } });
        if (!site) return res.status(404).json({ error: 'Monitored site not found' });
        if (site.userId !== req.user!.userId) return res.status(403).json({ error: 'Unauthorized' });

        await prisma.monitoredSite.delete({ where: { id } });
        return res.json({ message: 'Site removed from monitoring' });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to remove monitored site' });
    }
});

/**
 * PATCH /api/monitoring/:id - Update interval
 */
monitoringRouter.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
    const id = req.params.id as string;
    const { interval } = req.body;

    if (!['daily', 'weekly'].includes(interval)) {
        return res.status(400).json({ error: 'Interval must be "daily" or "weekly"' });
    }

    try {
        const site = await prisma.monitoredSite.findUnique({ where: { id } });
        if (!site) return res.status(404).json({ error: 'Monitored site not found' });
        if (site.userId !== req.user!.userId) return res.status(403).json({ error: 'Unauthorized' });

        const updated = await prisma.monitoredSite.update({
            where: { id },
            data: { interval }
        });
        return res.json(updated);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to update interval' });
    }
});
