const axios = require('axios');
const { chromium } = require('playwright');
const TurndownService = require('turndown');

const TIMEOUT_MS = 15000;
const RENDER_TIMEOUT_MS = 20000;
const MAX_OUTPUT = 8000;
const MIN_STATIC_TEXT_CHARS = 500;
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
turndown.remove(['script', 'style', 'noscript', 'iframe', 'svg']);

const definition = {
    type: 'function',
    function: {
        name: 'web_fetch',
        description: '抓取網頁並回傳清理後的文字（HTML 轉 markdown）。用於研究、讀取文章、查資料。回傳上限 8000 字元，超過截斷。',
        parameters: {
            type: 'object',
            properties: {
                url: { type: 'string', description: '完整 URL，必須含 http/https' },
                render: {
                    type: 'string',
                    enum: ['auto', 'static', 'browser'],
                    description: '渲染模式。auto 會先抓靜態 HTML，疑似 SPA 空殼時改用瀏覽器；static 只抓 HTML；browser 強制用瀏覽器渲染。',
                },
            },
            required: ['url'],
        },
    },
};

function validateUrl(url) {
    try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return { ok: false, reason: 'URL 必須使用 http 或 https' };
        }
        return { ok: true, url: parsed.toString() };
    } catch {
        return { ok: false, reason: 'URL 格式錯誤' };
    }
}

function htmlToMarkdown(html) {
    let text = turndown.turndown(html).trim();
    text = text.replace(/\n{3,}/g, '\n\n');
    return text;
}

function truncate(text) {
    return text.length > MAX_OUTPUT
        ? text.slice(0, MAX_OUTPUT) + '\n...(已截斷)'
        : text;
}

function looksLikeSpaShell(html, text) {
    const compactText = text.replace(/\s+/g, ' ').trim();
    if (compactText.length >= MIN_STATIC_TEXT_CHARS) return false;

    const hasAppRoot = /<div[^>]+id=["']?(app|root|__next|nuxt|svelte)["']?/i.test(html);
    const scriptCount = (html.match(/<script\b/gi) || []).length;
    const hasBundleScript = /<script[^>]+src=["'][^"']*(bundle|chunk|app|main|index|runtime|vite|webpack|next|nuxt)[^"']*\.js/i.test(html);
    const hasHydrationState = /(__NEXT_DATA__|window\.__NUXT__|data-reactroot|ng-version|id=["']svelte)/i.test(html);
    const loadingOnly = /loading|please enable javascript|enable javascript|app works/i.test(compactText);

    return (hasAppRoot && scriptCount > 0) || hasBundleScript || hasHydrationState || loadingOnly;
}

async function fetchStatic(url) {
    const res = await axios.get(url, {
        timeout: TIMEOUT_MS,
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml' },
        maxRedirects: 5,
        responseType: 'text',
        transformResponse: [(d) => d],
    });
    const html = typeof res.data === 'string' ? res.data : String(res.data);
    return {
        status: res.status,
        html,
        text: htmlToMarkdown(html),
    };
}

async function fetchRendered(url) {
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({
            userAgent: USER_AGENT,
            viewport: { width: 1280, height: 900 },
        });
        page.setDefaultTimeout(RENDER_TIMEOUT_MS);
        const response = await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: RENDER_TIMEOUT_MS,
        });
        try {
            await page.waitForLoadState('networkidle', { timeout: 5000 });
        } catch {
            // Some SPAs keep long-polling connections open; DOM content is still useful.
        }
        const html = await page.content();
        const status = response ? response.status() : undefined;
        const text = htmlToMarkdown(html);
        return { status, text };
    } catch (err) {
        const needsInstall = /Executable doesn't exist|browserType.launch/i.test(err.message);
        const hint = needsInstall
            ? '（Playwright 瀏覽器尚未安裝，請執行 `npx playwright install chromium`）'
            : '';
        throw new Error(`${err.message}${hint}`);
    } finally {
        if (browser) await browser.close();
    }
}

async function run(url, options = {}) {
    const validation = validateUrl(url);
    if (!validation.ok) {
        return { ok: false, text: `抓取失敗：${validation.reason}` };
    }

    const render = ['auto', 'static', 'browser'].includes(options.render)
        ? options.render
        : 'auto';
    const normalizedUrl = validation.url;

    try {
        if (render === 'browser') {
            const rendered = await fetchRendered(normalizedUrl);
            return {
                ok: true,
                text: truncate(rendered.text),
                status: rendered.status,
                mode: 'browser',
            };
        }

        const page = await fetchStatic(normalizedUrl);
        if (render === 'static' || !looksLikeSpaShell(page.html, page.text)) {
            return {
                ok: true,
                text: truncate(page.text),
                status: page.status,
                mode: 'static',
            };
        }

        const rendered = await fetchRendered(normalizedUrl);
        const text = rendered.text || page.text;
        return {
            ok: true,
            text: truncate(text),
            status: rendered.status || page.status,
            mode: rendered.text ? 'browser' : 'static',
        };
    } catch (err) {
        const reason = err.response ? `HTTP ${err.response.status}` : err.message;
        return { ok: false, text: `抓取失敗：${reason}`, status: err.response?.status };
    }
}

module.exports = { definition, run };
