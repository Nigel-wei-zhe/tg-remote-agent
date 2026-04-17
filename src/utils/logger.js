const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../../log');
const ERR_DIR = path.join(ROOT, 'error');
const OP_DIR = path.join(ROOT, 'operation');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

function logError(context, message) {
    ensureDir(ERR_DIR);
    const file = path.join(ERR_DIR, `${today()}.log`);
    const line = `[${new Date().toLocaleTimeString()}] [${context}] ${message}\n`;
    fs.appendFileSync(file, line);
}

function logOp(event, data) {
    ensureDir(OP_DIR);
    const file = path.join(OP_DIR, `${today()}.log`);
    const record = { ts: new Date().toISOString(), event, ...data };
    fs.appendFileSync(file, JSON.stringify(record) + '\n');
}

module.exports = { logError, logOp };
