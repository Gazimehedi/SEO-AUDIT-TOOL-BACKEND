import puppeteer from 'puppeteer';

export interface PerformanceResult {
    performanceScore: number;
    issues: any[];
    metrics: {
        lcp: number;
        cls: number;
        loadTime: number;
        contentSize: number;
        isCompressed: boolean;
        cacheHits: number;
    };
    mobileResult?: {
        score: number;
        lcp: number;
        issues: any[];
    };
}

export const runPerformanceAudit = async (url: string): Promise<PerformanceResult> => {
    let score = 100;
    const issues: any[] = [];
    
    const browser = await puppeteer.launch({ 
        headless: true, 
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });

    try {
        const page = await browser.newPage();
        
        // 1. Capture Network & Compression Info
        let totalBytes = 0;
        let isCompressed = false;
        let cacheHits = 0;

        await page.setRequestInterception(true);
        page.on('request', request => request.continue());
        page.on('response', response => {
            const headers = response.headers();
            const size = parseInt(headers['content-length'] || '0');
            totalBytes += size;
            
            if (headers['content-encoding']?.match(/gzip|br|deflate/)) isCompressed = true;
            if (headers['x-cache']?.includes('HIT') || headers['cf-cache-status'] === 'HIT') cacheHits++;
        });

        // 2. Inject Metrics Tracking
        await page.evaluateOnNewDocument(() => {
            (window as any).lcp = 0;
            (window as any).cls = 0;
            
            new PerformanceObserver((entryList) => {
                for (const entry of entryList.getEntries()) {
                    (window as any).lcp = entry.startTime;
                }
            }).observe({ type: 'largest-contentful-paint', buffered: true });

            new PerformanceObserver((entryList) => {
                for (const entry of entryList.getEntries() as any) {
                    if (!entry.hadRecentInput) {
                        (window as any).cls += entry.value;
                    }
                }
            }).observe({ type: 'layout-shift', buffered: true });
        });

        // 3. Main Navigation
        const start = Date.now();
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        const loadTime = Date.now() - start;

        // Extract metrics
        const { lcp, cls } = await page.evaluate(() => ({
            lcp: (window as any).lcp,
            cls: (window as any).cls
        }));

        // 4. Analysis Logic
        if (lcp > 2500) {
            score -= 15;
            issues.push({
                category: 'Performance',
                severity: lcp > 4000 ? 'Critical' : 'Warning',
                issue: 'Slow Largest Contentful Paint (LCP)',
                recommendation: `LCP is ${Math.round(lcp)}ms. Goal is < 2500ms. Large images or slow server response might be the cause.`,
                code_example: 'Check for heavy images above the fold.'
            });
        }

        if (cls > 0.1) {
            score -= 10;
            issues.push({
                category: 'Performance',
                severity: cls > 0.25 ? 'Critical' : 'Warning',
                issue: 'Poor Cumulative Layout Shift (CLS)',
                recommendation: `CLS is ${cls.toFixed(3)}. Goal is < 0.1. Elements are jumping around while loading.`,
                code_example: 'Set explicit width/height on images and ads.'
            });
        }

        if (loadTime > 3000) {
            score -= 10;
            issues.push({
                category: 'Performance',
                severity: 'Warning',
                issue: 'High Page Load Time',
                recommendation: `Total load took ${(loadTime / 1000).toFixed(1)}s.`,
                code_example: 'Implement code splitting or minify assets.'
            });
        }

        // Image optimization check
        const imagesWithoutLazy = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('img:not([loading="lazy"])')).length;
        });
        if (imagesWithoutLazy > 3) {
            issues.push({
                category: 'Performance',
                severity: 'Warning',
                issue: 'Missing Lazy Loading',
                recommendation: `${imagesWithoutLazy} images are missing loading="lazy".`,
                code_example: '<img src="..." loading="lazy" />'
            });
        }

        // 5. Mobile Emulation Pass (Quick check)
        const mobilePage = await browser.newPage();
        await mobilePage.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1');
        await mobilePage.setViewport({ width: 375, height: 667, isMobile: true });
        
        const mStart = Date.now();
        await mobilePage.goto(url, { waitUntil: 'load', timeout: 20000 });
        const mLcp = await mobilePage.evaluate(() => (window as any).lcp || 0);

        await browser.close();

        return {
            performanceScore: Math.max(0, score),
            issues,
            metrics: {
                lcp,
                cls,
                loadTime,
                contentSize: totalBytes,
                isCompressed,
                cacheHits
            },
            mobileResult: {
                score: mLcp > 3000 ? 60 : 90,
                lcp: mLcp,
                issues: mLcp > 3000 ? [{ severity: 'Warning', issue: 'Slower Mobile Page Load' }] : []
            }
        };

    } catch (error) {
        console.error('Lighthouse audit failed:', error);
        if (browser) await browser.close();
        return {
            performanceScore: 50,
            issues: [{ category: 'Performance', severity: 'Warning', issue: 'Performance audit failed' }],
            metrics: { lcp: 0, cls: 0, loadTime: 0, contentSize: 0, isCompressed: false, cacheHits: 0 }
        };
    }
};
