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
    // Variantes bare-except : bare-except*, bareexcept*, broad-except*, broadexception*, generic-except*, empty-except*, except* (hors "exception")
    if (r.startsWith('bare-except') || r.startsWith('bareexcept') ||
        r.startsWith('broad-except') || r.startsWith('generic-except') ||
        r.startsWith('empty-except') ||
        (r.startsWith('broad') && (r.includes('except') || r.includes('exception'))) ||
        (r.startsWith('except') && r !== 'exception')) {
        return 'bare-except';
    }
    // Variantes division par zéro : division*, zero-division*, divide-by-zero*, zerodivision*
    if (r.startsWith('division') || r.startsWith('zero-division') ||
        r.startsWith('zerodivision') || r.startsWith('divide-by-zero') ||
        r.startsWith('zero-divide')) {
        return 'division-by-zero';
    }
    return r;
}

/**
 * Règles pour lesquelles le message est exclu de la clé de dédup.
 * Groq peut retourner des descriptions différentes selon le prompt (bug/security/style)
 * → seuls canonRule + line_bucket suffisent à identifier le doublon.
 */
const CANONICAL_RULES = new Set([
    'eval', 'shell-injection', 'hardcoded-secret', 'sql-injection',
    'bare-except', 'division-by-zero',
]);

/**
 * Règles pour lesquelles on applique un bucketing de ligne (fuzzy ±3).
 * Uniquement pour les règles "bruyantes" dont la ligne peut varier de ±1–3
 * selon le prompt Groq. On N'applique PAS le fuzzy à eval/shell/hardcoded
 * pour éviter de fusionner deux occurrences distinctes sur des lignes proches.
 */
const FUZZY_LINE_RULES = new Set(['bare-except', 'division-by-zero']);

/** Bucket de ligne : regroupe par tranches de 8 lignes (couvre un bloc try/except typique).
 *  0-7 → 0, 8-15 → 8, 16-23 → 16, ...
 *  Groq peut reporter bare-except sur la ligne `try:` ou `except:` selon le prompt
 *  (ex: l2 et l5 pour le même bloc → même bucket 0). */
function lineBucket(line) {
    const n = Number(line) || 0;
    return String(Math.floor(n / 8) * 8);
}

/**
 * Génère la clé de déduplication d'une issue.
 * - Catégorie EXCLUE : pour fusionner les doublons cross-catégories.
 * - Règles canoniques : message exclu (descriptions Groq divergent selon prompt).
 * - Règles fuzzy (bare-except, division-by-zero) : ligne buckétisée (±3 lignes).
 */
function dedupKey(issue) {
    const canonRule = canonicalizeRule(issue.rule, issue.message);
    const rawLine = issue.line != null ? issue.line : null;
    const lineKey = rawLine === null
        ? 'null'
        : FUZZY_LINE_RULES.has(canonRule)
            ? lineBucket(rawLine)
            : String(rawLine);
    const normMsg = CANONICAL_RULES.has(canonRule) ? '' : normalizeMessage(issue.message);
    return `${canonRule}|${lineKey}|${normMsg}`;
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
            // Première occurrence : stocker avec règle canonisée
            deduped.set(key, { ...issue, rule: canonicalizeRule(issue.rule, issue.message) });
        } else {
            // Doublon (exact ou fuzzy) détecté : fusion intelligente
            const existing = deduped.get(key);
            // Priorité catégorie : security > bug > style
            existing.category = maxCategory(existing.category, issue.category);
            existing.severity = maxSeverity(existing.severity, issue.severity);
            existing.source = mergeSources(existing.source, issue.source);
            existing.suggestion = longestString(existing.suggestion, issue.suggestion);
            // Ligne = min(line) pour stabiliser l'affichage sur la première occurrence
            if (issue.line != null && (existing.line == null || issue.line < existing.line)) {
                existing.line = issue.line;
            }
            // Message le plus long (plus informatif)
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
