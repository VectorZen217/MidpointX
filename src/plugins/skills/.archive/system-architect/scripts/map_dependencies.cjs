const fs = require('fs');
const path = require('path');

function scanDir(dir, filelist = []) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        if (fs.statSync(path.join(dir, file)).isDirectory()) {
            if (file !== 'node_modules' && file !== '.git') {
                scanDir(path.join(dir, file), filelist);
            }
        } else {
            filelist.push(path.join(dir, file));
        }
    });
    return filelist;
}

const root = process.argv[2] || '.';
const files = scanDir(root);
const imports = files.filter(f => f.endsWith('.js') || f.endsWith('.ts')).map(f => {
    const content = fs.readFileSync(f, 'utf8');
    const matches = content.match(/import .* from ['"](.*)['"]/g) || [];
    return { file: f, imports: matches };
});

console.log(JSON.stringify(imports, null, 2));