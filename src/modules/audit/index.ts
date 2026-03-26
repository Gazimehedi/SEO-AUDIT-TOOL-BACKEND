import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { checkMetaTags } from './metaTags';
import { checkHeadings } from './headings';
import { checkBrokenLinks } from './brokenLinks';
import { checkStructuredData } from './structuredData';
import { checkContentQuality } from './contentQuality';
import { checkTechnicalSeo } from './technicalSeo';
import { checkSecurityHeaders } from './securityHeaders';
import { extractKeywords } from './keywords';
import { runPerformanceAudit } from './lighthouse';
import { io } from '../../socket';
import { updateJobStatus, getJobStatus, persistAudit } from '../../store';
import { prisma } from '../../config/db';

// ───────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────

/**
 * Strip query string and fragment from a URL, returning the canonical path key.
 * e.g. https://example.com/page?foo=bar#section  →  https://example.com/page
 */
const normalizeUrl = (url: string): string => {
    try {
        const u = new URL(url);
        u.search = '';
        u.hash = '';
        // Remove trailing slash for consistency (but keep root /)
        const normalized = u.href.replace(/\/$/, '') || u.href;
        return normalized;
    } catch {
        return url;
    }
};

/**
 * Priority score for a URL – higher = crawl sooner.
 *   - Root homepage               → 100
 *   - Important keyword in path   → +30
 *   - Shallower path depth        → +5 per fewer segment
 */
const HIGH_PRIORITY_KEYWORDS = [
    'home', 'about', 'contact', 'product', 'products', 'service', 'services',
    'pricing', 'price', 'plan', 'plans', 'feature', 'features', 'blog',
    'news', 'faq', 'help', 'support', 'team', 'careers', 'jobs',
];

/**
 * URL path segments that indicate a truly private/backend page — skip these.
 * NOTE: login, register, signup are intentionally left OUT — they are public
 * pages and should be audited for SEO quality.
 */
const AUTH_PATH_PATTERNS = [
    /\/logout(\/?|\?.*)$/i,
    /\/auth\/callback/i,
    /\/dashboard(\/.*)?$/i,
    /\/admin(\/.*)?$/i,
    /\/account(\/.*)?$/i,
    /\/profile(\/.*)?$/i,
    /\/settings(\/.*)?$/i,
    /\/forgot-password/i,
    /\/reset-password/i,
    /\/verify-email/i,
    /\/api\//i,
    
    // Application-specific authenticated actions
    /\/create(\/?|\?.*)$/i,
    /\/edit(\/?|\?.*)$/i,
    /\/update(\/?|\?.*)$/i,
    /\/delete(\/?|\?.*)$/i,
    /\/new(\/?|\?.*)$/i,
    
    // Common user/company dashboard structures
    /\/company\/.*\/create/i,
    /\/company\/.*\/edit/i,
    /\/user\/.*\/create/i,
    /\/user\/.*\/edit/i,
];

const isAuthUrl = (url: string): boolean => {
    try {
        const pathname = new URL(url).pathname;
        return AUTH_PATH_PATTERNS.some(pattern => pattern.test(pathname));
    } catch {
        return false;
    }
};

const getUrlPriority = (url: string, baseUrl: string): number => {
    try {
        const u = new URL(url);
        const path = u.pathname.toLowerCase();
        const segments = path.split('/').filter(Boolean);

        // Homepage
        if (segments.length === 0) return 100;

        let score = 50;

        // Boost for keyword presence
        for (const keyword of HIGH_PRIORITY_KEYWORDS) {
            if (segments.some(s => s.includes(keyword))) {
                score += 30;
                break;
            }
        }

        // Shallower paths first (each extra segment = -5)
        score -= (segments.length - 1) * 5;

        return Math.max(0, score);
    } catch {
        return 0;
    }
};

// ───────────────────────────────────────────────
// Main Crawl
// ───────────────────────────────────────────────

export const runFullWebsiteAudit = async (startUrl: string, jobId: string, userId?: string, targetKeyword?: string, isFast: boolean = false, parentJobId?: string, monitoredSiteId?: string) => {
    console.log(`Starting ${isFast ? 'FAST ' : 'full '}website audit for ${startUrl} (Job: ${jobId})`);
    const MAX_PAGES = isFast ? 1 : 15;

    const visited = new Set<string>(); // stores normalized URLs
    // Priority queue: { url: original href, priority: number }
    const priorityQueue: { url: string; priority: number }[] = [
        { url: startUrl, priority: 100 },
    ];
    const allIssues: any[] = [];
    const pageMetadata: Record<string, any> = {};

    let baseUrlObj: URL;
    try {
        baseUrlObj = new URL(startUrl);
    } catch {
        await updateJobStatus(jobId, { status: 'failed', error: 'Invalid start URL' });
        io.to(jobId).emit(`job-${jobId}-failed`, { error: 'Invalid URL' });
        return;
    }

    const baseHostname = baseUrlObj.hostname;
    let performanceScore = 100;

    /**
     * Insert a URL into the priority queue (sorted, highest priority first).
     * Skips if the normalized form has already been visited or queued.
     */
    const enqueue = (rawUrl: string) => {
        const norm = normalizeUrl(rawUrl);
        if (visited.has(norm)) return;
        if (priorityQueue.some(item => normalizeUrl(item.url) === norm)) return;
        // Skip auth/private pages — they don't need public SEO checks
        if (isAuthUrl(rawUrl)) return;
        const priority = getUrlPriority(rawUrl, startUrl);
        // Insert in sorted position (descending priority)
        const idx = priorityQueue.findIndex(item => item.priority < priority);
        if (idx === -1) {
            priorityQueue.push({ url: rawUrl, priority });
        } else {
            priorityQueue.splice(idx, 0, { url: rawUrl, priority });
        }
    };

    try {
        io.to(jobId).emit(`job-${jobId}-step`, { step: 'initializing' });
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });


        let pagesCrawled = 0;

        while (priorityQueue.length > 0 && visited.size < MAX_PAGES) {
            const { url: currentUrl } = priorityQueue.shift()!;
            const normCurrent = normalizeUrl(currentUrl);

            if (visited.has(normCurrent)) continue;
            // Skip auth/private pages even if somehow they got into the queue
            if (isAuthUrl(currentUrl)) {
                console.log(`[Crawler] Skipping auth page: ${currentUrl}`);
                continue;
            }
            visited.add(normCurrent);
            pagesCrawled++;

            // Emit progress
            await updateJobStatus(jobId, {
                status: 'running',
                progress: {
                    crawled: pagesCrawled,
                    total: Math.min(visited.size + priorityQueue.length, MAX_PAGES),
                },
            });
            io.to(jobId).emit(`job-${jobId}-progress`, { crawled: pagesCrawled, text: `Crawling ${normCurrent}` });
            io.to(jobId).emit(`job-${jobId}-step`, { step: 'crawling' });


            try {
                const page = await browser.newPage();
                // Use networkidle2 so JS frameworks (Next.js/React) fully hydrate
                // before we capture and analyse the DOM. Without this, client-rendered
                // pages (like /login, /register) look empty and produce false positives.
                await page.goto(currentUrl, { waitUntil: 'networkidle2', timeout: 20000 });
                const html = await page.content();

                const $ = cheerio.load(html);

                // Analysis modules
                const metaResults = checkMetaTags($, html);
                const headingIssues = checkHeadings($);
                const linkIssues = await checkBrokenLinks(currentUrl, $);
                const structuredDataIssues = checkStructuredData($, html);
                const contentIssues = checkContentQuality($);
                const { keywords, targetIssues } = extractKeywords($, targetKeyword);

                // Domain-level audits only on the homepage (first page)
                if (pagesCrawled === 1) {
                    io.to(jobId).emit(`job-${jobId}-step`, { step: 'analyzing-performance' });
                    io.to(jobId).emit(`job-${jobId}-progress`, { crawled: pagesCrawled, text: `Running Domain-level Technical & Security checks...` });

                    const techIssues = await checkTechnicalSeo(startUrl);
                    const securityIssues = await checkSecurityHeaders(startUrl);
                    techIssues.forEach(i => i.location = `Domain (${baseHostname})`);
                    securityIssues.forEach(i => i.location = `Domain (${baseHostname})`);
                    allIssues.push(...techIssues, ...securityIssues);

                    io.to(jobId).emit(`job-${jobId}-progress`, { crawled: pagesCrawled, text: `Running Performance audit on ${normCurrent}` });
                    const perfResults = await runPerformanceAudit(currentUrl);
                    performanceScore = perfResults.performanceScore;
                    perfResults.issues.forEach(i => i.location = `Homepage (${normCurrent})`);
                    allIssues.push(...perfResults.issues);
                    
                    // Store detailed performance data in the results object
                    const currentResults = {
                        title: metaResults.title,
                        description: metaResults.description,
                        performanceMetrics: perfResults.metrics,
                        mobileResult: perfResults.mobileResult
                    };

                    await updateJobStatus(jobId, { results: currentResults });
                }

                await page.close();

                pageMetadata[normCurrent] = {
                    title: metaResults.title,
                    description: metaResults.description,
                    h1: contentIssues.h1,
                    h2s: contentIssues.h2s,
                    contentSample: contentIssues.contentSample,
                    wordCount: contentIssues.wordCount,
                    keywords,
                    targetKeyword
                };

                const pageIssues = [
                    ...metaResults.issues,
                    ...headingIssues,
                    ...linkIssues,
                    ...structuredDataIssues,
                    ...contentIssues.issues,
                    ...targetIssues,
                ].map((issue: any) => ({ ...issue, pageUrl: normCurrent }));

                allIssues.push(...pageIssues);

                // Discover and enqueue internal links
                $('a').each((_, el) => {
                    const href = $(el).attr('href');
                    if (!href) return;
                    if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) return;

                    try {
                        const absUrl = new URL(href, currentUrl);
                        // Only internal links, no static assets
                        if (
                            absUrl.hostname === baseHostname &&
                            !absUrl.href.match(/\.(png|jpg|jpeg|gif|webp|css|js|pdf|svg|ico|woff|woff2|ttf|eot)(\?|$)/i)
                        ) {
                            enqueue(absUrl.href);
                        }
                    } catch { /* ignore malformed hrefs */ }
                });

            } catch (pageErr) {
                console.error(`Failed crawling ${currentUrl}:`, pageErr);
            }
        }

        await browser.close();
        io.to(jobId).emit(`job-${jobId}-step`, { step: 'finalizing' });

        // Scoring

        let finalScore = 100;
        const criticals = allIssues.filter(i => i.severity === 'Critical').length;
        const warnings = allIssues.filter(i => i.severity === 'Warning').length;
        finalScore -= criticals * 5;
        finalScore -= warnings * 1;
        finalScore = Math.max(0, finalScore);

        const status = await getJobStatus(jobId);
        const finalResults = {
            ...status?.results,
            issues: allIssues,
            pageMetadata,
            performanceScore,
        };

        await updateJobStatus(jobId, {
            status: 'complete',
            score: finalScore,
            results: finalResults,
            progress: { crawled: pagesCrawled, total: pagesCrawled },
        });

        if (parentJobId) {
            const parentJob = await getJobStatus(parentJobId);
            if (parentJob) {
                const competitors = parentJob.results?.competitors || [];
                const idx = competitors.findIndex((c: any) => c.id === jobId || c.url === startUrl);
                if (idx !== -1) {
                    competitors[idx] = {
                        ...competitors[idx],
                        status: 'complete',
                        score: finalScore,
                        performanceScore,
                        lcp: finalResults.performanceMetrics?.lcp,
                        cls: finalResults.performanceMetrics?.cls,
                        pageMetadata: finalResults.pageMetadata[normalizeUrl(startUrl)]
                    };
                    await updateJobStatus(parentJobId, {
                        results: {
                            ...parentJob.results,
                            competitors
                        }
                    });
                    io.to(jobId).emit(`job-${parentJobId}-progress`, { text: `Competitor ${new URL(startUrl).hostname} audit complete!` });
                }
            }
        }

        if (monitoredSiteId) {
            try {
                const site = await prisma.monitoredSite.findUnique({ where: { id: monitoredSiteId } });
                if (site) {
                    const oldScore = site.lastScore;
                    await prisma.monitoredSite.update({
                        where: { id: monitoredSiteId },
                        data: {
                            lastScore: finalScore,
                            previousScore: oldScore,
                            lastAuditedAt: new Date()
                        }
                    });

                    if (oldScore !== null && finalScore < oldScore) {
                        const drop = oldScore - finalScore;
                        console.log(`[Monitoring] Score drop detected for ${site.url}: ${oldScore} -> ${finalScore} (-${drop})`);
                        // In a real app, send email/push here.
                        io.to(jobId).emit(`site-${monitoredSiteId}-drop`, { url: site.url, oldScore, newScore: finalScore, drop });
                    }
                }
            } catch (err) {
                console.error(`[Monitoring] Failed to update site ${monitoredSiteId}:`, err);
            }
        }

        await persistAudit(jobId);

        io.to(jobId).emit(`job-${jobId}-complete`, { score: finalScore, results: finalResults });

    } catch (error: any) {
        console.error(`Fatal audit error for ${startUrl}:`, error);
        await updateJobStatus(jobId, { status: 'failed', error: error.message || 'Failed to crawl.' });
        io.to(jobId).emit(`job-${jobId}-failed`, { error: error.message });
    }
};

