'use strict';

const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const { validateAnalyzeRequest } = require('../middleware/validate');
const { analyzeWithGroq } = require('../services/groqService');
const { analyzeWithAST } = require('../services/pythonService');
const { aggregateAndPrioritize } = require('../services/aggregator');
const { query } = require('../config/db');
const { logBuffer } = require('../services/logger');
const logDatabaseService = require('../services/logDatabaseService');

/**
 * POST /api/analyze
 * Corps : { code: string, language: string, filename?: string }
 */
router.post('/', validateAnalyzeRequest, async (req, res, next) => {
    const { code, language, filename } = req.body;
    const logStartIndex = logBuffer.size();

    logBuffer.info('Analyze request received', { language, filename, codeLength: code.length });

    // ── Hash du code (pour cache éventuel + indexation) ─────────────────────
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    // ── Lancer AST et Groq en parallèle ─────────────────────────────────────
    logBuffer.info('Starting AST + Groq analysis in parallel...');
    const [astResult, groqResult] = await Promise.allSettled([
        analyzeWithAST(language, code),
        analyzeWithGroq(language, code),
    ]);

    // Extraire les valeurs (les erreurs sont gérées dans chaque service)
    const ast = astResult.status === 'fulfilled' ? astResult.value : { issues: [], metrics: {}, error: astResult.reason?.message };
    const groq = groqResult.status === 'fulfilled' ? groqResult.value : { results: { bug: [], security: [], style: [] }, errors: [groqResult.reason?.message] };

    if (astResult.status === 'fulfilled') {
        logBuffer.info('AST analysis completed', { issuesFound: ast.issues?.length || 0 });
    } else {
        logBuffer.warn('AST analysis failed', { error: astResult.reason?.message });
    }

    if (groqResult.status === 'fulfilled') {
        const groqBugs = groq.results?.bug?.length || 0;
        const groqSecurity = groq.results?.security?.length || 0;
        const groqStyle = groq.results?.style?.length || 0;
        logBuffer.info('Groq analysis completed', { bugs: groqBugs, security: groqSecurity, style: groqStyle });
    } else {
        logBuffer.warn('Groq analysis failed', { error: groqResult.reason?.message });
    }

    // ── Agrégation et priorisation ───────────────────────────────────────────
    logBuffer.info('Aggregating and prioritizing issues...');
    const { issues, summary } = aggregateAndPrioritize(groq.results, ast.issues);
    logBuffer.info('Analysis complete', { totalIssues: issues.length, ...summary });

    // ── Persistance en base de données (optionnelle, non-bloquante) ────────────
    let reviewId = null;
    try {
        // Générer l'UUID côté Node.js pour pouvoir l'utiliser immédiatement
        reviewId = uuidv4();

        await query(
            `INSERT INTO reviews (id, language, filename, code_snippet, code_hash, total_issues, summary)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                reviewId,
                language,
                filename || null,
                code.substring(0, 65535),
                codeHash,
                issues.length,
                JSON.stringify(summary),
            ]
        );
        logBuffer.info('Review saved to database', { reviewId });

        // Sauvegarder uniquement les logs de cette analyse dans la BD
        const analysisLogs = logBuffer.getSince(logStartIndex);
        await logDatabaseService.saveLogs(reviewId, analysisLogs);
    } catch (dbErr) {
        // BD optionnelle : ne pas bloquer l'analyse si la DB fail
        logBuffer.warn('Database save failed (non-critical)', { error: dbErr.message });
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
