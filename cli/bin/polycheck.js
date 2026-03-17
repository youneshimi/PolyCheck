#!/usr/bin/env node

import { Command } from 'commander';
import { handleAnalyze } from '../src/commands/analyze.js';
import { handleReviewsList } from '../src/commands/reviewsList.js';
import { handleReviewsShow } from '../src/commands/reviewsShow.js';

const program = new Command();

program
    .name('polycheck')
    .version('1.0.0')
    .description('PolyCheck CLI — Analyseur de code IA multi-langages')
    .option('--api-url <url>', 'URL du backend PolyCheck', process.env.POLYCHECK_API_URL || 'http://localhost:3001');

// ── Commande : analyze ───────────────────────────────────────────────────────

program
    .command('analyze [file]')
    .description('Analyser un fichier de code source')
    .option('--stdin', 'Lire le code depuis stdin (pipe)')
    .option('-l, --language <lang>', 'Forcer le langage (python, javascript, typescript, java, go, rust, c, cpp)')
    .action((file, opts) => {
        const globalOpts = program.opts();
        handleAnalyze(file, { ...opts, apiUrl: globalOpts.apiUrl });
    });

// ── Commande : reviews ───────────────────────────────────────────────────────

const reviews = program
    .command('reviews')
    .description('Gérer les analyses passées');

reviews
    .command('list')
    .description('Lister les analyses enregistrées')
    .option('-p, --page <n>', 'Numéro de page', '1')
    .option('-n, --limit <n>', 'Nombre de résultats par page', '20')
    .action((opts) => {
        const globalOpts = program.opts();
        handleReviewsList({ ...opts, parent: { opts: () => globalOpts } });
    });

reviews
    .command('show <id>')
    .description('Afficher le détail d\'une analyse')
    .action((id, opts) => {
        const globalOpts = program.opts();
        handleReviewsShow(id, { ...opts, parent: { opts: () => globalOpts } });
    });

// ── Parse ────────────────────────────────────────────────────────────────────

program.parse(process.argv);
