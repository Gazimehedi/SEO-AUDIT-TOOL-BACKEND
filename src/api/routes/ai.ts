import { Router } from 'express';
import { prisma } from '../../config/db';
import Groq from 'groq-sdk';
import { authMiddleware, optionalAuthMiddleware, AuthRequest } from '../../middleware/auth';

export const aiRouter = Router();

// Initialize Groq (requires GROQ_API_KEY in process.env)
// This global initialization is now redundant as it's re-initialized per request.
// Keeping it commented out or removed is an option, but for now, it's left as is
// but will be shadowed by the local initialization.
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || 'dummy_key' });

aiRouter.post('/analyze/:jobId', optionalAuthMiddleware, async (req: AuthRequest, res) => {
    const jobId = req.params.jobId as string;
    console.log('AI Analysis requested for jobId:', jobId);
    console.log('GROQ_API_KEY present:', !!process.env.GROQ_API_KEY);

    try {
        // Re-initialize with latest env to be safe
        const currentGroq = new Groq({ apiKey: process.env.GROQ_API_KEY || 'dummy_key' });
        const audit = await prisma.audit.findUnique({ where: { id: jobId } });
        if (!audit) return res.status(404).json({ error: 'Audit not found' });
        
        const force = req.query.force === 'true';

        // If it already has a REAL AI summary, return it to save tokens (unless forced)
        // If it's a mock summary but we now have a key, proceed to generate a real one.
        const existingSummary = (audit as any).aiSummary;
        const reflectsMock = existingSummary && 
            typeof existingSummary.executiveSummary === 'string' && 
            existingSummary.executiveSummary.includes('mock');

        if (!force && existingSummary && (!reflectsMock || !process.env.GROQ_API_KEY)) {
            return res.json(existingSummary);
        }

        if (!process.env.GROQ_API_KEY) {
            // Mock response if no key is present for development
            const mockResponse = {
                executiveSummary: "This is a mock AI summary. To get real insights, please set GROQ_API_KEY in your backend .env file.",
                topPriorities: ["Fix missing H1 tags on key product pages.", "Improve overall mobile page speed."],
                quickWins: ["Add meta descriptions to the 5 top-level pages.", "Ensure robots.txt allows crawling."],
                estimatedImpact: "High"
            };
            await prisma.audit.update({ where: { id: jobId }, data: { aiSummary: mockResponse } as any });
            return res.json(mockResponse);
        }

        const issues = audit.results ? (audit.results as any).issues : [];
        const domain = (audit.results as any).url || audit.url;
        const score = audit.score || 0;
        const results = (audit.results as any) || {};
        const siteTitle = results.title || 'Unknown';
        const siteDesc = results.description || 'No description found';
        const pagesCrawled = (audit as any).progress?.crawled || 0;

        const prompt = `You are an elite SEO Strategist and Technical Director. You are reviewing a comprehensive SEO audit for: ${domain}.
Context:
- Site Title: ${siteTitle}
- Site Description: ${siteDesc}
- Overall SEO Score: ${score}/100
- Performance/Core Web Vitals: ${results.performanceScore || 'N/A'}/100
- Total Pages Crawled: ${pagesCrawled}

Raw Issues Detected:
${JSON.stringify({ issues }, null, 2)}

Your Task:
Provide a deep, professional analysis. Do not be generic. Mention specific technical strengths or catastrophic failures found in the data.

1. Executive Summary: 3-4 sentences. Start with a data-backed verdict on the current state. Identify the most significant bottleneck (e.g., "The site suffers from severe indexation issues due to...")
2. Top Priorities: 3-4 critical, high-impact technical or structural fixes. Be specific about WHAT to fix and WHY it matters for rankings.
3. Quick Wins: 3-4 low-effort, high-impact items (e.g., fixing meta lengths, H1 usage, etc.).
4. Estimated Impact: Provide a professional judgment (Low, Medium, or High) based on the current score and issues.

Constraints:
- Response MUST be a strictly valid JSON object.
- DO NOT use markdown, bolding (**), or backticks in the string values.
- Focus on ROI and business impact.

Output Structure:
{
  "executiveSummary": "string",
  "topPriorities": ["string", "string", "string"],
  "quickWins": ["string", "string", "string"],
  "estimatedImpact": "Low|Medium|High"
}`;

        const chatCompletion = await currentGroq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.2,
            response_format: { type: "json_object" }
        });

        const jsonResponse = chatCompletion.choices[0]?.message?.content || '{}';
        const parsedResponse = JSON.parse(jsonResponse);

        // Save to DB
        await prisma.audit.update({
            where: { id: jobId },
            data: { aiSummary: parsedResponse } as any
        });

        return res.json(parsedResponse);

    } catch (err: any) {
        console.error('Groq AI Analysis Error:', err);
        return res.status(500).json({ error: 'Failed to generate AI analysis', details: err.message });
    }
});

aiRouter.post('/suggest-meta/:jobId', optionalAuthMiddleware, async (req: AuthRequest, res) => {
    const jobId = req.params.jobId as string;
    const { pageUrl, currentTitle, currentDescription } = req.body;

    try {
        const audit = await prisma.audit.findUnique({ where: { id: jobId } });
        if (!audit) return res.status(404).json({ error: 'Audit not found' });

        const siteTitle = (audit.results as any)?.title || '';
        
        const prompt = `You are an expert SEO Copywriter. Suggest an optimized SEO Title and Meta Description for a specific page on this website.
Website Main Title: ${siteTitle}
Target Page URL: ${pageUrl}
Current Page Title: ${currentTitle || 'None'}
Current Meta Description: ${currentDescription || 'None'}

Requirements:
1. Title: Max 60 characters, catchy, includes primary keywords.
2. Description: 150-160 characters, includes a call to action, summarizes the page benefit.
3. Matching the brand tone of the website.

Format your response as a strictly valid JSON object ONLY:
{
  "suggestedTitle": "string",
  "suggestedDescription": "string",
  "explanation": "short sentence why these are better"
}`;

        const currentGroq = new Groq({ apiKey: process.env.GROQ_API_KEY || 'dummy_key' });
        const chatCompletion = await currentGroq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.7,
            response_format: { type: "json_object" }
        });

        const jsonResponse = chatCompletion.choices[0]?.message?.content || '{}';
        return res.json(JSON.parse(jsonResponse));

    } catch (err: any) {
        console.error('Groq AI Meta-Suggest Error:', err);
        return res.status(500).json({ error: 'Failed to generate meta suggestions', details: err.message });
    }
});

aiRouter.post('/chat/:jobId', optionalAuthMiddleware, async (req: AuthRequest, res) => {
    const jobId = req.params.jobId as string;
    const { message, history = [] } = req.body;

    try {
        const audit = await prisma.audit.findUnique({ where: { id: jobId } });
        if (!audit) return res.status(404).json({ error: 'Audit not found' });

        const results = (audit.results as any) || {};
        const score = audit.score || 0;
        const aiSummary = (audit as any).aiSummary || {};
        const issues = results.issues || [];

        const systemPrompt = `You are a world-class SEO Consultant Chatbot. You have access to the full audit data for the website: ${results.url || audit.url}.

Current Site Context:
- Overall SEO Score: ${score}/100
- Performance Score: ${results.performanceScore || 'N/A'}/100
- AI Executive Summary: ${aiSummary.executiveSummary || 'Not generated yet'}
- Top Priorities: ${aiSummary.topPriorities?.join(', ') || 'Not generated yet'}
- Specific Issues Count: ${issues.length} critical/warning items.

Your Role:
1. Answer user questions about this specific audit precisely.
2. Explain technical terms (canonical, robots, CLS, etc.) in simple but professional language.
3. Suggest specific steps to improve the score based ONLY on the found issues.
4. If a user asks something unrelated to SEO or this site, politely redirect them back to the audit.
5. Be concise, actionable, and encouraging.

Rules:
- NEVER make up data not found in the audit.
- Use bullet points for lists.
- Maintain a helpful, consultant-like tone.`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.slice(-6), // Keep last 6 messages for context
            { role: 'user', content: message }
        ];

        const currentGroq = new Groq({ apiKey: process.env.GROQ_API_KEY || 'dummy_key' });
        const chatCompletion = await currentGroq.chat.completions.create({
            messages: messages as any,
            model: 'llama-3.3-70b-versatile',
            temperature: 0.7,
            max_tokens: 1024
        });

        const responseText = chatCompletion.choices[0]?.message?.content || "I'm sorry, I couldn't process that request.";
        return res.json({ message: responseText });

    } catch (err: any) {
        console.error('Groq AI Chat Error:', err);
        return res.status(500).json({ error: 'Failed to carry out chat', details: err.message });
    }
});

aiRouter.post('/optimize-content/:jobId', optionalAuthMiddleware, async (req: AuthRequest, res) => {
    const jobId = req.params.jobId as string;
    const { pageUrl } = req.body;

    try {
        const audit = await prisma.audit.findUnique({ where: { id: jobId } });
        if (!audit) return res.status(404).json({ error: 'Audit not found' });

        const results = (audit.results as any) || {};
        const meta = results.pageMetadata?.[pageUrl] || {};

        if (!meta.contentSample) {
            return res.status(400).json({ error: 'No content sample found for this page. Please run a new audit to capture content context.' });
        }
        
        const prompt = `You are a high-end SEO Content Architect. Optimize the content strategy for this page:
Page URL: ${pageUrl}
Website Core Topic: ${results.title}
Current H1: ${meta.h1 || 'None'}
Current H2s: ${meta.h2s?.join(', ') || 'None'}
Word Count: ${meta.wordCount}
Content Sample: ${meta.contentSample}...

Your Task:
Provide a data-driven content optimization plan.

1. Improved H1: A catchy, keyword-rich header.
2. Optimized Intro: A 100-word engaging introduction that hooks the reader and includes primary keywords.
3. Content Gap Expansion: Identify 3 specific sub-topics or "Semantic Keywords" to include to reach the 1000+ word goal and dominate search results.
4. Tone Adjustment: Briefly describe the ideal brand voice (e.g., "Professional & Authoritative").

Format your response as a strictly valid JSON object ONLY:
{
  "improvedH1": "string",
  "optimizedIntro": "string",
  "contentGaps": ["topic 1", "topic 2", "topic 3"],
  "recommendedTone": "string",
  "explanation": "why this will improve rankings"
}`;

        const currentGroq = new Groq({ apiKey: process.env.GROQ_API_KEY || 'dummy_key' });
        const chatCompletion = await currentGroq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.7,
            response_format: { type: "json_object" }
        });

        const jsonResponse = chatCompletion.choices[0]?.message?.content || '{}';
        return res.json(JSON.parse(jsonResponse));

    } catch (err: any) {
        console.error('Groq AI Content-Optimize Error:', err);
        return res.status(500).json({ error: 'Failed to generate content suggestions', details: err.message });
    }
});
