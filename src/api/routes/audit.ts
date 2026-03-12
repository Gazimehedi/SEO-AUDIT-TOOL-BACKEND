import { Router } from 'express';
import { runFullWebsiteAudit } from '../../modules/audit';
import { createJob, getJobStatus } from '../../store';
import { randomUUID } from 'crypto';
import { prisma } from '../../config/db';
import puppeteer from 'puppeteer';
import { authMiddleware, optionalAuthMiddleware, AuthRequest } from '../../middleware/auth';
import { auditQueue } from '../../queue';

export const auditRouter = Router();

auditRouter.post('/start', optionalAuthMiddleware, async (req: AuthRequest, res) => {
    const { url, targetKeyword, projectId } = req.body;
    const userId = req.user?.userId;
    console.log(`[AUDIT START] Received request for ${url} from user:`, req.user || 'anonymous');

    if (!url) return res.status(400).json({ error: 'URL is required' });

    // Validate URL shape
    try {
        new URL(url);
    } catch (e) {
        return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Generate a Job ID
    const jobId = randomUUID();
    await createJob(jobId, url, userId, projectId);

    // Add to BullMQ queue instead of background promise
    await auditQueue.add(`audit-${jobId}`, { url, jobId, userId, targetKeyword, projectId });

    return res.json({
        message: 'Audit job started',
        jobId: jobId
    });
});

auditRouter.get('/history', authMiddleware, async (req: AuthRequest, res) => {
    try {
        const audits = await prisma.audit.findMany({
            where: { userId: req.user?.userId },
            orderBy: { createdAt: 'desc' },
            take: 20
        });
        return res.json(audits);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch history' });
    }
});

auditRouter.delete('/:jobId', authMiddleware, async (req: AuthRequest, res) => {
    const jobId = req.params.jobId as string;
    try {
        const audit = await prisma.audit.findUnique({ where: { id: jobId } });
        if (!audit) return res.status(404).json({ error: 'Job not found' });
        
        // Ensure user owns the audit record
        if (audit.userId !== req.user?.userId) {
            return res.status(403).json({ error: 'Unauthorized to delete this record' });
        }

        await prisma.audit.delete({ where: { id: jobId } });
        return res.json({ message: 'Audit deleted successfully' });
    } catch (err) {
        console.error('Failed to delete audit:', err);
        return res.status(500).json({ error: 'Failed to delete audit' });
    }
});

auditRouter.get('/:jobId/pdf', optionalAuthMiddleware, async (req: AuthRequest, res) => {
    const jobId = req.params.jobId as string;
    const type = req.query.type === 'advanced' ? 'advanced' : 'simple';

    try {
        const audit = await prisma.audit.findUnique({ where: { id: jobId } });
        if (!audit) return res.status(404).json({ error: 'Audit not found' });
        if (audit.userId && audit.userId !== req.user?.userId) {
            return res.status(403).json({ error: 'Unauthorized to view this report' });
        }

        const browser = await puppeteer.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        
        const reportUrl = type === 'advanced' 
            ? `http://localhost:3000/audit/${jobId}/report/advanced`
            : `http://localhost:3000/audit/${jobId}/report`;

        await page.goto(reportUrl, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ 
            format: 'A4',
            printBackground: true,
            margin: type === 'advanced' ? { top: '0', bottom: '0', left: '0', right: '0' } : { top: '40px', bottom: '40px', left: '40px', right: '40px' }
        });
        await browser.close();

        let safeDomain = 'report';
        try {
            safeDomain = new URL(audit.url).hostname.replace(/\./g, '-');
        } catch (e) {}

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="SEO-Audit-${safeDomain}.pdf"`,
            'Content-Length': pdfBuffer.length
        });

        return res.send(pdfBuffer);
    } catch (err: any) {
        return res.status(500).json({ error: 'Failed to generate PDF' });
    }
});

/**
 * GET /api/audit/:jobId/export - Export audit data as CSV or JSON
 */
auditRouter.get('/:jobId/export', optionalAuthMiddleware, async (req: AuthRequest, res) => {
    const jobId = req.params.jobId as string;
    const format = req.query.format === 'json' ? 'json' : 'csv';

    try {
        const audit = await prisma.audit.findUnique({ where: { id: jobId } });
        if (!audit) return res.status(404).json({ error: 'Audit not found' });
        if (audit.userId && audit.userId !== req.user?.userId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const results = (audit.results as any) || {};
        
        if (format === 'json') {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="SEO-Export-${jobId}.json"`);
            return res.json(results);
        }

        // Generate CSV
        const issues = results.issues || [];
        const rows: string[] = [];
        
        // Header
        rows.push('Category,Severity,Issue,Page URL,Recommendation');

        issues.forEach((issue: any) => {
            const category = (issue.category || 'General').replace(/"/g, '""');
            const severity = (issue.severity || 'Info').replace(/"/g, '""');
            const issueTitle = (issue.issue || 'N/A').replace(/"/g, '""').replace(/\n/g, ' ');
            const pageUrl = (issue.pageUrl || 'N/A').replace(/"/g, '""');
            const recommendation = (issue.recommendation || '').replace(/"/g, '""').replace(/\n/g, ' ');
            
            rows.push(`"${category}","${severity}","${issueTitle}","${pageUrl}","${recommendation}"`);
        });

        const csvContent = rows.join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="SEO-Export-${jobId}.csv"`);
        return res.send(csvContent);
    } catch (err) {
        console.error('Export failed:', err);
        return res.status(500).json({ error: 'Export failed' });
    }
});

auditRouter.get('/:jobId', async (req, res) => {
    const jobId = req.params.jobId as string;

    // 1. Check in-memory/Redis first for active jobs
    const activeJob = await getJobStatus(jobId);
    if (activeJob) return res.json(activeJob);

    // 2. Check Database for historical jobs
    try {
        const dbJob = await prisma.audit.findUnique({
            where: { id: jobId }
        });
        if (dbJob) return res.json(dbJob);
    } catch (err) { }

    return res.status(404).json({ error: 'Job not found' });
});
