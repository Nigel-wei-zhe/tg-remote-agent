const fs = require('fs');
const os = require('os');
const path = require('path');

const SESSION_ROOT = path.join(os.homedir(), '.lazyhole', 'sessions');
const IDLE_TTL_MS = 30 * 60 * 1000;
const HISTORY_MAX = 6;
const CONTENT_MAX_CHARS = 500;

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
    return {
        chatId: Number.isFinite(Number(chatId)) ? Number(chatId) : chatId,
        activeSkill: null,
        history: [],
        locked: {},
    };
}

function loadSession(chatId) {
    const raw = readRaw(chatId);
    if (!raw) return null;
    if (isExpired(raw)) {
        clearSession(chatId);
        return null;
    }
    return raw;
}

function clearSession(chatId) {
    const file = pathFor(chatId);
    if (fs.existsSync(file)) fs.unlinkSync(file);
}

function truncate(text) {
    const s = String(text ?? '');
    return s.length > CONTENT_MAX_CHARS ? `${s.slice(0, CONTENT_MAX_CHARS)}…` : s;
}

function appendHistory(chatId, role, content) {
    if (!content) return null;
    const session = loadSession(chatId) || initSession(chatId);
    session.history = [
        ...session.history,
        { role, content: truncate(content), t: new Date().toISOString() },
    ].slice(-HISTORY_MAX);
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

module.exports = {
    SESSION_ROOT,
    IDLE_TTL_MS,
    HISTORY_MAX,
    CONTENT_MAX_CHARS,
    loadSession,
    clearSession,
    appendHistory,
    markActiveSkill,
    writeLocked,
};
