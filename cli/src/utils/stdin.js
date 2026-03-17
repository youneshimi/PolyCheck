/**
 * Lit tout le contenu depuis stdin.
 * @param {number} timeoutMs - Timeout en millisecondes (défaut: 30s)
 * @returns {Promise<string>}
 */
export function readStdin(timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        if (process.stdin.isTTY) {
            process.stderr.write('Lecture depuis stdin… (collez votre code puis appuyez sur Ctrl+D)\n');
        }

        let data = '';
        process.stdin.setEncoding('utf8');

        const timer = setTimeout(() => {
            process.stdin.destroy();
            reject(new Error('Timeout : aucune donnée reçue sur stdin.'));
        }, timeoutMs);

        process.stdin.on('data', (chunk) => {
            data += chunk;
        });

        process.stdin.on('end', () => {
            clearTimeout(timer);
            resolve(data);
        });

        process.stdin.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}
