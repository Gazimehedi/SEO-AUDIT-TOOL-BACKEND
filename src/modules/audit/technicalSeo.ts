export const checkTechnicalSeo = async (baseUrl: string) => {
    const issues: any[] = [];
    
    let isHttps = false;
    let baseHostname = '';
    try {
        const urlObj = new URL(baseUrl);
        isHttps = urlObj.protocol === 'https:';
        baseHostname = urlObj.hostname;
    } catch { return issues; }

    if (!isHttps) {
        issues.push({
            category: 'Technical SEO',
            severity: 'Critical',
            issue: 'Site is not using HTTPS',
            location: 'Domain Protocol',
            recommendation: 'Install an SSL certificate. HTTPS is a Google ranking signal and prevents browser security warnings.',
            code_example: 'Redirect all HTTP traffic to HTTPS via server config.'
        });
    }

    // Check Robots.txt
    try {
        const robotsUrl = new URL('/robots.txt', baseUrl).href;
        const robotsRes = await fetch(robotsUrl, { method: 'GET', signal: AbortSignal.timeout(5000) }).catch(() => null);
        
        if (robotsRes?.status === 200) {
            const text = await robotsRes.text();
            if (text.includes('Disallow: /') && !text.includes('Disallow: /wp-admin')) {
                // Heuristic: if it disallows root, it might be blocking everything
                if (text.includes('User-agent: *\\nDisallow: /')) {
                    issues.push({
                        category: 'Technical SEO',
                        severity: 'Critical',
                        issue: 'robots.txt is blocking all crawlers',
                        location: '/robots.txt',
                        recommendation: 'Remove "Disallow: /" or search engines cannot index your site.',
                        code_example: 'User-agent: *\\nDisallow:'
                    });
                }
            } else {
                issues.push({
                    category: 'Technical SEO',
                    severity: 'Passed',
                    issue: 'Valid robots.txt found',
                    location: '/robots.txt',
                    recommendation: 'Crawlers can safely determine which pages they are allowed to access.',
                    code_example: ''
                });
            }
        } else {
            issues.push({
                category: 'Technical SEO',
                severity: 'Warning',
                issue: 'robots.txt file not found',
                location: '/robots.txt',
                recommendation: 'Create a robots.txt file to tell crawlers which pages they can or cannot request.',
                code_example: 'User-agent: *\\nAllow: /'
            });
        }
    } catch { }

    // Check Sitemap (basic check)
    try {
        const sitemapUrl = new URL('/sitemap.xml', baseUrl).href;
        const sitemapRes = await fetch(sitemapUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) }).catch(() => null);
        
        if (sitemapRes?.status === 200) {
            issues.push({
                category: 'Technical SEO',
                severity: 'Passed',
                issue: 'Valid sitemap.xml found',
                location: '/sitemap.xml',
                recommendation: 'Search engines can use this sitemap to discover your pages faster.',
                code_example: ''
            });
        } else {
            issues.push({
                category: 'Technical SEO',
                severity: 'Warning',
                issue: 'sitemap.xml not found at standard location',
                location: '/sitemap.xml',
                recommendation: 'An XML sitemap helps search engines discover your pages faster. Submit it to Google Search Console.',
                code_example: 'Generate an XML sitemap and place it at the root.'
            });
        }
    } catch { }

    return issues;
};
