"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.monitoringRouter = void 0;
const express_1 = require("express");
const db_1 = require("../../config/db");
const auth_1 = require("../../middleware/auth");
const queue_1 = require("../../queue");
const crypto_1 = require("crypto");
const store_1 = require("../../store");
exports.monitoringRouter = (0, express_1.Router)();
/**
 * GET /api/monitoring - List all monitored sites for the current user
 */
exports.monitoringRouter.get('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const sites = await db_1.prisma.monitoredSite.findMany({
            where: { userId: req.user.userId },
            orderBy: { createdAt: 'desc' }
        });
        return res.json(sites);
    }
    catch (err) {
        return res.status(500).json({ error: 'Failed to fetch monitored sites' });
    }
});
/**
 * POST /api/monitoring - Add a site to monitoring
 */
exports.monitoringRouter.post('/', auth_1.authMiddleware, async (req, res) => {
    const { url, interval = 'weekly', projectId } = req.body;
    const userId = req.user.userId;
    if (!url)
        return res.status(400).json({ error: 'URL is required' });
    if (!['daily', 'weekly'].includes(interval)) {
        return res.status(400).json({ error: 'Interval must be "daily" or "weekly"' });
    }
    try {
        new URL(url);
    }
    catch {
        return res.status(400).json({ error: 'Invalid URL format' });
    }
    try {
        // Check if already monitored
        const existing = await db_1.prisma.monitoredSite.findFirst({
            where: { url, userId }
        });
        if (existing) {
            return res.status(409).json({ error: 'This URL is already being monitored' });
        }
        const site = await db_1.prisma.monitoredSite.create({
            data: { url, interval, userId, projectId }
        });
        // Immediately trigger an initial audit
        const jobId = (0, crypto_1.randomUUID)();
        await (0, store_1.createJob)(jobId, url, userId, projectId);
        await queue_1.auditQueue.add(`audit-${jobId}`, { url, jobId, userId, isFast: false, projectId, monitoredSiteId: site.id });
        return res.status(201).json({ site, initialJobId: jobId });
    }
    catch (err) {
        console.error('Failed to add monitored site:', err);
        return res.status(500).json({ error: 'Failed to add monitored site' });
    }
});
/**
 * DELETE /api/monitoring/:id - Remove a site from monitoring
 */
exports.monitoringRouter.delete('/:id', auth_1.authMiddleware, async (req, res) => {
    const id = req.params.id;
    try {
        const site = await db_1.prisma.monitoredSite.findUnique({ where: { id } });
        if (!site)
            return res.status(404).json({ error: 'Monitored site not found' });
        if (site.userId !== req.user.userId)
            return res.status(403).json({ error: 'Unauthorized' });
        await db_1.prisma.monitoredSite.delete({ where: { id } });
        return res.json({ message: 'Site removed from monitoring' });
    }
    catch (err) {
        return res.status(500).json({ error: 'Failed to remove monitored site' });
    }
});
/**
 * PATCH /api/monitoring/:id - Update interval
 */
exports.monitoringRouter.patch('/:id', auth_1.authMiddleware, async (req, res) => {
    const id = req.params.id;
    const { interval } = req.body;
    if (!['daily', 'weekly'].includes(interval)) {
        return res.status(400).json({ error: 'Interval must be "daily" or "weekly"' });
    }
    try {
        const site = await db_1.prisma.monitoredSite.findUnique({ where: { id } });
        if (!site)
            return res.status(404).json({ error: 'Monitored site not found' });
        if (site.userId !== req.user.userId)
            return res.status(403).json({ error: 'Unauthorized' });
        const updated = await db_1.prisma.monitoredSite.update({
            where: { id },
            data: { interval }
        });
        return res.json(updated);
    }
    catch (err) {
        return res.status(500).json({ error: 'Failed to update interval' });
    }
});
