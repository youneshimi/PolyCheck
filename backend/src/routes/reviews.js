'use strict';

const express = require('express');
const router = express.Router();
const { query } = require('../config/db');

/**
 * GET /api/reviews
 * Liste paginée des reviews avec leur résumé.
 * Query params : page (défaut 1), limit (défaut 20, max 100)
 */
router.get('/', async (req, res, next) => {
    try {
        let page = Math.max(1, parseInt(req.query.page || '1', 10));
        let limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
        const offset = (page - 1) * limit;

        const [countRow] = await query('SELECT COUNT(*) AS total FROM reviews');
        const total = countRow?.total || 0;

        const rows = await query(
            `SELECT id, language, filename, code_hash, total_issues, summary, created_at
       FROM reviews
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        const reviews = rows.map(r => ({
            ...r,
            summary: typeof r.summary === 'string' ? JSON.parse(r.summary) : r.summary,
        }));

        return res.json({
            data: reviews,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/reviews/:id
 * Détail d'une review avec toutes ses issues.
 */
router.get('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;

        const [review] = await query(
            `SELECT id, language, filename, code_hash, total_issues, summary, created_at
       FROM reviews WHERE id = ? LIMIT 1`,
            [id]
        );

        if (!review) {
            return res.status(404).json({ error: `Review "${id}" introuvable.` });
        }

        const issues = await query(
            `SELECT id, category, severity, line, \`column\`, rule, message, suggestion, source, created_at
       FROM issues WHERE review_id = ?
       ORDER BY
         FIELD(severity, 'critical', 'high', 'medium', 'low'),
         FIELD(category, 'security', 'bug', 'style')`,
            [id]
        );

        return res.json({
            ...review,
            summary: typeof review.summary === 'string' ? JSON.parse(review.summary) : review.summary,
            issues,
        });
    } catch (err) {
        next(err);
    }
});

/**
 * DELETE /api/reviews/:id
 * Supprime une review et ses issues (CASCADE).
 */
router.delete('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;

        const result = await query('DELETE FROM reviews WHERE id = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: `Review "${id}" introuvable.` });
        }

        return res.json({ message: `Review "${id}" supprimée avec succès.` });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
