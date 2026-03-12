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

    const linksToCheck = links.slice(0, 15); // limit heavily for speed

    for (const link of linksToCheck) {
        try {
            // Check for broken links and redirect chains
            // Using Node 18+ native fetch. We set redirect: 'manual' to catch 301/302s.
            const response = await fetch(link.href, { method: 'HEAD', redirect: 'manual' }).catch(() => null);

            const statusCode = response ? response.status : 0;

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
