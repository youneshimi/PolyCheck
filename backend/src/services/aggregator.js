'use strict';

// ─── Constantes ───────────────────────────────────────────────────────────────
// Règle : critical > high > medium > low | security > bug > style

/** Nombre maximal d'issues retournées (cap MVP anti-bruit). */
const MAX_ISSUES = 12;

const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };
const CATEGORY_RANK = { security: 3, bug: 2, style: 1 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalise un message pour la clé de dédup :
 * lowercase, trim, espaces multiples → un seul, ponctuation simple supprimée.
 */
function normalizeMessage(msg) {
    if (!msg) return '';
    return msg
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[.,;:!?'"()\[\]{}<>]/g, '');
}

/**
 * Canonnise un identifiant de règle pour fusionner les variantes cross-catégories.
 * Accepte optionnellement le message pour désambiguïer les règles génériques
 * comme "injection" (eval injection vs SQL injection vs shell injection).
 *
 * Exemples :
 *   eval_insecure, eval-injection, eval-use         → "eval"
 *   "injection" + message mentionne eval            → "eval"
 *   shell_injection, shell-injection, os-system-*   → "shell-injection"
 *   "injection" + message mentionne shell/os.system → "shell-injection"
 *   hardcoded-secret, hardcoded-password            → "hardcoded-secret"
 *   sql-injection, sql_injection                    → "sql-injection"
 */
function canonicalizeRule(rule, message = '') {
    const r = (rule || '').toLowerCase().replace(/_/g, '-');
    const m = (message || '').toLowerCase();

    if (r.startsWith('eval') ||
        (r === 'injection' && (m.includes('eval') || m.includes('dynamic code') || m.includes('dynamic execution')))) {
        return 'eval';
    }
    if (r.startsWith('shell') ||
        r.startsWith('os-command') ||
        r.startsWith('command-injection') ||
        r.startsWith('os-system') ||
        r === 'os.system' ||
        (r === 'injection' && (m.includes('shell') || m.includes('os.system') || m.includes('subprocess') || m.includes('command')))) {
        return 'shell-injection';
    }
    if (r.startsWith('hardcoded') || r.startsWith('hard-coded')) return 'hardcoded-secret';
    if (r.startsWith('sql')) return 'sql-injection';
    return r;
}

/** Ensemble des règles canoniques reconnues. Pour ces règles, le message
 *  est exclu de la clé de dédup : Groq peut retourner exactement "eval" OU
 *  "eval-injection" OU "eval_insecure" selon le prompt (bug/security/style)
 *  → descriptions divergentes, seul canonRule+line suffit à identifier le doublon. */
const CANONICAL_RULES = new Set(['eval', 'shell-injection', 'hardcoded-secret', 'sql-injection']);

/**
 * Génère la clé de déduplication d'une issue.
 * La catégorie est EXCLUE pour fusionner les doublons cross-catégories
 * (ex : security:eval-injection ↔ bug:eval_insecure ↔ style:eval sur la même ligne).
 * Pour les règles canoniques reconnues, le message est aussi exclu de la clé.
 * Pour les autres règles, le message normalisé discrimine pour éviter la sur-fusion.
 */
function dedupKey(issue) {
    const canonRule = canonicalizeRule(issue.rule, issue.message);
    const line = issue.line != null ? String(issue.line) : 'null';
    const normMsg = CANONICAL_RULES.has(canonRule) ? '' : normalizeMessage(issue.message);
    return `${canonRule}|${line}|${normMsg}`;
}

/**
 * Retourne la catégorie la plus importante entre deux.
 * Ordre : security > bug > style.
 */
function maxCategory(catA, catB) {
    return (CATEGORY_RANK[catA] || 0) >= (CATEGORY_RANK[catB] || 0) ? catA : catB;
}

/**
 * Fusionne deux sources en une chaîne lisible.
 * Valeurs possibles : 'groq', 'ast', 'ast+groq'.
 */
function mergeSources(srcA, srcB) {
    const a = (srcA || '').toLowerCase();
    const b = (srcB || '').toLowerCase();
    if (a === b) return a;
    if ((a === 'ast' || a === 'ast+groq') && (b === 'groq' || b === 'ast+groq')) return 'ast+groq';
    if ((a === 'groq' || a === 'ast+groq') && (b === 'ast' || b === 'ast+groq')) return 'ast+groq';
    return a || b;
}

/**
 * Retourne la sévérité la plus haute entre deux.
 */
function maxSeverity(sevA, sevB) {
    return (SEVERITY_RANK[sevA] || 0) >= (SEVERITY_RANK[sevB] || 0) ? sevA : sevB;
}

/**
 * Retourne la chaîne la plus longue (non vide) parmi deux.
 */
function longestString(a, b) {
    const sa = (a || '').trim();
    const sb = (b || '').trim();
    if (!sa) return sb;
    if (!sb) return sa;
    return sa.length >= sb.length ? sa : sb;
}

/**
 * Tri déterministe : sévérité desc → catégorie desc → ligne asc.
 */
function issueComparator(a, b) {
    const sevDiff = (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0);
    if (sevDiff !== 0) return sevDiff;
    const catDiff = (CATEGORY_RANK[b.category] || 0) - (CATEGORY_RANK[a.category] || 0);
    if (catDiff !== 0) return catDiff;
    return (a.line || 0) - (b.line || 0);
}

// ─── Agrégation principale ────────────────────────────────────────────────────

/**
 * Agrège, déduplique (smart merge) et trie les issues.
 * Cap à MAX_ISSUES après tri.
 *
 * @param {object}  groqResults  - { bug: [], security: [], style: [] }
 * @param {Array}   astIssues    - issues provenant du service Python AST
 * @returns {{ issues: Array, summary: object }}
 */
function aggregateAndPrioritize(groqResults, astIssues = []) {
    // ── 1. Fusion brute de toutes les sources ────────────────────────────────
    const all = [
        ...(groqResults.bug || []),
        ...(groqResults.security || []),
        ...(groqResults.style || []),
        ...(astIssues || []),
    ];

    // ── 2. Déduplication intelligente par clé normalisée ────────────────────
    // On conserve une Map clé → issue fusionnée.
    const deduped = new Map();

    for (const issue of all) {
        const key = dedupKey(issue);

        if (!deduped.has(key)) {
            // Première occurrence : stocker avec règle canonisée (+ message passé pour désambiguation)
            deduped.set(key, { ...issue, rule: canonicalizeRule(issue.rule, issue.message) });
        } else {
            // Doublon cross-catégorie détecté : fusion intelligente
            const existing = deduped.get(key);
            // Priorité catégorie : security > bug > style
            existing.category = maxCategory(existing.category, issue.category);
            existing.severity = maxSeverity(existing.severity, issue.severity);
            existing.source = mergeSources(existing.source, issue.source);
            existing.suggestion = longestString(existing.suggestion, issue.suggestion);
            // On garde le message le plus long (plus informatif)
            if ((issue.message || '').length > (existing.message || '').length) {
                existing.message = issue.message;
            }
        }
    }

    // ── 3. Tri : sévérité desc → catégorie desc → ligne asc ─────────────────
    const sorted = [...deduped.values()].sort(issueComparator);

    // ── 4. Cap MVP : max MAX_ISSUES issues pour éviter le bruit ─────────────
    const capped = sorted.slice(0, MAX_ISSUES);

    // ── 5. Résumé statistique (basé sur les issues capées) ───────────────────
    const summary = {
        total: capped.length,
        total_before_cap: sorted.length,   // informatif : nb avant le cap
        by_severity: {
            critical: capped.filter(i => i.severity === 'critical').length,
            high: capped.filter(i => i.severity === 'high').length,
            medium: capped.filter(i => i.severity === 'medium').length,
            low: capped.filter(i => i.severity === 'low').length,
        },
        by_category: {
            security: capped.filter(i => i.category === 'security').length,
            bug: capped.filter(i => i.category === 'bug').length,
            style: capped.filter(i => i.category === 'style').length,
        },
        by_source: {
            groq: capped.filter(i => i.source === 'groq').length,
            ast: capped.filter(i => i.source === 'ast').length,
            'ast+groq': capped.filter(i => i.source === 'ast+groq').length,
        },
    };

    return { issues: capped, summary };
}

module.exports = { aggregateAndPrioritize, MAX_ISSUES };
