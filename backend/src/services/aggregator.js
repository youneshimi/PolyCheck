'use strict';

// ─── Poids de priorisation ────────────────────────────────────────────────────
// Règle : critical > high > medium > low | security > bug > style

const SEVERITY_WEIGHT = {
    critical: 1000,
    high: 100,
    medium: 10,
    low: 1,
};

const CATEGORY_WEIGHT = {
    security: 30,
    bug: 20,
    style: 10,
};

/**
 * Calcule le score de priorité d'une issue.
 * Score élevé = priorité haute.
 */
function priorityScore(issue) {
    const sw = SEVERITY_WEIGHT[issue.severity] || 0;
    const cw = CATEGORY_WEIGHT[issue.category] || 0;
    return sw + cw;
}

/**
 * Agrège, déduplique et trie les issues par ordre de priorité décroissante.
 *
 * @param {object}  groqResults  - { bug: [], security: [], style: [] }
 * @param {Array}   astIssues    - issues provenant du service Python
 * @returns {{ issues: Array, summary: object }}
 */
function aggregateAndPrioritize(groqResults, astIssues = []) {
    // ── Fusion de toutes les issues ──────────────────────────────────────────
    const all = [
        ...(groqResults.bug || []),
        ...(groqResults.security || []),
        ...(groqResults.style || []),
        ...(astIssues || []),
    ];

    // ── Déduplification légère (même message + même ligne) ──────────────────
    const seen = new Set();
    const unique = all.filter(issue => {
        const key = `${issue.category}|${issue.severity}|${issue.line}|${issue.message}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // ── Tri par score décroissant ────────────────────────────────────────────
    unique.sort((a, b) => priorityScore(b) - priorityScore(a));

    // ── Résumé statistique ───────────────────────────────────────────────────
    const summary = {
        total: unique.length,
        by_severity: {
            critical: unique.filter(i => i.severity === 'critical').length,
            high: unique.filter(i => i.severity === 'high').length,
            medium: unique.filter(i => i.severity === 'medium').length,
            low: unique.filter(i => i.severity === 'low').length,
        },
        by_category: {
            security: unique.filter(i => i.category === 'security').length,
            bug: unique.filter(i => i.category === 'bug').length,
            style: unique.filter(i => i.category === 'style').length,
        },
        by_source: {
            groq: unique.filter(i => i.source === 'groq').length,
            ast: unique.filter(i => i.source === 'ast').length,
        },
    };

    return { issues: unique, summary };
}

module.exports = { aggregateAndPrioritize };
