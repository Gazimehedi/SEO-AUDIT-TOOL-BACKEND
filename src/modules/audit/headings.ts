import * as cheerio from 'cheerio';

export const checkHeadings = ($: cheerio.CheerioAPI) => {
    const issues: any[] = [];

    // H1 Checks
    const h1s = $('h1');
    if (h1s.length === 0) {
        issues.push({
            category: 'Content Structure',
            severity: 'Critical',
            issue: 'Missing H1 heading',
            location: 'No <h1> tags found',
            recommendation: 'Every page should have exactly one H1 describing the main topic.',
            code_example: '<h1>Your Main Topic Heading</h1>'
        });
    } else if (h1s.length > 1) {
        issues.push({
            category: 'Content Structure',
            severity: 'Warning',
            issue: 'Multiple H1 headings found',
            location: `Found ${h1s.length} <h1> tags`,
            recommendation: 'Using multiple H1s is not strictly prohibited, but one concise H1 is heavily favored for SEO.',
            code_example: 'Change secondary headings to <h2>'
        });
    }

    // Advanced Heading Checks
    let previousLevel = 0;
    const headingElements = $('h1, h2, h3, h4, h5, h6');
    
    headingElements.each((_, el) => {
        const level = parseInt(el.tagName.replace('h', ''), 10);
        const text = $(el).text().trim();

        // Empty heading
        if (!text) {
            issues.push({
                category: 'Content Structure',
                severity: 'Warning',
                issue: `Empty <h${level}> tag found`,
                location: `<h${level}>`,
                recommendation: 'Remove empty heading tags as they confuse screen readers and search engines.',
                code_example: 'Delete the empty tag'
            });
        }

        // Keyword stuffing / Too long
        if (text.length > 150) {
            issues.push({
                category: 'Content Structure',
                severity: 'Warning',
                issue: `Heading <h${level}> is too long (${text.length} chars)`,
                location: `<h${level}>${text.substring(0, 30)}...`,
                recommendation: 'Headings should be concise and outline the content, not contain full paragraphs.',
                code_example: 'Keep headings under 70-100 characters.'
            });
        }

        // Skipped heading levels (e.g. H1 -> H3)
        if (previousLevel > 0 && level - previousLevel > 1) {
            issues.push({
                category: 'Content Structure',
                severity: 'Warning',
                issue: `Skipped heading level (H${previousLevel} to H${level})`,
                location: `<h${level}>${text.substring(0, 30)}...`,
                recommendation: 'Heading levels should flow sequentially (H1 -> H2 -> H3) without skipping.',
                code_example: `Change <h${level}> to <h${previousLevel + 1}>`
            });
        }
        previousLevel = level;
    });

    // Image Alts
    let missingAlt = 0;
    $('img').each((_, el) => {
        const alt = $(el).attr('alt');
        const src = $(el).attr('src') || '';
        
        if (alt === undefined) {
            missingAlt++;
        } else if (alt.trim() === '') {
            // Empty alt text is okay for decorative images, but check if src looks informative
            if (!src.includes('spacer') && !src.includes('decorative') && !src.includes('bg')) {
                // If it's a real photo/graphic without alt text, we tally it as missing for this simplified check
                missingAlt++;
            }
        }
    });

    if (missingAlt > 0) {
        issues.push({
            category: 'Content Structure',
            severity: 'Warning',
            issue: `Images missing alt text (${missingAlt})`,
            location: '<img> tags without alt attributes',
            recommendation: 'Add alt attributes to all non-decorative images for accessibility and SEO image search.',
            code_example: '<img src="/image.jpg" alt="Descriptive text" />'
        });
    }

    return issues;
};
