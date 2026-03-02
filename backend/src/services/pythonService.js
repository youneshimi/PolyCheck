'use strict';

const axios = require('axios');

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://python-service:8000';
const PYTHON_TIMEOUT_MS = parseInt(process.env.PYTHON_TIMEOUT_MS || '10000', 10);

/**
 * Appelle le service Python pour l'analyse AST.
 * @param {string} language
 * @param {string} code
 * @returns {{ issues: Array, error: string|null, metrics: object }}
 */
async function analyzeWithAST(language, code) {
    try {
        const response = await axios.post(
            `${PYTHON_SERVICE_URL}/analyze`,
            { language, code },
            {
                timeout: PYTHON_TIMEOUT_MS,
                headers: { 'Content-Type': 'application/json' },
            }
        );

        const data = response.data;

        if (!data || !Array.isArray(data.issues)) {
            return {
                issues: [],
                metrics: {},
                error: 'Réponse du service Python invalide : champ "issues" manquant.',
            };
        }

        // Normaliser les issues AST
        const issues = data.issues.map(issue => ({
            category: issue.category || 'style',
            severity: issue.severity || 'low',
            line: issue.line || null,
            column: issue.column || null,
            rule: issue.rule || 'ast-check',
            message: issue.message || 'Problème détecté par AST',
            suggestion: issue.suggestion || null,
            source: 'ast',
        }));

        return {
            issues,
            metrics: data.metrics || {},
            error: null,
        };
    } catch (err) {
        if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
            console.error('[PYTHON] Timeout dépassé :', err.message);
            return {
                issues: [],
                metrics: {},
                error: `Timeout service Python dépassé (${PYTHON_TIMEOUT_MS}ms)`,
            };
        }
        if (err.code === 'ECONNREFUSED') {
            console.error('[PYTHON] Service Python indisponible :', err.message);
            return {
                issues: [],
                metrics: {},
                error: 'Service Python indisponible (connexion refusée)',
            };
        }
        console.error('[PYTHON] Erreur :', err.message);
        return {
            issues: [],
            metrics: {},
            error: `Erreur service Python : ${err.message}`,
        };
    }
}

module.exports = { analyzeWithAST };
