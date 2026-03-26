"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkSecurityHeaders = void 0;
const checkSecurityHeaders = async (baseUrl) => {
    const issues = [];
    try {
        const start = Date.now();
        // Use Node native fetch
        const response = await fetch(baseUrl, { method: 'GET', signal: AbortSignal.timeout(10000) }).catch(() => null);
        const ttfb = Date.now() - start;
        if (!response)
            return issues;
        // TTFB check
        if (ttfb > 1000) {
            issues.push({
                category: 'Technical SEO',
                severity: 'Warning',
                issue: `Slow Server Response (TTFB: ${ttfb}ms)`,
                location: 'Initial Document Request',
                recommendation: 'Time to First Byte (TTFB) should ideally be under 500ms. Improve server performance or use a CDN.',
                code_example: 'Upgrade hosting, cache DB queries, or use Cloudflare.'
            });
        }
        // Page Size check
        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > 2 * 1024 * 1024) { // 2MB
            issues.push({
                category: 'Technical SEO',
                severity: 'Warning',
                issue: `Large HTML Document Size (>2MB)`,
                location: 'Initial Document Request',
                recommendation: 'Heavy HTML documents slow down parsing. Use gzip/brotli compression and remove inline CSS/JS.',
                code_example: 'Enable gzip on your server.'
            });
        }
        // Security Headers
        const headers = response.headers;
        if (!headers.has('content-security-policy')) {
            issues.push({
                category: 'Security',
                severity: 'Warning',
                issue: 'Missing Content-Security-Policy header',
                location: 'HTTP Response Headers',
                recommendation: 'Protects against Cross-Site Scripting (XSS) and data injection attacks.',
                code_example: "Content-Security-Policy: default-src 'self'"
            });
        }
        if (!headers.has('strict-transport-security') && baseUrl.startsWith('https')) {
            issues.push({
                category: 'Security',
                severity: 'Critical',
                issue: 'Missing Strict-Transport-Security (HSTS) header',
                location: 'HTTP Response Headers',
                recommendation: 'Crucial for HTTPS sites to force browsers to always connect securely.',
                code_example: 'Strict-Transport-Security: max-age=31536000; includeSubDomains'
            });
        }
        if (!headers.has('x-content-type-options')) {
            issues.push({
                category: 'Security',
                severity: 'Warning',
                issue: 'Missing X-Content-Type-Options header',
                location: 'HTTP Response Headers',
                recommendation: 'Prevents MIME-sniffing vulnerabilities.',
                code_example: 'X-Content-Type-Options: nosniff'
            });
        }
        if (!headers.has('x-frame-options')) {
            issues.push({
                category: 'Security',
                severity: 'Warning',
                issue: 'Missing X-Frame-Options header',
                location: 'HTTP Response Headers',
                recommendation: 'Prevents clickjacking attacks by ensuring your content is not embedded in frames on other sites.',
                code_example: 'X-Frame-Options: DENY'
            });
        }
    }
    catch (e) {
        // Ignored
    }
    return issues;
};
exports.checkSecurityHeaders = checkSecurityHeaders;
