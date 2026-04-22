const axios = require('axios');
const { logOp } = require('../../utils/logger');

const ENDPOINT = 'https://api.minimax.io/v1/text/chatcompletion_v2';
const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_RETRY_ATTEMPTS = 4;
const DEFAULT_RETRY_BASE_MS = 1500;
const DEFAULT_RETRY_MAX_MS = 12000;

function getEnvInt(name, fallback) {
    const raw = Number(process.env[name]);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

function getRetryConfig() {
    return {
        maxAttempts: getEnvInt('MINIMAX_RETRY_MAX_ATTEMPTS', DEFAULT_RETRY_ATTEMPTS),
        baseDelayMs: getEnvInt('MINIMAX_RETRY_BASE_MS', DEFAULT_RETRY_BASE_MS),
        maxDelayMs: getEnvInt('MINIMAX_RETRY_MAX_MS', DEFAULT_RETRY_MAX_MS),
    };
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function createMiniMaxError(message, extra = {}) {
    const err = new Error(message || 'MiniMax 回傳錯誤');
    Object.assign(err, extra);
    return err;
}

function normalizeMiniMaxError(err) {
    if (!err) return createMiniMaxError('MiniMax 請求失敗');
    if (err.isMiniMaxError) return err;

    const statusCode = Number(err.response?.status || err.statusCode || 0) || undefined;
    const data = err.response?.data;
    const message = typeof data?.base_resp?.status_msg === 'string'
        ? data.base_resp.status_msg
        : typeof data?.message === 'string'
            ? data.message
            : err.message || 'MiniMax 請求失敗';

    return createMiniMaxError(message, {
        isMiniMaxError: true,
        statusCode,
        retryable: isRetryableMiniMaxError({ statusCode, message, code: err.code }),
        code: err.code,
        partial: Boolean(err.partial),
    });
}

function isRetryableMiniMaxError({ statusCode, message, code }) {
    const text = String(message || '').toLowerCase();
    return [429, 500, 502, 503, 504, 529].includes(Number(statusCode))
        || text.includes('high traffic detected')
        || text.includes('overloaded')
        || text.includes('rate limit')
        || text.includes('too many requests')
        || ['ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(code);
}

function getBackoffDelayMs(attempt, config) {
    const exponential = config.baseDelayMs * (2 ** (attempt - 1));
    const capped = Math.min(exponential, config.maxDelayMs);
    const jitter = Math.floor(Math.random() * 250);
    return capped + jitter;
}

async function withMiniMaxRetry(requestName, fn) {
    const config = getRetryConfig();

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
        try {
            return await fn(attempt, config);
        } catch (rawErr) {
            const err = normalizeMiniMaxError(rawErr);
            const canRetry = err.retryable && !err.partial && attempt < config.maxAttempts;
            if (!canRetry) throw err;

            const delayMs = getBackoffDelayMs(attempt, config);
            logOp('llm.retry', {
                provider: 'minimax',
                requestName,
                attempt,
                nextAttempt: attempt + 1,
                delayMs,
                reason: err.message,
                statusCode: err.statusCode,
            });
            await sleep(delayMs);
        }
    }
}

function buildPayload(model, messages, tools, toolChoice) {
    const payload = { model, messages };
    if (tools && tools.length) {
        payload.tools = tools;
        payload.tool_choice = toolChoice || 'auto';
    } else if (toolChoice) {
        payload.tool_choice = toolChoice;
    }
    return payload;
}

async function chat({ messages, tools, toolChoice }) {
    const apiKey = process.env.MINIMAX_API_KEY;
    const model = process.env.MINIMAX_MODEL || 'MiniMax-M2.7';
    const payload = buildPayload(model, messages, tools, toolChoice);

    logOp('llm.request', { provider: 'minimax', model, payload });

    const response = await withMiniMaxRetry('chat', async () => axios.post(ENDPOINT, payload, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        timeout: DEFAULT_TIMEOUT_MS,
    }));

    logOp('llm.response', { provider: 'minimax', data: response.data });

    const choice = response.data.choices?.[0];
    if (!choice) throw createMiniMaxError('API 未回傳任何結果。', { isMiniMaxError: true });
    return choice.message;
}

function readStreamMessage(response, onToken) {
    return new Promise((resolve, reject) => {
        let buf = '';
        let fullContent = '';
        let hasPartialOutput = false;
        const tcMap = {};

        response.data.on('data', (chunk) => {
            buf += chunk.toString();
            const lines = buf.split('\n');
            buf = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const raw = line.slice(6).trim();
                if (raw === '[DONE]') continue;
                let parsed;
                try { parsed = JSON.parse(raw); } catch { continue; }

                if (parsed.type === 'error') {
                    return reject(createMiniMaxError(parsed.error?.message || 'MiniMax 回傳錯誤', {
                        isMiniMaxError: true,
                        statusCode: Number(parsed.error?.http_code || 0) || undefined,
                        retryable: isRetryableMiniMaxError({
                            statusCode: Number(parsed.error?.http_code || 0) || undefined,
                            message: parsed.error?.message,
                        }),
                        partial: hasPartialOutput,
                    }));
                }

                const delta = parsed.choices?.[0]?.delta;
                if (!delta) continue;

                if (delta.content) {
                    fullContent += delta.content;
                    hasPartialOutput = true;
                    onToken(delta.content);
                }

                if (delta.tool_calls) {
                    hasPartialOutput = true;
                    for (const tc of delta.tool_calls) {
                        const i = tc.index ?? 0;
                        if (!tcMap[i]) tcMap[i] = { id: '', type: 'function', function: { name: '', arguments: '' } };
                        if (tc.id) tcMap[i].id = tc.id;
                        if (tc.function?.name) tcMap[i].function.name += tc.function.name;
                        if (tc.function?.arguments) tcMap[i].function.arguments += tc.function.arguments;
                    }
                }
            }
        });

        response.data.on('end', () => {
            const tool_calls = Object.values(tcMap);
            const msg = { role: 'assistant', content: fullContent };
            if (tool_calls.length > 0) msg.tool_calls = tool_calls;
            logOp('llm.response', { provider: 'minimax', stream: true, contentLength: fullContent.length, toolCalls: tool_calls.length });
            resolve(msg);
        });

        response.data.on('error', (streamErr) => reject(normalizeMiniMaxError(streamErr)));
    });
}

async function openStream(apiKey, payload) {
    return axios.post(ENDPOINT, payload, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        responseType: 'stream',
        timeout: DEFAULT_TIMEOUT_MS,
    });
}

async function chatStream({ messages, tools, toolChoice }, onToken) {
    const apiKey = process.env.MINIMAX_API_KEY;
    const model = process.env.MINIMAX_MODEL || 'MiniMax-M2.7';
    const payload = { ...buildPayload(model, messages, tools, toolChoice), stream: true };

    logOp('llm.request', { provider: 'minimax', model, stream: true });

    return withMiniMaxRetry('chatStream', async () => {
        const response = await openStream(apiKey, payload);
        return readStreamMessage(response, onToken);
    });
}

module.exports = { chat, chatStream };
