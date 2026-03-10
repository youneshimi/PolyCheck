'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { validateAnalyzeRequest } = require('../middleware/validate');
const { analyzeWithGroq } = require('../services/groqService');
const { analyzeWithAST } = require('../services/pythonService');
const { aggregateAndPrioritize } = require('../services/aggregator');
const { query } = require('../config/db');

/**
 * POST /api/analyze
 * Corps : { code: string, language: string, filename?: string }
 */
router.post('/', validateAnalyzeRequest, async (req, res, next) => {
    const { code, language, filename } = req.body;

    // ── Hash du code (pour cache éventuel + indexation) ─────────────────────
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    // ── Lancer AST et Groq en parallèle ─────────────────────────────────────
    const [astResult, groqResult] = await Promise.allSettled([
        analyzeWithAST(language, code),
        analyzeWithGroq(language, code),
    ]);

    // Extraire les valeurs (les erreurs sont gérées dans chaque service)
    const ast = astResult.status === 'fulfilled' ? astResult.value : { issues: [], metrics: {}, error: astResult.reason?.message };
    const groq = groqResult.status === 'fulfilled' ? groqResult.value : { results: { bug: [], security: [], style: [] }, errors: [groqResult.reason?.message] };

    // ── Agrégation et priorisation ───────────────────────────────────────────
    const { issues, summary } = aggregateAndPrioritize(groq.results, ast.issues);

    // ── Persistance en base de données (optionnelle, non-bloquante) ────────────
    let reviewId = null;
    try {
        await query(
            `INSERT INTO reviews (language, filename, code_snippet, code_hash, total_issues, summary)
       VALUES (?, ?, ?, ?, ?, ?)`,
            [
                language,
                filename || null,
                code.substring(0, 65535),
                codeHash,
                issues.length,
                JSON.stringify(summary),
            ]
        );
    } catch (dbErr) {
        // BD optionnelle : ne pas bloquer l'analyse si la DB fail
        console.log('[DB] Sauvegarde historique non disponible (non-critique)');
    }

    // ── Réponse ──────────────────────────────────────────────────────────────
    // Dédupliquer les warnings (Groq peut renvoyer 3 fois le même message)
    const rawWarnings = [
        ...(ast.error ? [`AST: ${ast.error}`] : []),
        ...(groq.errors || []),
    ].filter(Boolean);
    const warnings = [...new Set(rawWarnings)];

    return res.status(200).json({
        review_id: reviewId,
        language,
        filename: filename || null,
        summary,
        issues,
        metrics: ast.metrics || {},
        warnings,
    });
});

module.exports = router;
