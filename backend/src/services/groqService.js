'use strict';

const Groq = require('groq-sdk');

// Modèle principal : configurable via env, fallback sur llama-3.3-70b-versatile
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
// Modèle de secours automatique si le modèle principal est décommissionné
const GROQ_MODEL_FALLBACK = process.env.GROQ_MODEL_FALLBACK || 'llama-3.1-8b-instant';
const GROQ_TIMEOUT_MS = parseInt(process.env.GROQ_TIMEOUT_MS || '30000', 10);

// ─── Configuration RAG ────────────────────────────────────────────────────────
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://python-service:8000';
const RAG_ENABLED = process.env.RAG_ENABLED !== 'false'; // RAG activé par défaut

let groqClient = null;

function getGroqClient() {
    if (!groqClient) {
        if (!process.env.GROQ_API_KEY) {
            throw new Error('GROQ_API_KEY non défini dans les variables d\'environnement. Ajoutez-la dans votre fichier .env.');
        }
        groqClient = new Groq({
            apiKey: process.env.GROQ_API_KEY,
            timeout: GROQ_TIMEOUT_MS,
        });
    }
    return groqClient;
}

/** Vérifie si l'erreur Groq est due à un modèle décommissionné. */
function isDecommissionedError(err) {
    if (!err) return false;
    const msg = (err.message || '').toLowerCase();
    const code = err?.error?.code || err?.code || '';
    return code === 'model_decommissioned'
        || msg.includes('decommissioned')
        || msg.includes('model_decommissioned');
}

// ─── Service RAG (Retrieval Augmented Generation) ────────────────────────────

/**
 * Récupère les patterns de bonnes pratiques depuis le service Python RAG.
 * @param {string} language - Langage de programmation (python, javascript, etc.)
 * @param {string} code - Code à analyser
 * @param {string} category - Catégorie (bug, security, style)
 * @returns {Promise<Array>} Liste des patterns pertinents ou tableau vide si erreur
 */
async function fetchRAGPatterns(language, code, category) {
    if (!RAG_ENABLED) {
        return [];
    }

    try {
        const fetch = (await import('node-fetch')).default;

        const response = await fetch(`${PYTHON_SERVICE_URL}/rag/retrieve`, {
            method: 'POST',
            timeout: 5000,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: code.substring(0, 1000), // Limiter pour performance
                language,
                category,
            }),
        });

        if (!response.ok) {
            console.warn(`[RAG] Erreur ${response.status} du service Python`);
            return [];
        }

        const data = await response.json();

        if (!Array.isArray(data.patterns)) {
            console.warn('[RAG] Réponse invalide du service Python');
            return [];
        }

        console.log(`[RAG] ${data.patterns.length} patterns trouvés pour ${language}/${category}`);
        return data.patterns;
    } catch (err) {
        console.warn(`[RAG] Impossible de contacter le service Python (${PYTHON_SERVICE_URL}) :`, err.message);
        return [];
    }
}

/**
 * Augmente le prompt original avec les patterns trouvés by RAG.
 * @param {string} basePrompt - Prompt original
 * @param {Array} patterns - Patterns trouvés par RAG
 * @returns {string} Prompt augmenté
 */
function augmentPromptWithPatterns(basePrompt, patterns) {
    if (!patterns || patterns.length === 0) {
        return basePrompt;
    }

    let augmented = basePrompt + '\n\n# ─── RÉFÉRENCES DE BONNES PRATIQUES (RAG-Augmented) ───\n';
    augmented += 'Tenez compte de ces patterns pertinents dans votre analyse :\n\n';

    for (const pattern of patterns) {
        augmented += `📌 **${pattern.rule}** (Règle: ${pattern.pattern})\n`;
        augmented += `   - Catégorie: ${pattern.category} | Sévérité: ${pattern.severity}\n`;
        augmented += `   - Pertinence: ${(pattern.similarity_score * 100).toFixed(0)}% confiance\n\n`;
    }

    augmented += '⚠️ Si des problèmes correspondent à ces patterns, mentionnez le rule ID dans votre réponse.\n';

    return augmented;
}

// ─── Prompts par catégorie ────────────────────────────────────────────────────

const PROMPTS = {
    bug: (language, code) => `Tu es un expert en détection de bugs pour le langage ${language}.
Analyse ce code et détecte UNIQUEMENT les bugs, erreurs logiques, comportements indéfinis et problèmes de runtime.

RÈGLES STRICTES :
- Réponds UNIQUEMENT avec un JSON valide, sans markdown, sans texte avant ou après.
- Format exact attendu :
{
  "issues": [
    {
      "category": "bug",
      "severity": "critical|high|medium|low",
      "line": <numéro de ligne ou null>,
      "rule": "<identifiant court>",
      "message": "<description en français>",
      "suggestion": "<correction proposée>"
    }
  ]
}
- Si aucun bug trouvé : { "issues": [] }
- Maximum 10 issues.

CODE ${language.toUpperCase()} :
\`\`\`${language}
${code}
\`\`\``,

    security: (language, code) => `Tu es un expert en sécurité logicielle pour le langage ${language}.
Analyse ce code et détecte UNIQUEMENT les vulnérabilités de sécurité : injections, XSS, secrets hardcodés, permissions excessives, OWASP Top 10, etc.

RÈGLES STRICTES :
- Réponds UNIQUEMENT avec un JSON valide, sans markdown, sans texte avant ou après.
- Format exact attendu :
{
  "issues": [
    {
      "category": "security",
      "severity": "critical|high|medium|low",
      "line": <numéro de ligne ou null>,
      "rule": "<identifiant court>",
      "message": "<description en français>",
      "suggestion": "<correction proposée>"
    }
  ]
}
- Si aucun problème trouvé : { "issues": [] }
- Maximum 10 issues.

CODE ${language.toUpperCase()} :
\`\`\`${language}
${code}
\`\`\``,

    style: (language, code) => `Tu es un expert en qualité de code et bonnes pratiques pour le langage ${language}.
Analyse ce code et détecte UNIQUEMENT les problèmes de style, lisibilité, conventions de nommage, complexité cyclomatique, duplication et principes SOLID/DRY/KISS.

RÈGLES STRICTES :
- Réponds UNIQUEMENT avec un JSON valide, sans markdown, sans texte avant ou après.
- Format exact attendu :
{
  "issues": [
    {
      "category": "style",
      "severity": "critical|high|medium|low",
      "line": <numéro de ligne ou null>,
      "rule": "<identifiant court>",
      "message": "<description en français>",
      "suggestion": "<correction proposée>"
    }
  ]
}
- Si aucun problème trouvé : { "issues": [] }
- Maximum 10 issues.

CODE ${language.toUpperCase()} :
\`\`\`${language}
${code}
\`\`\``,
};

// ─── Validation du JSON Groq ──────────────────────────────────────────────────

function parseGroqResponse(rawContent, category) {
    try {
        // Nettoyer le contenu : enlever les blocs markdown si présents
        let content = rawContent.trim();
        // Supprimer ```json ... ``` ou ``` ... ```
        content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

        const parsed = JSON.parse(content);

        if (!parsed || !Array.isArray(parsed.issues)) {
            throw new Error('Champ "issues" manquant ou non-tableau');
        }

        // Valider et normaliser chaque issue
        const VALID_SEVERITIES = ['critical', 'high', 'medium', 'low'];
        const VALID_CATEGORIES = ['bug', 'security', 'style'];

        const issues = parsed.issues
            .filter(issue => issue && typeof issue === 'object')
            .map(issue => ({
                category: VALID_CATEGORIES.includes(issue.category) ? issue.category : category,
                severity: VALID_SEVERITIES.includes(issue.severity) ? issue.severity : 'medium',
                line: Number.isInteger(issue.line) ? issue.line : null,
                column: Number.isInteger(issue.column) ? issue.column : null,
                rule: typeof issue.rule === 'string' ? issue.rule : 'unknown',
                message: typeof issue.message === 'string' ? issue.message : 'Problème détecté',
                suggestion: typeof issue.suggestion === 'string' ? issue.suggestion : null,
                source: 'groq',
            }));

        return { issues, error: null };
    } catch (err) {
        console.error(`[GROQ] Erreur parsing JSON (${category}) :`, err.message);
        return {
            issues: [],
            error: `Réponse Groq invalide pour la catégorie "${category}" : ${err.message}`,
        };
    }
}

// ─── Appel Groq (un modèle donné, sans retry) ────────────────────────────────

async function callGroqWithModel(client, model, prompt, category) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

    try {
        const completion = await client.chat.completions.create(
            {
                model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                max_tokens: 2048,
            },
            { signal: controller.signal }
        );
        clearTimeout(timer);

        const rawContent = completion?.choices?.[0]?.message?.content;
        if (!rawContent) {
            return { issues: [], error: `Groq n'a retourné aucun contenu pour "${category}"`, decommissioned: false };
        }
        const result = parseGroqResponse(rawContent, category);
        return { ...result, decommissioned: false };
    } catch (err) {
        clearTimeout(timer);

        // Timeout
        const isTimeout = err.name === 'AbortError'
            || err.message?.includes('abort')
            || err.message?.toLowerCase().includes('timeout')
            || err.constructor?.name?.toLowerCase().includes('timeout')
            || err.code === 'ETIMEDOUT';
        if (isTimeout) {
            return { issues: [], error: `Timeout Groq dépassé (${GROQ_TIMEOUT_MS}ms) pour "${category}"`, decommissioned: false };
        }

        // Modèle décommissionné → signal pour retry
        if (isDecommissionedError(err)) {
            return { issues: [], error: null, decommissioned: true };
        }

        return { issues: [], error: `Erreur API Groq pour "${category}" : ${err.message}`, decommissioned: false };
    }
}

// ─── Appel Groq avec retry automatique sur model_decommissioned ───────────────

async function callGroq(language, code, category) {
    const client = getGroqClient();
    let prompt = PROMPTS[category](language, code);

    // 🔄 RAG: Enrichir le prompt avec les patterns trouvés
    if (RAG_ENABLED) {
        try {
            const patterns = await fetchRAGPatterns(language, code, category);
            if (patterns.length > 0) {
                prompt = augmentPromptWithPatterns(prompt, patterns);
            }
        } catch (err) {
            // RAG est optionnel, pas de blocage
            console.warn('[RAG] Erreur optionnelle ignorée, analyse continue sans RAG');
        }
    }

    // Tentative 1 : modèle principal
    const first = await callGroqWithModel(client, GROQ_MODEL, prompt, category);

    if (!first.decommissioned) {
        return { issues: first.issues, error: first.error };
    }

    // Modèle principal décommissionné → retry avec le fallback
    console.warn(`[GROQ] Modèle "${GROQ_MODEL}" décommissionné pour "${category}". Retry avec "${GROQ_MODEL_FALLBACK}"…`);
    const second = await callGroqWithModel(client, GROQ_MODEL_FALLBACK, prompt, category);

    if (second.decommissioned) {
        return {
            issues: [],
            error: `Les modèles "${GROQ_MODEL}" et "${GROQ_MODEL_FALLBACK}" sont tous deux décommissionnés. Mettez à jour GROQ_MODEL dans .env.`,
        };
    }

    const warning = second.error
        ? second.error
        : `Modèle principal "${GROQ_MODEL}" décommissionné → fallback "${GROQ_MODEL_FALLBACK}" utilisé pour "${category}".`;

    return { issues: second.issues, error: warning };
}

/**
 * Lance les 3 analyses Groq en parallèle.
 * @returns {{ results: object, errors: string[] }}
 */
async function analyzeWithGroq(language, code) {
    const [bugResult, secResult, styleResult] = await Promise.all([
        callGroq(language, code, 'bug'),
        callGroq(language, code, 'security'),
        callGroq(language, code, 'style'),
    ]);

    const errors = [];
    if (bugResult.error) errors.push(bugResult.error);
    if (secResult.error) errors.push(secResult.error);
    if (styleResult.error) errors.push(styleResult.error);

    return {
        results: {
            bug: bugResult.issues,
            security: secResult.issues,
            style: styleResult.issues,
        },
        errors,
    };
}

module.exports = { analyzeWithGroq };
