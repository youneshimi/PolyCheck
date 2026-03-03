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
 * Accepte le message pour désambiguïer les règles génériques que Groq retourne.
 *
 * Ordre des tests : priorité aux préfixes structurels non-ambiguës en premier,
 * puis désambiguation par message pour les règles génériques (secret, call, exception...).
 */
function canonicalizeRule(rule, message = '') {
    const r = (rule || '').toLowerCase().replace(/_/g, '-');
    const m = (message || '').toLowerCase();

    // ── eval ──────────────────────────────────────────────────────────────────
    if (r.startsWith('eval') ||
        (r === 'injection' && (m.includes('eval') || m.includes('dynamic code') || m.includes('dynamic execution')))) {
        return 'eval';
    }

    // ── shell-injection (préfixes structurels non-ambiguës) ───────────────────
    if (r.startsWith('shell') ||
        r.startsWith('os-command') ||
        r.startsWith('command-injection') ||
        r.startsWith('os-system') ||
        r === 'os.system' ||
        r.startsWith('exec') ||
        r.startsWith('spawn') ||
        r === 'fonctionsystem' ||
        (r === 'injection' && (m.includes('shell') || m.includes('os.system') || m.includes('subprocess') || m.includes('command')))) {
        return 'shell-injection';
    }
    // shell-injection par message (règles génériques : function, call, command)
    if ((r === 'function' || r === 'call' || r === 'command') &&
        (m.includes('os.system') || m.includes('system(') || m.includes('subprocess') ||
         m.includes('exec(') || m.includes('shell') || m.includes('spawn'))) {
        return 'shell-injection';
    }

    // ── hardcoded-secret (préfixes structurels) ─────────────────────────────
    if (r.startsWith('hardcoded') || r.startsWith('hard-coded') ||
        r === 'secret' || r === 'api-secret') {
        return 'hardcoded-secret';
    }
    // hardcoded-secret par message ou préfixe ambigu (credential*, token*, key*)
    if ((r.startsWith('credential') || r.startsWith('token') || r.startsWith('key') ||
         r === 'password' || r === 'api') &&
        (m.includes('hardcoded') || m.includes('hard-coded') || m.includes('secret') ||
         m.includes('api') || m.includes('token') || m.includes('key') ||
         m.includes('credential') || m.includes('password') || m.includes('sk-'))) {
        return 'hardcoded-secret';
    }
    // cas générique : tout message mentionnant une clé hardcodée
    if (m.includes('hardcoded') || m.includes('hard-coded') ||
        (m.includes('api') && (m.includes('secret') || m.includes('key') || m.includes('token'))) ||
        (m.includes('password') && m.includes('hardcoded'))) {
        return 'hardcoded-secret';
    }

    // ── sql-injection ─────────────────────────────────────────────────────────
    if (r.startsWith('sql')) return 'sql-injection';

    // ── bare-except ───────────────────────────────────────────────────────────
    // Préfixes structurels
    if (r.startsWith('bare-except') || r.startsWith('bareexcept') ||
        r.startsWith('emptyexcept') || r.startsWith('empty-except') ||
        r.startsWith('broad-except') || r.startsWith('generic-except') ||
        r === 'e722' ||
        (r.startsWith('broad') && (r.includes('except') || r.includes('exception'))) ||
        (r.startsWith('except') && r !== 'exception')) {
        return 'bare-except';
    }
    // exception générique : bare-except si message parle d'un except: vide/large
    if (r === 'exception' &&
        (m.includes('bare except') || m.includes('bare-except') || m.includes('empty except') ||
         m.includes('broad except') || m.includes('generic except') ||
         m.includes('except:') || m.includes('pass') || m.includes('sauf') ||
         m.includes('attrape tout') || m.includes('catch-all'))) {
        return 'bare-except';
    }

    // ── division-by-zero ──────────────────────────────────────────────────────
    // Préfixes structurels
    if (r.startsWith('division') || r.startsWith('zero-division') ||
        r.startsWith('zerodivision') || r.startsWith('divide-by-zero') ||
        r.startsWith('zero-divide')) {
        return 'division-by-zero';
    }
    // call ou exception générique si message parle de ZeroDivisionError ou division
    if ((r === 'call' || r === 'exception') &&
        (m.includes('zerodivisionerror') || m.includes('zero division') ||
         m.includes('divide(') || m.includes('division par zéro') ||
         m.includes('division by zero'))) {
        return 'division-by-zero';
    }

    return r;
}

/**
 * Règles pour lesquelles le message est exclu de la clé de dédup.
 * Groq peut retourner des descriptions différentes selon le prompt (bug/security/style)
 * → seuls canonRule + ligne exacte suffisent à identifier le doublon.
 */
const CANONICAL_RULES = new Set([
    'eval', 'shell-injection', 'hardcoded-secret', 'sql-injection',
    'bare-except', 'division-by-zero',
]);

/**
 * Règles soumises à la dédup par fenêtre glissante ±3 lignes.
 * UNIQUEMENT ces règles : Groq peut reporter la même construction
 * sur try: (ligne N) ou except: (ligne N+3..5) selon le prompt.
 * eval/shell/hardcoded gardent la ligne EXACTE pour ne pas fusionner
 * deux occurrences distinctes proches.
 */
const FUZZY_LINE_RULES = new Set(['bare-except', 'division-by-zero']);

/**
 * Génère la clé de déduplication exacte d'une issue (non-fuzzy).
 * - Catégorie EXCLUE : fusion cross-catégories (security:eval ↔ bug:eval).
 * - Message EXCLU pour toutes les règles : deux prompts Groq (bug/security/style)
 *   décrivent la même construction avec des mots différents → canonRule+line suffit.
 *   Seules les règles hors CANONICAL_RULES ET avec un message très différent
 *   mériteraient le message dans la clé, mais en pratique c'est généralement du bruit.
 */
function dedupKey(issue, canonRule) {
    const line = issue.line != null ? String(issue.line) : 'null';
    return `${canonRule}|${line}`;
}

/**
 * Fusionne une issue entrante dans une issue existante (mutation de existing).
 * Règles : catégorie max, sévérité max, source fusionnée, suggestion/message les plus longs.
 * La ligne est mise à min(existing.line, incoming.line) pour stabiliser l'affichage.
 */
function mergeInto(existing, incoming) {
    existing.category = maxCategory(existing.category, incoming.category);
    existing.severity = maxSeverity(existing.severity, incoming.severity);
    existing.source = mergeSources(existing.source, incoming.source);
    existing.suggestion = longestString(existing.suggestion, incoming.suggestion);
    if (incoming.line != null && (existing.line == null || incoming.line < existing.line)) {
        existing.line = incoming.line;
    }
    if ((incoming.message || '').length > (existing.message || '').length) {
        existing.message = incoming.message;
    }
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

    // ── 2a. Dédup exacte (règles non-fuzzy) + routage fuzzy ─────────────────
    // exactDeduped : Map<key, issue> pour eval, shell-injection, hardcoded-secret, etc.
    // fuzzyQueue   : issues à traiter par fenêtre glissante ±3
    const exactDeduped = new Map();
    const fuzzyQueue = [];

    for (const issue of all) {
        const canonRule = canonicalizeRule(issue.rule, issue.message);
        const normalized = { ...issue, rule: canonRule };

        if (FUZZY_LINE_RULES.has(canonRule)) {
            fuzzyQueue.push(normalized);
        } else {
            const key = dedupKey(issue, canonRule);
            if (!exactDeduped.has(key)) {
                exactDeduped.set(key, normalized);
            } else {
                mergeInto(exactDeduped.get(key), normalized);
            }
        }
    }

    // ── 2b. Fenêtre glissante ±3 (bare-except, division-by-zero) ───────────
    // seenByCanon : Map<canonRule, Array<issue>>
    // Tri par ligne d'abord : garantit un traitement déterministe et optimise
    // les fusions (les lignes proches sont voisines dans la liste).
    // Pour chaque issue, cherche une existante avec |line_a - line_b| <= 3.
    // Si trouvée → fusion. Sinon → nouvelle entrée indépendante.
    const seenByCanon = new Map();
    fuzzyQueue.sort((a, b) => (a.line || 0) - (b.line || 0));

    for (const issue of fuzzyQueue) {
        const canonRule = issue.rule; // déjà canonisé
        if (!seenByCanon.has(canonRule)) {
            seenByCanon.set(canonRule, []);
        }
        const list = seenByCanon.get(canonRule);
        const line = issue.line != null ? Number(issue.line) : null;

        // Cherche une issue existante dans la fenêtre ±3
        const nearby = (line !== null)
            ? list.find(ex => ex.line != null && Math.abs(Number(ex.line) - line) <= 3)
            : null;

        if (nearby) {
            mergeInto(nearby, issue);
        } else {
            list.push({ ...issue });
        }
    }

    // ── 3. Combinaison des deux passes ───────────────────────────────────────
    const combined = [
        ...exactDeduped.values(),
        ...[...seenByCanon.values()].flat(),
    ];

    // ── 4. Tri : sévérité desc → catégorie desc → ligne asc ─────────────────
    const sorted = combined.sort(issueComparator);

    // ── 5. Cap MVP : max MAX_ISSUES issues ───────────────────────────────────
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
