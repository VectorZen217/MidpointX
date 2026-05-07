const fs = require('fs');
const path = require('path');

const [,, pattern, projectRoot] = process.argv;
const memDir = path.join(projectRoot, '.architect', 'memory');
const memFile = path.join(memDir, 'SIGNALS.json');

if (!fs.existsSync(memDir)) fs.mkdirSync(memDir, { recursive: true });

let memory = [];
if (fs.existsSync(memFile)) {
    try {
        memory = JSON.parse(fs.readFileSync(memFile, 'utf8'));
    } catch (e) {
        console.error("Error reading existing memory file:", e.message);
    }
}

memory.push({
    timestamp: new Date().toISOString(),
    pattern: pattern,
    approved: true
});

fs.writeFileSync(memFile, JSON.stringify(memory, null, 2));
console.log(`Pattern logged to ${memFile}`);
