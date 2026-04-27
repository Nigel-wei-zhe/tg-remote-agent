const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const SESSION_ROOT = path.join(os.homedir(), '.lazyhole', 'sessions');
const ARCHIVE_FAILED_ROOT = path.join(SESSION_ROOT, 'archive_failed');

function getEnvInt(name, fallback) {
    const raw = Number(process.env[name]);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

const IDLE_TTL_MS = getEnvInt('SESSION_IDLE_TTL_MIN', 30) * 60 * 1000;
const COMPACT_TRIGGER_CHARS = getEnvInt('SESSION_COMPACT_TRIGGER_CHARS', 12000);

function ensureDir() {
    if (!fs.existsSync(SESSION_ROOT)) fs.mkdirSync(SESSION_ROOT, { recursive: true });
}

function pathFor(chatId) {
    const key = String(chatId);
    if (!/^-?\d+$/.test(key)) throw new Error(`invalid chatId: ${chatId}`);
    return path.join(SESSION_ROOT, `${key}.json`);
}

function readRaw(chatId) {
    const file = pathFor(chatId);
    if (!fs.existsSync(file)) return null;
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        fs.unlinkSync(file);
        return null;
    }
}

function writeRaw(chatId, session) {
    ensureDir();
    const file = pathFor(chatId);
    const payload = { ...session, updatedAt: new Date().toISOString() };
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2));
    fs.renameSync(tmp, file);
    return payload;
}

function isExpired(session) {
    const updatedAt = Date.parse(session?.updatedAt || '');
    return !updatedAt || Date.now() - updatedAt > IDLE_TTL_MS;
}

function initSession(chatId) {
    const now = new Date().toISOString();
    return {
        sessionId: crypto.randomUUID(),
        chatId: Number.isFinite(Number(chatId)) ? Number(chatId) : chatId,
        startedAt: now,
        activeSkill: null,
        history: [],
        locked: {},
    };
}

function normalizeSession(chatId, session) {
    const now = new Date().toISOString();
    return {
        sessionId: session.sessionId || crypto.randomUUID(),
        chatId: session.chatId ?? (Number.isFinite(Number(chatId)) ? Number(chatId) : chatId),
        startedAt: session.startedAt || session.createdAt || session.updatedAt || now,
        activeSkill: session.activeSkill || null,
        history: Array.isArray(session.history) ? session.history : [],
        locked: session.locked || {},
        updatedAt: session.updatedAt,
    };
}

function loadSession(chatId) {
    const raw = readRaw(chatId);
    if (!raw) return null;
    if (isExpired(raw)) {
        clearSession(chatId);
        return null;
    }
    return normalizeSession(chatId, raw);
}

function loadSessionAny(chatId) {
    const raw = readRaw(chatId);
    return raw ? normalizeSession(chatId, raw) : null;
}

function clearSession(chatId) {
    const file = pathFor(chatId);
    if (fs.existsSync(file)) fs.unlinkSync(file);
}

function preserveSession(chatId, reason) {
    const session = loadSessionAny(chatId);
    if (!session) return null;
    fs.mkdirSync(ARCHIVE_FAILED_ROOT, { recursive: true });
    const safeSessionId = String(session.sessionId || 'unknown').replace(/[^a-zA-Z0-9-]/g, '_');
    const file = path.join(ARCHIVE_FAILED_ROOT, `${new Date().toISOString().replace(/[:.]/g, '-')}-${chatId}-${safeSessionId}.json`);
    fs.writeFileSync(file, JSON.stringify({ reason, session }, null, 2));
    clearSession(chatId);
    return file;
}

function appendHistory(chatId, role, content) {
    if (!content) return null;
    const session = loadSession(chatId) || initSession(chatId);
    session.history = [
        ...session.history,
        { role, content: String(content), t: new Date().toISOString() },
    ];
    return writeRaw(chatId, session);
}

function markActiveSkill(chatId, name) {
    const session = loadSession(chatId) || initSession(chatId);
    session.activeSkill = name || null;
    return writeRaw(chatId, session);
}

function writeLocked(chatId, fields) {
    const session = loadSession(chatId) || initSession(chatId);
    session.locked = { ...(session.locked || {}), ...(fields || {}) };
    return writeRaw(chatId, session);
}

function compactSession(chatId, summary) {
    const session = loadSession(chatId) || initSession(chatId);
    session.locked = { ...(session.locked || {}), summary: String(summary || '').trim() };
    session.history = [];
    return writeRaw(chatId, session);
}

module.exports = {
    SESSION_ROOT,
    ARCHIVE_FAILED_ROOT,
    IDLE_TTL_MS,
    COMPACT_TRIGGER_CHARS,
    isExpired,
    loadSession,
    loadSessionAny,
    clearSession,
    preserveSession,
    appendHistory,
    markActiveSkill,
    writeLocked,
    compactSession,
};
