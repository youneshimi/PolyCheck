import chalk from 'chalk';

// ── Couleurs par sévérité ────────────────────────────────────────────────────

const SEV_COLORS = {
    critical: chalk.red.bold,
    high:     chalk.hex('#ffb86c'),
    medium:   chalk.yellow,
    low:      chalk.green,
};

const CAT_COLORS = {
    security: chalk.red,
    bug:      chalk.hex('#ffb86c'),
    style:    chalk.cyan,
};

const CAT_ICONS = {
    security: '🔒',
    bug:      '🐛',
    style:    '🎨',
};

const dim = chalk.dim;
const bold = chalk.bold;
const divider = dim('─'.repeat(50));

// ── Helpers ──────────────────────────────────────────────────────────────────

function sevLabel(severity) {
    const fn = SEV_COLORS[severity] || chalk.white;
    return fn(severity.toUpperCase());
}

function catLabel(category) {
    const fn = CAT_COLORS[category] || chalk.white;
    const icon = CAT_ICONS[category] || '•';
    return `${icon} ${fn(category)}`;
}

function sevDot(sev, count) {
    const fn = SEV_COLORS[sev] || chalk.white;
    return fn(`● ${count} ${sev}`);
}

function catDot(cat, count) {
    const fn = CAT_COLORS[cat] || chalk.white;
    return fn(`● ${count} ${cat}`);
}

// ── Format : résultat d'analyse ──────────────────────────────────────────────

export function formatAnalysisResult(data) {
    const lines = [];

    lines.push('');
    lines.push(bold('  ⚡ PolyCheck — Résultats d\'analyse'));
    lines.push(`  ${divider}`);
    lines.push('');

    // Méta
    if (data.filename) lines.push(`  ${dim('Fichier :')}   ${data.filename}`);
    lines.push(`  ${dim('Langage :')}   ${data.language}`);
    lines.push(`  ${dim('Review  :')}   ${chalk.gray(data.review_id)}`);
    lines.push('');

    // Summary
    const s = data.summary || {};
    lines.push(bold('  Résumé'));
    lines.push(`  ${dim('───────')}`);

    const capInfo = s.total_before_cap > s.total
        ? dim(` (${s.total_before_cap} avant cap)`)
        : '';
    lines.push(`  Total issues : ${bold(String(s.total))}${capInfo}`);
    lines.push('');

    // Sévérité
    const bs = s.by_severity || {};
    lines.push(`  Sévérité :  ${sevDot('critical', bs.critical || 0)}  ${sevDot('high', bs.high || 0)}  ${sevDot('medium', bs.medium || 0)}  ${sevDot('low', bs.low || 0)}`);

    // Catégorie
    const bc = s.by_category || {};
    lines.push(`  Catégorie : ${catDot('security', bc.security || 0)}  ${catDot('bug', bc.bug || 0)}  ${catDot('style', bc.style || 0)}`);

    // Source
    if (s.by_source) {
        const src = s.by_source;
        lines.push(`  Source :    ${dim(`● ${src.groq || 0} groq`)}  ${dim(`● ${src.ast || 0} ast`)}  ${dim(`● ${src['ast+groq'] || 0} ast+groq`)}`);
    }

    lines.push('');

    // Issues
    const issues = data.issues || [];
    if (issues.length > 0) {
        lines.push(bold('  Issues'));
        lines.push(`  ${dim('──────')}`);

        issues.forEach((issue, idx) => {
            const lineNum = issue.line ? dim(` Ligne ${issue.line}`) : '';
            lines.push(`  ${dim(`${idx + 1}.`)} [${sevLabel(issue.severity)}] [${catLabel(issue.category)}]${lineNum} ${dim('—')} ${bold(issue.rule || '?')}`);
            lines.push(`     ${issue.message}`);
            if (issue.suggestion) {
                lines.push(`     ${dim('→')} ${chalk.italic(issue.suggestion)}`);
            }
            lines.push(`     ${dim(`Source: ${issue.source || '?'}`)}`);
            lines.push('');
        });
    } else {
        lines.push(`  ${chalk.green('✔ Aucune issue détectée. Code propre !')}`);
        lines.push('');
    }

    // Metrics
    const m = data.metrics;
    if (m) {
        lines.push(bold('  Métriques'));
        lines.push(`  ${dim('─────────')}`);
        lines.push(`  Lignes de code :          ${m.lines_of_code}`);
        lines.push(`  Lignes vides :            ${m.blank_lines}`);
        lines.push(`  Lignes de commentaires :  ${m.comment_lines}`);
        lines.push(`  Fonctions :               ${m.num_functions}`);
        lines.push(`  Classes :                 ${m.num_classes}`);
        lines.push(`  Long. moy. fonctions :    ${m.avg_function_length}`);
        lines.push('');
    }

    // Warnings
    const warnings = data.warnings || [];
    if (warnings.length > 0) {
        lines.push(bold('  ⚠ Avertissements'));
        lines.push(`  ${dim('──────────────────')}`);
        warnings.forEach(w => lines.push(`  ${chalk.yellow('⚠')} ${w}`));
        lines.push('');
    }

    return lines.join('\n');
}

// ── Format : liste des reviews ───────────────────────────────────────────────

export function formatReviewsList(data) {
    const lines = [];
    const p = data.pagination || {};

    lines.push('');
    lines.push(bold(`  📋 PolyCheck — Reviews (page ${p.page || 1}/${p.pages || 1}, ${p.total || 0} total)`));
    lines.push(`  ${divider}`);
    lines.push('');

    const reviews = data.data || [];
    if (reviews.length === 0) {
        lines.push(`  ${dim('Aucune review trouvée.')}`);
        lines.push('');
        return lines.join('\n');
    }

    // Header
    const hId   = 'ID'.padEnd(36);
    const hLang = 'Langage'.padEnd(12);
    const hIss  = 'Issues'.padStart(6);
    const hDate = 'Date';
    lines.push(`  ${dim(hId)}  ${dim(hLang)}  ${dim(hIss)}  ${dim(hDate)}`);
    lines.push(`  ${dim('─'.repeat(75))}`);

    reviews.forEach(r => {
        const id   = (r.id || '').substring(0, 36).padEnd(36);
        const lang = (r.language || '?').padEnd(12);
        const iss  = String(r.total_issues || 0).padStart(6);
        const date = r.created_at ? r.created_at.replace('T', ' ').substring(0, 16) : '—';

        const issColor = (r.total_issues || 0) > 0 ? chalk.yellow(iss) : chalk.green(iss);
        lines.push(`  ${chalk.gray(id)}  ${lang}  ${issColor}  ${dim(date)}`);
    });

    lines.push('');
    if (p.page < p.pages) {
        lines.push(dim(`  Page suivante : polycheck reviews list --page ${p.page + 1}`));
        lines.push('');
    }

    return lines.join('\n');
}

// ── Format : détail d'une review ─────────────────────────────────────────────

export function formatReviewDetail(data) {
    const lines = [];

    lines.push('');
    lines.push(bold('  📋 PolyCheck — Détail Review'));
    lines.push(`  ${divider}`);
    lines.push('');

    lines.push(`  ${dim('ID :')}       ${chalk.gray(data.id)}`);
    if (data.filename) lines.push(`  ${dim('Fichier :')} ${data.filename}`);
    lines.push(`  ${dim('Langage :')} ${data.language}`);
    lines.push(`  ${dim('Date :')}    ${data.created_at ? data.created_at.replace('T', ' ').substring(0, 19) : '—'}`);
    lines.push('');

    // Summary
    const s = data.summary || {};
    lines.push(bold('  Résumé'));
    lines.push(`  ${dim('───────')}`);
    lines.push(`  Total issues : ${bold(String(data.total_issues || s.total || 0))}`);

    const bs = s.by_severity || {};
    lines.push(`  Sévérité :  ${sevDot('critical', bs.critical || 0)}  ${sevDot('high', bs.high || 0)}  ${sevDot('medium', bs.medium || 0)}  ${sevDot('low', bs.low || 0)}`);

    const bc = s.by_category || {};
    lines.push(`  Catégorie : ${catDot('security', bc.security || 0)}  ${catDot('bug', bc.bug || 0)}  ${catDot('style', bc.style || 0)}`);
    lines.push('');

    // Issues
    const issues = data.issues || [];
    if (issues.length > 0) {
        lines.push(bold('  Issues'));
        lines.push(`  ${dim('──────')}`);

        issues.forEach((issue, idx) => {
            const lineNum = issue.line ? dim(` Ligne ${issue.line}`) : '';
            lines.push(`  ${dim(`${idx + 1}.`)} [${sevLabel(issue.severity)}] [${catLabel(issue.category)}]${lineNum} ${dim('—')} ${bold(issue.rule || '?')}`);
            lines.push(`     ${issue.message}`);
            if (issue.suggestion) {
                lines.push(`     ${dim('→')} ${chalk.italic(issue.suggestion)}`);
            }
            lines.push(`     ${dim(`Source: ${issue.source || '?'}`)}`);
            lines.push('');
        });
    } else {
        lines.push(`  ${chalk.green('✔ Aucune issue détectée.')}`);
        lines.push('');
    }

    return lines.join('\n');
}
