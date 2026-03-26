"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.competitorsRouter = void 0;
const express_1 = require("express");
const queue_1 = require("../../queue");
const store_1 = require("../../store");
const crypto_1 = require("crypto");
exports.competitorsRouter = (0, express_1.Router)();
/**
 * Start a competitor comparison audit
 * POST /api/competitors/compare/:jobId
 */
exports.competitorsRouter.post('/compare/:jobId', async (req, res) => {
    const { jobId } = req.params;
    const { competitorUrl } = req.body;
    if (!competitorUrl) {
        return res.status(400).json({ error: 'Competitor URL is required' });
    }
    try {
        new URL(competitorUrl);
    }
    catch (e) {
        return res.status(400).json({ error: 'Invalid Competitor URL format' });
    }
    const job = await (0, store_1.getJobStatus)(jobId);
    if (!job) {
        return res.status(404).json({ error: 'Original Audit Job not found' });
    }
    // Generate a unique ID for the competitor audit, linked to the original
    const compJobId = `comp-${(0, crypto_1.randomUUID)()}`;
    // Add to queue with isFast: true
    await queue_1.auditQueue.add(`audit-${compJobId}`, {
        url: competitorUrl,
        jobId: compJobId,
        userId: job.userId,
        isFast: true,
        parentJobId: jobId // Reference back to the original job
    });
    // Update the original job to track this competitor addition (initial state)
    const competitors = job.results?.competitors || [];
    competitors.push({
        id: compJobId,
        url: competitorUrl,
        status: 'pending'
    });
    await (0, store_1.updateJobStatus)(jobId, {
        results: {
            ...job.results,
            competitors
        }
    });
    return res.json({
        message: 'Competitor audit started',
        competitorJobId: compJobId
    });
});
