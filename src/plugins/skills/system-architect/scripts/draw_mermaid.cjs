const fs = require('fs');

function generateMermaid(type, data) {
    if (type === 'c4') {
        return `C4Context\n  Boundary(b1, "System") {\n${data.map(item => `    System(${item.id}, "${item.name}", "${item.desc}")`).join('\n')}\n  }`;
    }
    return `graph TD\n${data.map(item => `  ${item.from} --> ${item.to}`).join('\n')}`;
}

const [,, type, dataPath] = process.argv;
if (!type || !dataPath) {
    console.error("Usage: node draw_mermaid.cjs <type> <json_data_path>");
    process.exit(1);
}

try {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    console.log(generateMermaid(type, data));
} catch (err) {
    console.error(`Error processing file ${dataPath}: ${err.message}`);
    process.exit(1);
}
