"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runFullWebsiteAudit = void 0;
const puppeteer_1 = __importDefault(require("puppeteer"));
const cheerio = __importStar(require("cheerio"));
const metaTags_1 = require("./metaTags");
const headings_1 = require("./headings");
const brokenLinks_1 = require("./brokenLinks");
const structuredData_1 = require("./structuredData");
const contentQuality_1 = require("./contentQuality");
const technicalSeo_1 = require("./technicalSeo");
const securityHeaders_1 = require("./securityHeaders");
const keywords_1 = require("./keywords");
const lighthouse_1 = require("./lighthouse");
const socket_1 = require("../../socket");
const store_1 = require("../../store");
const db_1 = require("../../config/db");
// ───────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────
/**
 * Strip query string and fragment from a URL, returning the canonical path key.
 * e.g. https://example.com/page?foo=bar#section  →  https://example.com/page
 */
const normalizeUrl = (url) => {
    try {
        const u = new URL(url);
        u.search = '';
        u.hash = '';
        // Remove trailing slash for consistency (but keep root /)
        const normalized = u.href.replace(/\/$/, '') || u.href;
        return normalized;
    }
    catch {
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
const isAuthUrl = (url) => {
    try {
        const pathname = new URL(url).pathname;
        return AUTH_PATH_PATTERNS.some(pattern => pattern.test(pathname));
    }
    catch {
        return false;
    }
};
const getUrlPriority = (url, baseUrl) => {
    try {
        const u = new URL(url);
        const path = u.pathname.toLowerCase();
        const segments = path.split('/').filter(Boolean);
        // Homepage
        if (segments.length === 0)
            return 100;
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
    }
    catch {
        return 0;
    }
};
// ───────────────────────────────────────────────
// Main Crawl
// ───────────────────────────────────────────────
const runFullWebsiteAudit = async (startUrl, jobId, userId, targetKeyword, isFast = false, parentJobId, monitoredSiteId) => {
    console.log(`Starting ${isFast ? 'FAST ' : 'full '}website audit for ${startUrl} (Job: ${jobId})`);
    const MAX_PAGES = isFast ? 1 : 15;
    const visited = new Set(); // stores normalized URLs
    // Priority queue: { url: original href, priority: number }
    const priorityQueue = [
        { url: startUrl, priority: 100 },
    ];
    const allIssues = [];
    const pageMetadata = {};
    let baseUrlObj;
    try {
        baseUrlObj = new URL(startUrl);
    }
    catch {
        await (0, store_1.updateJobStatus)(jobId, { status: 'failed', error: 'Invalid start URL' });
        socket_1.io.emit(`job-${jobId}-failed`, { error: 'Invalid URL' });
        return;
    }
    const baseHostname = baseUrlObj.hostname;
    let performanceScore = 100;
    /**
     * Insert a URL into the priority queue (sorted, highest priority first).
     * Skips if the normalized form has already been visited or queued.
     */
    const enqueue = (rawUrl) => {
        const norm = normalizeUrl(rawUrl);
        if (visited.has(norm))
            return;
        if (priorityQueue.some(item => normalizeUrl(item.url) === norm))
            return;
        // Skip auth/private pages — they don't need public SEO checks
        if (isAuthUrl(rawUrl))
            return;
        const priority = getUrlPriority(rawUrl, startUrl);
        // Insert in sorted position (descending priority)
        const idx = priorityQueue.findIndex(item => item.priority < priority);
        if (idx === -1) {
            priorityQueue.push({ url: rawUrl, priority });
        }
        else {
            priorityQueue.splice(idx, 0, { url: rawUrl, priority });
        }
    };
    try {
        socket_1.io.emit(`job-${jobId}-step`, { step: 'initializing' });
        const browser = await puppeteer_1.default.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        let pagesCrawled = 0;
        while (priorityQueue.length > 0 && visited.size < MAX_PAGES) {
            const { url: currentUrl } = priorityQueue.shift();
            const normCurrent = normalizeUrl(currentUrl);
            if (visited.has(normCurrent))
                continue;
            // Skip auth/private pages even if somehow they got into the queue
            if (isAuthUrl(currentUrl)) {
                console.log(`[Crawler] Skipping auth page: ${currentUrl}`);
                continue;
            }
            visited.add(normCurrent);
            pagesCrawled++;
            // Emit progress
            await (0, store_1.updateJobStatus)(jobId, {
                status: 'running',
                progress: {
                    crawled: pagesCrawled,
                    total: Math.min(visited.size + priorityQueue.length, MAX_PAGES),
                },
            });
            socket_1.io.emit(`job-${jobId}-progress`, { crawled: pagesCrawled, text: `Crawling ${normCurrent}` });
            socket_1.io.emit(`job-${jobId}-step`, { step: 'crawling' });
            try {
                const page = await browser.newPage();
                // Use networkidle2 so JS frameworks (Next.js/React) fully hydrate
                // before we capture and analyse the DOM. Without this, client-rendered
                // pages (like /login, /register) look empty and produce false positives.
                await page.goto(currentUrl, { waitUntil: 'networkidle2', timeout: 20000 });
                const html = await page.content();
                const $ = cheerio.load(html);
                // Analysis modules
                const metaResults = (0, metaTags_1.checkMetaTags)($, html);
                const headingIssues = (0, headings_1.checkHeadings)($);
                const linkIssues = await (0, brokenLinks_1.checkBrokenLinks)(currentUrl, $);
                const structuredDataIssues = (0, structuredData_1.checkStructuredData)($, html);
                const contentIssues = (0, contentQuality_1.checkContentQuality)($);
                const { keywords, targetIssues } = (0, keywords_1.extractKeywords)($, targetKeyword);
                // Domain-level audits only on the homepage (first page)
                if (pagesCrawled === 1) {
                    socket_1.io.emit(`job-${jobId}-step`, { step: 'analyzing-performance' });
                    socket_1.io.emit(`job-${jobId}-progress`, { crawled: pagesCrawled, text: `Running Domain-level Technical & Security checks...` });
                    const techIssues = await (0, technicalSeo_1.checkTechnicalSeo)(startUrl);
                    const securityIssues = await (0, securityHeaders_1.checkSecurityHeaders)(startUrl);
                    techIssues.forEach(i => i.location = `Domain (${baseHostname})`);
                    securityIssues.forEach(i => i.location = `Domain (${baseHostname})`);
                    allIssues.push(...techIssues, ...securityIssues);
                    socket_1.io.emit(`job-${jobId}-progress`, { crawled: pagesCrawled, text: `Running Performance audit on ${normCurrent}` });
                    const perfResults = await (0, lighthouse_1.runPerformanceAudit)(currentUrl);
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
                    await (0, store_1.updateJobStatus)(jobId, { results: currentResults });
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
                ].map((issue) => ({ ...issue, pageUrl: normCurrent }));
                allIssues.push(...pageIssues);
                // Discover and enqueue internal links
                $('a').each((_, el) => {
                    const href = $(el).attr('href');
                    if (!href)
                        return;
                    if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#'))
                        return;
                    try {
                        const absUrl = new URL(href, currentUrl);
                        // Only internal links, no static assets
                        if (absUrl.hostname === baseHostname &&
                            !absUrl.href.match(/\.(png|jpg|jpeg|gif|webp|css|js|pdf|svg|ico|woff|woff2|ttf|eot)(\?|$)/i)) {
                            enqueue(absUrl.href);
                        }
                    }
                    catch { /* ignore malformed hrefs */ }
                });
            }
            catch (pageErr) {
                console.error(`Failed crawling ${currentUrl}:`, pageErr);
            }
        }
        await browser.close();
        socket_1.io.emit(`job-${jobId}-step`, { step: 'finalizing' });
        // Scoring
        let finalScore = 100;
        const criticals = allIssues.filter(i => i.severity === 'Critical').length;
        const warnings = allIssues.filter(i => i.severity === 'Warning').length;
        finalScore -= criticals * 5;
        finalScore -= warnings * 1;
        finalScore = Math.max(0, finalScore);
        const status = await (0, store_1.getJobStatus)(jobId);
        const finalResults = {
            ...status?.results,
            issues: allIssues,
            pageMetadata,
            performanceScore,
        };
        await (0, store_1.updateJobStatus)(jobId, {
            status: 'complete',
            score: finalScore,
            results: finalResults,
            progress: { crawled: pagesCrawled, total: pagesCrawled },
        });
        if (parentJobId) {
            const parentJob = await (0, store_1.getJobStatus)(parentJobId);
            if (parentJob) {
                const competitors = parentJob.results?.competitors || [];
                const idx = competitors.findIndex((c) => c.id === jobId || c.url === startUrl);
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
                    await (0, store_1.updateJobStatus)(parentJobId, {
                        results: {
                            ...parentJob.results,
                            competitors
                        }
                    });
                    socket_1.io.emit(`job-${parentJobId}-progress`, { text: `Competitor ${new URL(startUrl).hostname} audit complete!` });
                }
            }
        }
        if (monitoredSiteId) {
            try {
                const site = await db_1.prisma.monitoredSite.findUnique({ where: { id: monitoredSiteId } });
                if (site) {
                    const oldScore = site.lastScore;
                    await db_1.prisma.monitoredSite.update({
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
                        socket_1.io.emit(`site-${monitoredSiteId}-drop`, { url: site.url, oldScore, newScore: finalScore, drop });
                    }
                }
            }
            catch (err) {
                console.error(`[Monitoring] Failed to update site ${monitoredSiteId}:`, err);
            }
        }
        await (0, store_1.persistAudit)(jobId);
        socket_1.io.emit(`job-${jobId}-complete`, { score: finalScore, results: finalResults });
    }
    catch (error) {
        console.error(`Fatal audit error for ${startUrl}:`, error);
        await (0, store_1.updateJobStatus)(jobId, { status: 'failed', error: error.message || 'Failed to crawl.' });
        socket_1.io.emit(`job-${jobId}-failed`, { error: error.message });
    }
};
exports.runFullWebsiteAudit = runFullWebsiteAudit;
