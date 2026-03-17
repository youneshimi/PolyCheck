import fs from 'node:fs/promises';
import path from 'node:path';
import ora from 'ora';
import chalk from 'chalk';
import { ApiClient } from '../api/client.js';
import { detectLanguage, SUPPORTED_LANGUAGES } from '../utils/languageDetect.js';
import { readStdin } from '../utils/stdin.js';
import { formatAnalysisResult } from '../utils/formatter.js';

/**
 * Handler de la commande `polycheck analyze <file>`
 * @param {string|undefined} fileArg - Chemin du fichier (optionnel si --stdin)
 * @param {object} options
 */
export async function handleAnalyze(fileArg, options) {
    const apiUrl = options.apiUrl || process.env.POLYCHECK_API_URL || 'http://localhost:3001';
    const client = new ApiClient(apiUrl);

    let code;
    let filename = fileArg || null;

    // ── 1. Lire le code ──────────────────────────────────────────────────────
    if (options.stdin) {
        try {
            code = await readStdin();
        } catch (err) {
            console.error(chalk.red(`✗ ${err.message}`));
            process.exit(1);
        }

        if (!code.trim()) {
            console.error(chalk.red('✗ Aucun code reçu sur stdin.'));
            process.exit(1);
        }
    } else {
        if (!fileArg) {
            console.error(chalk.red('✗ Veuillez spécifier un fichier ou utiliser --stdin.'));
            console.error(chalk.dim('  Usage : polycheck analyze <fichier>'));
            console.error(chalk.dim('          cat file.py | polycheck analyze --stdin'));
            process.exit(1);
        }

        const filePath = path.resolve(fileArg);
        try {
            code = await fs.readFile(filePath, 'utf8');
        } catch (err) {
            if (err.code === 'ENOENT') {
                console.error(chalk.red(`✗ Fichier introuvable : ${filePath}`));
            } else if (err.code === 'EISDIR') {
                console.error(chalk.red(`✗ "${filePath}" est un dossier, pas un fichier.`));
            } else {
                console.error(chalk.red(`✗ Impossible de lire le fichier : ${err.message}`));
            }
            process.exit(1);
        }

        filename = path.basename(filePath);
    }

    // ── 2. Détecter le langage ───────────────────────────────────────────────
    let language = options.language || null;

    if (!language && filename) {
        language = detectLanguage(filename);
    }

    if (!language) {
        console.error(chalk.red('✗ Impossible de détecter le langage.'));
        console.error(chalk.dim(`  Utilisez --language <lang> parmi : ${SUPPORTED_LANGUAGES.join(', ')}`));
        process.exit(1);
    }

    if (!SUPPORTED_LANGUAGES.includes(language)) {
        console.error(chalk.red(`✗ Langage non supporté : "${language}"`));
        console.error(chalk.dim(`  Langages supportés : ${SUPPORTED_LANGUAGES.join(', ')}`));
        process.exit(1);
    }

    // ── 3. Lancer l'analyse ──────────────────────────────────────────────────
    const spinner = ora({
        text: `Analyse en cours (${language})…`,
        spinner: 'dots',
    }).start();

    try {
        const result = await client.analyze(code, language, filename);
        spinner.succeed('Analyse terminée.');
        console.log(formatAnalysisResult(result));
    } catch (err) {
        spinner.fail('Échec de l\'analyse.');
        console.error(chalk.red(`\n  ${err.message}`));
        process.exit(1);
    }
}
