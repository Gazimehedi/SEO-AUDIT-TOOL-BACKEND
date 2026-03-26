"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkMetaTags = void 0;
const checkMetaTags = ($, html) => {
    const issues = [];
    // Lang Attribute Check
    const lang = $('html').attr('lang');
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
    // Charset
    const charset = $('meta[charset]').attr('charset');
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
    const title = $('title').text();
    if (!title) {
        issues.push({
            category: 'Meta & Basics',
            severity: 'Critical',
            issue: 'Missing <title> tag',
            location: 'head > title',
            recommendation: 'Every page must have a unique title describing the content.',
            code_example: '<title>Your Descriptive Page Title</title>'
        });
    }
    else if (title.length < 10 || title.length > 60) {
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
    const description = $('meta[name="description"]').attr('content');
    if (!description) {
        issues.push({
            category: 'Meta & Basics',
            severity: 'Critical',
            issue: 'Missing meta description',
            location: 'head > meta[name="description"]',
            recommendation: 'Add a meta description to improve click-through rates from search engines.',
            code_example: '<meta name="description" content="A brief summary of your page (150-160 chars)." />'
        });
    }
    else if (description.length < 50 || description.length > 160) {
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
    const viewport = $('meta[name="viewport"]').attr('content');
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
    const canonical = $('link[rel="canonical"]').attr('href');
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
    const robots = $('meta[name="robots"]').attr('content')?.toLowerCase() || '';
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
    const ogTitle = $('meta[property="og:title"]').attr('content');
    const ogImage = $('meta[property="og:image"]').attr('content');
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
    const twitterCard = $('meta[name="twitter:card"]').attr('content');
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
exports.checkMetaTags = checkMetaTags;
