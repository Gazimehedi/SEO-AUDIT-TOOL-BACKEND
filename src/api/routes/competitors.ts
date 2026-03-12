import { Router } from 'express';
import { auditQueue } from '../../queue';
import { getJobStatus, updateJobStatus } from '../../store';
import { randomUUID } from 'crypto';

export const competitorsRouter = Router();

/**
 * Start a competitor comparison audit
 * POST /api/competitors/compare/:jobId
 */
competitorsRouter.post('/compare/:jobId', async (req, res) => {
    const { jobId } = req.params;
    const { competitorUrl } = req.body;

    if (!competitorUrl) {
        return res.status(400).json({ error: 'Competitor URL is required' });
    }

    try {
        new URL(competitorUrl);
    } catch (e) {
        return res.status(400).json({ error: 'Invalid Competitor URL format' });
    }

    const job = await getJobStatus(jobId);
    if (!job) {
        return res.status(404).json({ error: 'Original Audit Job not found' });
    }

    // Generate a unique ID for the competitor audit, linked to the original
    const compJobId = `comp-${randomUUID()}`;
    
    // Add to queue with isFast: true
    await auditQueue.add(`audit-${compJobId}`, { 
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

    await updateJobStatus(jobId, {
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
