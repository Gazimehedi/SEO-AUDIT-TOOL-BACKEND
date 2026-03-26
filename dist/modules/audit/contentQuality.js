"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkContentQuality = void 0;
const checkContentQuality = ($) => {
    const issues = [];
    // Word Count (Thin Content)
    const bodyText = $('body').text();
    // basic word extraction
    const words = bodyText.replace(/\s+/g, ' ').trim().split(' ');
    const wordCount = words.length;
    if (wordCount < 300) {
        issues.push({
            category: 'Content Quality',
            severity: 'Warning',
            issue: `Thin Content: Page has low word count (~${wordCount} words)`,
            location: '<body>',
            recommendation: 'Pages generally need 300+ words of high-quality content to rank well for competitive terms.',
            code_example: 'Expand page content with valuable information.'
        });
    }
    // Duplicate Title / H1
    const title = $('title').text().trim();
    const h1 = $('h1').first().text().trim();
    if (title && h1 && title.toLowerCase() === h1.toLowerCase()) {
        issues.push({
            category: 'Content Quality',
            severity: 'Warning',
            issue: 'Title tag and H1 are identical',
            location: '<title> & <h1>',
            recommendation: 'While acceptable, it is often a missed opportunity. Make the <title> more catchy for CTR, and the <h1> more descriptive for on-page readers.',
            code_example: 'Vary the wording.'
        });
    }
    // Anchor Text Quality
    const genericAnchors = ['click here', 'read more', 'learn more', 'more', 'here', 'link'];
    let genericFound = 0;
    $('a').each((_, el) => {
        const text = $(el).text().trim().toLowerCase();
        if (genericAnchors.includes(text)) {
            genericFound++;
        }
    });
    if (genericFound > 0) {
        issues.push({
            category: 'Content Quality',
            severity: 'Warning',
            issue: `Found ${genericFound} links with generic anchor text (e.g. "click here")`,
            location: '<a>',
            recommendation: 'Use descriptive anchor text so users and search engines know what the target page is about.',
            code_example: '<a href="...">Read our SEO Guide</a> (instead of "click here")'
        });
    }
    // Sample of main content text (cleaned up)
    $('script, style, nav, footer, header').remove();
    const cleanText = $('body').text().replace(/\s+/g, ' ').trim();
    const contentSample = cleanText.substring(0, 1000);
    const h2s = [];
    $('h2').slice(0, 3).each((_, el) => {
        h2s.push($(el).text().trim());
    });
    return { issues, wordCount, h1, h2s, contentSample };
};
exports.checkContentQuality = checkContentQuality;
