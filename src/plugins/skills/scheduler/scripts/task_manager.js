const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const command = args[0];

function runCommand(cmdArgs) {
    try {
        const result = spawnSync('schtasks', cmdArgs, { encoding: 'utf8', stdio: 'pipe' });
        if (result.error) {
            return `Error: ${result.error.message}`;
        }
        if (result.status !== 0) {
            return `Error: ${result.stderr || 'Command failed with status ' + result.status}`;
        }
        return result.stdout;
    } catch (error) {
        return `Error: ${error.message}`;
    }
}

switch (command) {
    case 'create': {
        const name = args[1];
        const taskCmd = args[2];
        const schedule = args[3] || 'DAILY'; // MINUTE, HOURLY, DAILY, WEEKLY, MONTHLY
        const startTime = args[4] || '12:00';
        
        console.log(`Creating task: ${name}`);
        const result = runCommand(['/create', '/tn', name, '/tr', taskCmd, '/sc', schedule, '/st', startTime, '/f']);
        console.log(result);
        break;
    }
    case 'list': {
        const name = args[1];
        const result = name 
            ? runCommand(['/query', '/tn', name, '/v', '/fo', 'list'])
            : runCommand(['/query', '/fo', 'table']);
        console.log(result);
        break;
    }
    case 'delete': {
        const name = args[1];
        const result = runCommand(['/delete', '/tn', name, '/f']);
        console.log(result);
        break;
    }
    case 'run': {
        const name = args[1];
        const result = runCommand(['/run', '/tn', name]);
        console.log(result);
        break;
    }
    default:
        console.log('Usage: task_manager.js <create|list|delete|run> [args...]');
}
