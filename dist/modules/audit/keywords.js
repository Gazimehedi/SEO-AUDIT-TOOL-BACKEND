"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractKeywords = void 0;
const STOP_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'at', 'from', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'now', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am'
]);
const extractKeywords = ($, targetKeyword) => {
    const targetIssues = [];
    const $clone = $.load($.html());
    // Target Keyword Analysis
    if (targetKeyword) {
        const tk = targetKeyword.toLowerCase();
        const title = $clone('title').text().toLowerCase();
        const h1 = $clone('h1').first().text().toLowerCase();
        const metaDesc = $clone('meta[name="description"]').attr('content')?.toLowerCase() || '';
        if (!title.includes(tk)) {
            targetIssues.push({
                category: 'Keyword Intelligence',
                severity: 'Warning',
                issue: `Target keyword "${targetKeyword}" not found in Title tag`,
                location: '<title>',
                recommendation: 'Include your primary target keyword near the beginning of your title tag for better relevance.',
                code_example: `<title>${targetKeyword} | Your Brand</title>`
            });
        }
        if (!h1.includes(tk)) {
            targetIssues.push({
                category: 'Keyword Intelligence',
                severity: 'Warning',
                issue: `Target keyword "${targetKeyword}" not found in H1 heading`,
                location: '<h1>',
                recommendation: 'Your H1 should clearly state the topic of the page using your target keyword.',
                code_example: `<h1>Comprehensive Guide to ${targetKeyword}</h1>`
            });
        }
    }
    // Remove non-content elements
    $clone('script, style, nav, footer, header, noscript, iframe').remove();
    const text = $clone('body')
        .text()
        .toLowerCase()
        .replace(/[^\w\s-]/g, ' ') // Remove punctuation but keep hyphens
        .replace(/\s+/g, ' ')
        .trim();
    const words = text.split(' ').filter(word => word.length > 2 &&
        !STOP_WORDS.has(word) &&
        !/^\d+$/.test(word) // Ignore purely numeric "words"
    );
    const totalWords = words.length;
    if (totalWords === 0)
        return { keywords: [], targetIssues };
    const counts = {};
    words.forEach(word => {
        counts[word] = (counts[word] || 0) + 1;
    });
    const result = Object.entries(counts)
        .map(([word, count]) => ({
        word,
        count,
        density: parseFloat(((count / totalWords) * 100).toFixed(2))
    }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20); // Top 20 keywords
    return { keywords: result, targetIssues };
};
exports.extractKeywords = extractKeywords;
