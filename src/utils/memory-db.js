const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const MEMORY_DB_PATH = process.env.MEMORY_DB_PATH || path.join(os.homedir(), '.lazyhole', 'memory.sqlite');
const SQLITE_BIN = process.env.SQLITE_BIN || 'sqlite3';

function ensureDb() {
    fs.mkdirSync(path.dirname(MEMORY_DB_PATH), { recursive: true });
    execSql(`
CREATE TABLE IF NOT EXISTS memory_archives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  user_id TEXT,
  started_at TEXT,
  ended_at TEXT NOT NULL,
  archived_at TEXT NOT NULL,
  trigger TEXT NOT NULL,
  active_skill TEXT,
  category TEXT,
  summary TEXT NOT NULL,
  raw_chars INTEGER NOT NULL,
  history_count INTEGER NOT NULL,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_memory_archives_chat_archived
  ON memory_archives(chat_id, archived_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_archives_session
  ON memory_archives(session_id);
`);
}

function execSql(sql, args = []) {
    return execFileSync(SQLITE_BIN, [...args, MEMORY_DB_PATH], {
        input: sql,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 4,
    });
}

function queryJson(sql) {
    ensureDb();
    const out = execSql(sql, ['-json']);
    return out.trim() ? JSON.parse(out) : [];
}

function quote(value) {
    if (value === null || value === undefined) return 'NULL';
    return `'${String(value).replace(/'/g, "''")}'`;
}

function number(value) {
    const n = Number(value);
    return Number.isFinite(n) ? String(Math.trunc(n)) : '0';
}

function insertArchive(row) {
    ensureDb();
    const sql = `
INSERT INTO memory_archives (
  session_id, chat_id, user_id, started_at, ended_at, archived_at, trigger,
  active_skill, category, summary, raw_chars, history_count, metadata_json
) VALUES (
  ${quote(row.sessionId)}, ${quote(row.chatId)}, ${quote(row.userId)},
  ${quote(row.startedAt)}, ${quote(row.endedAt)}, ${quote(row.archivedAt)},
  ${quote(row.trigger)}, ${quote(row.activeSkill)}, ${quote(row.category)},
  ${quote(row.summary)}, ${number(row.rawChars)}, ${number(row.historyCount)},
  ${quote(row.metadataJson)}
);
SELECT last_insert_rowid() AS id;
`;
    const result = queryJson(sql);
    return result[0]?.id;
}

function listArchives(chatId, limit = 10) {
    return queryJson(`
SELECT id, session_id AS sessionId, chat_id AS chatId, archived_at AS archivedAt,
       trigger, active_skill AS activeSkill, category, summary, raw_chars AS rawChars,
       history_count AS historyCount
FROM memory_archives
WHERE chat_id = ${quote(chatId)}
ORDER BY archived_at DESC
LIMIT ${number(limit)};
`);
}

function getArchive(chatId, id) {
    const rows = queryJson(`
SELECT id, session_id AS sessionId, chat_id AS chatId, user_id AS userId,
       started_at AS startedAt, ended_at AS endedAt, archived_at AS archivedAt,
       trigger, active_skill AS activeSkill, category, summary,
       raw_chars AS rawChars, history_count AS historyCount, metadata_json AS metadataJson
FROM memory_archives
WHERE chat_id = ${quote(chatId)} AND id = ${number(id)}
LIMIT 1;
`);
    return rows[0] || null;
}

function searchArchives(chatId, term, limit = 10) {
    const escaped = String(term || '').replace(/[\\%_]/g, (m) => `\\${m}`);
    return queryJson(`
SELECT id, session_id AS sessionId, chat_id AS chatId, archived_at AS archivedAt,
       trigger, active_skill AS activeSkill, category, summary, raw_chars AS rawChars,
       history_count AS historyCount
FROM memory_archives
WHERE chat_id = ${quote(chatId)}
  AND summary LIKE ${quote(`%${escaped}%`)} ESCAPE '\\'
ORDER BY archived_at DESC
LIMIT ${number(limit)};
`);
}

module.exports = {
    MEMORY_DB_PATH,
    ensureDb,
    insertArchive,
    listArchives,
    getArchive,
    searchArchives,
};
