const readline = require('readline');
const { executeSELECTQuery, executeINSERTQuery, executeDELETEQuery } = require('./queryExecutor');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.setPrompt('SQL> ');
console.log('SQL Query Engine CLI. Enter your SQL commands, or type "exit" to quit.');

rl.prompt();

rl.on('line', async (line) => {
    if (line.toLowerCase() === 'exit') {
        rl.close();
        return;
    }

    try {
        const command = line.trim().split(' ')[0].toUpperCase();
        switch (command) {
            case 'SELECT':
                const selectResult = await executeSELECTQuery(line);
                console.log('Query Result:');
                console.log(selectResult);
                break;
            case 'INSERT':
                await executeINSERTQuery(line);
                console.log('Insertion successful.');
                break;
            case 'DELETE':
                await executeDELETEQuery(line);
                console.log('Deletion successful.');
                break;
            default:
                console.log('Unsupported command:', command);
                break;
        }
    }catch (error) {
        console.error('Error:', error.message);
    }

    rl.prompt();
}).on('close', () => {
    console.log('Exiting SQL CLI');
    process.exit(0);
});