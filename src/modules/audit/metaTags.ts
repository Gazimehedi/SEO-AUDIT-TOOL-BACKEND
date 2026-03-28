import * as cheerio from 'cheerio';

export const checkMetaTags = ($: cheerio.CheerioAPI, html: string) => {
    const issues: any[] = [];

    // Helper for case-insensitive meta attributes (Robust alternative to [attr="val" i])
    const getMeta = (nameOrProperty: string) => {
        let content = '';
        
        // 1. Try Cheerio first (standard)
        $('meta').each((_, el) => {
            const attrName = $(el).attr('name') || '';
            const attrProp = $(el).attr('property') || '';
            if (attrName.toLowerCase() === nameOrProperty.toLowerCase() || 
                attrProp.toLowerCase() === nameOrProperty.toLowerCase()) {
                content = $(el).attr('content') || '';
                return false; // break
            }
        });

        // 2. Regex Fallback (If Cheerio missed it or HTML is slightly malformed)
        if (!content) {
            const regex = new RegExp(`<meta[^>]*?(?:name|property)=["']${nameOrProperty}["'][^>]*?content=["']([^"']*)["']`, 'i');
            const match = html.match(regex);
            if (match && match[1]) {
                content = match[1];
            } else {
                // Try reverse order: content before name/property
                const regexRev = new RegExp(`<meta[^>]*?content=["']([^"']*)["'][^>]*?(?:name|property)=["']${nameOrProperty}["']`, 'i');
                const matchRev = html.match(regexRev);
                if (matchRev && matchRev[1]) content = matchRev[1];
            }
        }

        return content;
    };

    // Lang Attribute Check
    const lang = $('html').attr('lang') || $('html').attr('xml:lang') || $('body').attr('lang');
    if (!lang) {
        issues.push({
            category: 'Meta & Basics',
            severity: 'Critical',
            issue: 'Missing lang attribute on <html>',
            location: 'html',
            recommendation: 'Specify the language of the page for SEO and accessibility.',
            code_example: '<html lang="en">'
        });
    }

    // Charset robustness
    let charset = $('meta[charset]').attr('charset');
    if (!charset) {
        // Fallback for http-equiv
        $('meta').each((_, el) => {
            const httpEquiv = $(el).attr('http-equiv') || '';
            if (httpEquiv.toLowerCase() === 'content-type') {
                const content = $(el).attr('content') || '';
                if (content.toLowerCase().includes('charset=')) {
                    charset = content.split(/charset=/i)[1];
                    return false;
                }
            }
        });
    }

    if (!charset) {
        issues.push({
            category: 'Meta & Basics',
            severity: 'Warning',
            issue: 'Missing charset declaration',
            location: 'head > meta[charset]',
            recommendation: 'Declare the character encoding (UTF-8 is recommended).',
            code_example: '<meta charset="UTF-8">'
        });
    }

    // Title Check
    const titleRaw = $('title').text() || '';
    const title = titleRaw.trim();
    if (!title) {
        issues.push({
            category: 'Meta & Basics',
            severity: 'Critical',
            issue: 'Missing <title> tag',
            location: 'head > title',
            recommendation: 'Every page must have a unique title describing the content.',
            code_example: '<title>Your Descriptive Page Title</title>'
        });
    } else if (title.length < 10 || title.length > 60) {
        issues.push({
            category: 'Meta & Basics',
            severity: 'Warning',
            issue: 'Title length is not optimal',
            location: 'head > title',
            recommendation: `Current length: ${title.length}. Optimal is 10-60 characters.`,
            code_example: '<title>Your Descriptive Page Title (10-60 chars)</title>'
        });
    }

    // Meta Description
    const description = getMeta('description').trim();
    if (!description) {
        issues.push({
            category: 'Meta & Basics',
            severity: 'Critical',
            issue: 'Missing meta description',
            location: 'head > meta[name="description"]',
            recommendation: 'Add a meta description to improve click-through rates from search engines.',
            code_example: '<meta name="description" content="A brief summary of your page (150-160 chars)." />'
        });
    } else if (description.length < 50 || description.length > 160) {
        issues.push({
            category: 'Meta & Basics',
            severity: 'Warning',
            issue: 'Meta description length is not optimal',
            location: 'head > meta[name="description"]',
            recommendation: `Current length: ${description.length}. Optimal is 50-160 characters.`,
            code_example: '<meta name="description" content="A brief summary of your page (150-160 chars)." />'
        });
    }

    // Viewport
    const viewport = getMeta('viewport');
    if (!viewport) {
        issues.push({
            category: 'Mobile & Layout',
            severity: 'Critical',
            issue: 'Missing viewport tag',
            location: 'head > meta[name="viewport"]',
            recommendation: 'Required for mobile responsiveness.',
            code_example: '<meta name="viewport" content="width=device-width, initial-scale=1.0" />'
        });
    }

    // Canonical
    const canonical = $('link[rel="canonical"]').attr('href') || $('link[rel="Canonical"]').attr('href');
    if (!canonical) {
        issues.push({
            category: 'Meta & Basics',
            severity: 'Warning',
            issue: 'Missing canonical URL',
            location: 'head > link[rel="canonical"]',
            recommendation: 'Prevents duplicate content issues.',
            code_example: '<link rel="canonical" href="https://example.com/your-url" />'
        });
    }

    // Robots Meta Tag
    const robots = getMeta('robots').toLowerCase();
    if (robots.includes('noindex')) {
        issues.push({
            category: 'Technical SEO',
            severity: 'Critical',
            issue: 'Page blocked from indexing via meta robots',
            location: 'head > meta[name="robots"]',
            recommendation: 'Remove "noindex" if you want search engines to rank this page.',
            code_example: 'Remove <meta name="robots" content="noindex">'
        });
    }

    // Social Meta Tags (Open Graph)
    const ogTitle = getMeta('og:title');
    const ogImage = getMeta('og:image');
    if (!ogTitle || !ogImage) {
        issues.push({
            category: 'Social / Open Graph',
            severity: 'Warning',
            issue: 'Missing core Open Graph tags',
            location: 'head > meta[property="og:..."]',
            recommendation: 'Add og:title and og:image to ensure links look good when shared on social media.',
            code_example: '<meta property="og:image" content="https://example.com/image.jpg" />'
        });
    }

    // Twitter Cards
    const twitterCard = getMeta('twitter:card');
    if (!twitterCard) {
        issues.push({
            category: 'Social / Open Graph',
            severity: 'Warning',
            issue: 'Missing Twitter Card type',
            location: 'head > meta[name="twitter:card"]',
            recommendation: 'Add a twitter:card meta tag to define the preview format on Twitter.',
            code_example: '<meta name="twitter:card" content="summary_large_image" />'
        });
    }

    return { title, description, issues };
};
