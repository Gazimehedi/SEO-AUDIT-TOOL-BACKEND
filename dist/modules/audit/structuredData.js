"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkStructuredData = void 0;
const checkStructuredData = ($, html) => {
    const issues = [];
    const scripts = $('script[type="application/ld+json"]');
    if (scripts.length === 0) {
        issues.push({
            category: 'Structured Data',
            severity: 'Warning',
            issue: 'No JSON-LD structured data found',
            location: 'head or body',
            recommendation: 'Add structured data (Schema.org) to help search engines understand the context of your page (e.g., Article, Product, Organization).',
            code_example: '<script type="application/ld+json">{ "@context": "https://schema.org", "@type": "Organization", ... }</script>'
        });
        return issues;
    }
    scripts.each((_, el) => {
        const content = $(el).html();
        if (!content)
            return;
        try {
            const parsed = JSON.parse(content);
            const type = parsed['@type'] || (Array.isArray(parsed) && parsed[0]?.['@type']);
            if (!type) {
                issues.push({
                    category: 'Structured Data',
                    severity: 'Warning',
                    issue: 'Structured data missing @type declaration',
                    location: '<script type="application/ld+json">',
                    recommendation: 'Every structured data object must declare an @type (e.g., "WebPage", "Product").',
                    code_example: '"@type": "Organization"'
                });
            }
        }
        catch (e) {
            issues.push({
                category: 'Structured Data',
                severity: 'Critical',
                issue: 'Invalid JSON format in structured data',
                location: '<script type="application/ld+json">',
                recommendation: 'The JSON-LD contains syntax errors and cannot be parsed by search engines. Use a schema validator.',
                code_example: 'Check for trailing commas or missing quotes.'
            });
        }
    });
    return issues;
};
exports.checkStructuredData = checkStructuredData;
