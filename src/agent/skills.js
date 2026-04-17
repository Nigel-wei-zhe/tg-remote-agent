const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '../../skills');

let cache = null;

function parseFrontmatter(text) {
    const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) return { meta: {}, body: text };
    const meta = {};
    for (const line of match[1].split('\n')) {
        const kv = line.match(/^([\w-]+):\s*(.*)$/);
        if (kv) meta[kv[1]] = kv[2].trim();
    }
    return { meta, body: match[2] };
}

function load() {
    if (cache) return cache;
    const result = [];
    if (fs.existsSync(SKILLS_DIR)) {
        for (const entry of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const file = path.join(SKILLS_DIR, entry.name, 'SKILL.md');
            if (!fs.existsSync(file)) continue;
            const text = fs.readFileSync(file, 'utf8');
            const { meta, body } = parseFrontmatter(text);
            result.push({
                name: meta.name || entry.name,
                description: meta.description || '',
                body,
            });
        }
    }
    cache = result;
    return cache;
}

function get(name) {
    return load().find((s) => s.name === name);
}

function indexText() {
    const skills = load();
    if (skills.length === 0) return '';
    const lines = skills.map((s) => `- ${s.name}: ${s.description}`).join('\n');
    return `\n\nAvailable skills (use read_skill to load full details before acting):\n${lines}`;
}

module.exports = { load, get, indexText };
