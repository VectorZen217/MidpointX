const fs = require('fs');
const path = require('path');

const [,, preference, projectRoot] = process.argv;
if (!preference || !projectRoot) {
    console.error("Usage: node log_insights.cjs <preference> <projectRoot>");
    process.exit(1);
}

const memDir = path.join(projectRoot, '.datalab', 'memory');
const memFile = path.join(memDir, 'PREFERENCES.json');

if (!fs.existsSync(memDir)) fs.mkdirSync(memDir, { recursive: true });

let memory = [];
if (fs.existsSync(memFile)) {
    try {
        memory = JSON.parse(fs.readFileSync(memFile, 'utf8'));
    } catch (e) {
        console.error("Error reading preference file:", e.message);
    }
}

memory.push({
    timestamp: new Date().toISOString(),
    preference: preference
});

fs.writeFileSync(memFile, JSON.stringify(memory, null, 2));
console.log(`Preference logged to ${memFile}`);
