const puppeteer = require('puppeteer');
const fs = require('fs');

async function run() {
    const url = 'https://wastetak.com/job/senior-digital-marketing-qw20';
    console.log(`Deep Audit Diagnosis: ${url}`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        
        console.log('Navigating...');
        const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
        
        console.log('Status Code:', response.status());
        console.log('Final URL:', page.url());
        
        const html = await page.content();
        fs.writeFileSync('/media/WEBDEV/SEO-TOOL-PROJECT/backend/debug_dump.html', html);
        await page.screenshot({ path: '/media/WEBDEV/SEO-TOOL-PROJECT/backend/debug_screenshot.png' });
        
        console.log('Capture complete. HTML size:', html.length);
        
        const cheerio = require('cheerio');
        const $ = cheerio.load(html);
        console.log('Cheerio - Lang:', $('html').attr('lang'));
        console.log('Cheerio - Charset:', $('meta[charset]').attr('charset'));
        console.log('Cheerio - Title:', $('title').text());
        console.log('Cheerio - Description:', $('meta[name="description" i]').attr('content'));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await browser.close();
    }
}

run();
