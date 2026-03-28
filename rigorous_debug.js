const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const path = require('path');

// Mocking the checkMetaTags logic since I can't easily import TS into a node one-liner
function checkMetaTags($, html) {
    const issues = [];
    const lang = $('html').attr('lang') || $('html').attr('xml:lang') || $('body').attr('lang');
    if (!lang) issues.push({ issue: 'Missing lang' });

    const charset = $('meta[charset]').attr('charset') || 
                   $('meta[http-equiv="Content-Type" i]').attr('content')?.split('charset=')[1];
    if (!charset) issues.push({ issue: 'Missing charset' });

    const titleRaw = $('title').text() || '';
    const title = titleRaw.trim();
    if (!title) issues.push({ issue: 'Missing title' });

    const descriptionTag = $('meta[name="description" i]').attr('content') || $('meta[name="Description" i]').attr('content') || '';
    const description = descriptionTag.trim();
    if (!description) issues.push({ issue: 'Missing description' });

    return { title, description, issues };
}

async function run() {
    const url = 'https://wastetak.com/job/senior-digital-marketing-qw20';
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.goto(url, { waitUntil: 'networkidle2' });
    const html = await page.content();
    const $ = cheerio.load(html);
    
    const results = checkMetaTags($, html);
    console.log('Audit Results:', JSON.stringify(results, null, 2));
    await browser.close();
}

run();
