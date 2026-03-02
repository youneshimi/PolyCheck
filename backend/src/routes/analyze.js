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

    // ── Persistance en base de données ──────────────────────────────────────
    let reviewId = null;
    try {
        const [reviewRow] = await query(
            `INSERT INTO reviews (language, filename, code_snippet, code_hash, total_issues, summary)
       VALUES (?, ?, ?, ?, ?, ?)`,
            [
                language,
                filename || null,
                code.substring(0, 65535), // MEDIUMTEXT mais on limite pour sécurité
                codeHash,
                issues.length,
                JSON.stringify(summary),
            ]
        );
        reviewId = reviewRow?.insertId?.toString() || null;

        // Insérer les issues en batch
        if (issues.length > 0) {
            // Générer une review_id à partir de la dernière ligne
            const [reviewRowFetch] = await query(
                'SELECT id FROM reviews WHERE code_hash = ? ORDER BY created_at DESC LIMIT 1',
                [codeHash]
            );
            const dbReviewId = reviewRowFetch?.id;
            reviewId = dbReviewId;

            if (dbReviewId && issues.length > 0) {
                const values = issues.map(() => '(UUID(), ?, ?, ?, ?, ?, ?, ?, ?)');
                const params = issues.flatMap(i => [
                    dbReviewId,
                    i.category,
                    i.severity,
                    i.line || null,
                    i.column || null,
                    i.rule,
                    i.message,
                    i.source,
                ]);
                await query(
                    `INSERT INTO issues (id, review_id, category, severity, line, \`column\`, rule, message, source)
           VALUES ${values.join(', ')}`,
                    params
                );
            }
        }
    } catch (dbErr) {
        console.error('[DB] Erreur lors de la persistance :', dbErr.message);
        // On continue — l'analyse reste retournée même si la DB est down
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
