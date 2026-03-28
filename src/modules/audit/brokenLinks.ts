export const checkBrokenLinks = async (baseUrl: string, $: import('cheerio').CheerioAPI) => {
    const issues: any[] = [];
    const links: { href: string; text: string; isExternal: boolean; isNofollow: boolean }[] = [];

    let baseIsHttps = false;
    try {
        baseIsHttps = new URL(baseUrl).protocol === 'https:';
    } catch { }

    $('a').each((_, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        const rel = $(el).attr('rel') || '';
        
        if (href && !href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('#')) {
            try {
                const absoluteUrl = new URL(href, baseUrl);
                links.push({ 
                    href: absoluteUrl.href, 
                    text,
                    isExternal: absoluteUrl.hostname !== new URL(baseUrl).hostname,
                    isNofollow: rel.toLowerCase().includes('nofollow')
                });
            } catch { }
        }
    });

    // Check Mixed Content (HTTP links on HTTPS site)
    if (baseIsHttps) {
        const httpLinks = links.filter(l => l.href.startsWith('http://'));
        if (httpLinks.length > 0) {
            issues.push({
                category: 'Links',
                severity: 'Warning',
                issue: `Mixed Content: Found ${httpLinks.length} HTTP links on an HTTPS page`,
                location: `e.g. <a href="${httpLinks[0].href}">${httpLinks[0].text || 'Link'}</a>`,
                recommendation: 'Update internal and external links to use HTTPS to maintain security and trust.',
                code_example: `Change href to https://...`
            });
        }
    }

    const linksToCheck = links.slice(0, 30); // Increased from 15 for better coverage

    for (const link of linksToCheck) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10s per link

        try {
            // Check for broken links and redirect chains
            // Using Node 18+ native fetch. We set redirect: 'manual' to catch 301/302s.
            let response = await fetch(link.href, { 
                method: 'HEAD', 
                redirect: 'manual', 
                signal: controller.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' }
            }).catch(() => null);

            // Fallback to GET if HEAD is forbidden or not allowed
            if (!response || [403, 404, 405, 500, 501].includes(response.status)) {
                const getController = new AbortController();
                const timeoutGet = setTimeout(() => getController.abort(), 10000);
                response = await fetch(link.href, { 
                    method: 'GET', 
                    redirect: 'manual', 
                    signal: getController.signal,
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' }
                }).catch(() => null);
                clearTimeout(timeoutGet);
            }

            const statusCode = response ? response.status : 0;
            clearTimeout(timeout);

            if (statusCode >= 300 && statusCode < 400) {
                const redirectUrl = response?.headers.get('location');
                issues.push({
                    category: 'Links',
                    severity: 'Warning',
                    issue: `Redirecting Link Found (${statusCode})`,
                    location: `<a href="${link.href}">${link.text || 'Link'}</a>`,
                    recommendation: 'Linking directly to the final destination is slightly better for crawl efficiency.',
                    code_example: `Update href to ${redirectUrl || 'the final destination'}`
                });
            } else if (statusCode === 404 || statusCode >= 500 || statusCode === 0) {
                issues.push({
                    category: 'Links',
                    severity: 'Critical',
                    issue: `Broken link found (${statusCode === 0 ? 'Timeout/DNS' : statusCode})`,
                    location: `<a href="${link.href}">${link.text || 'Link'}</a>`,
                    recommendation: 'Remove or update the dead link to prevent a poor user experience.',
                    code_example: 'Check where this link goes and fix the href attribute.'
                });
            }
        } catch (e) {
            // Ignored
        }
    }

    return issues;
};
