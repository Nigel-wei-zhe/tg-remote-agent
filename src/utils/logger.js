const fs = require('fs');
const path = require('path');

function logError(context, message) {
    const logDir = path.join(__dirname, '../../log');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
    const date = new Date().toISOString().slice(0, 10);
    const file = path.join(logDir, `${date}.log`);
    const line = `[${new Date().toLocaleTimeString()}] [${context}] ${message}\n`;
    fs.appendFileSync(file, line);
}

module.exports = { logError };
