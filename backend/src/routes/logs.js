'use strict';

const express = require('express');
const router = express.Router();
const { logBuffer } = require('../services/logger');
const logDatabaseService = require('../services/logDatabaseService');

/**
 * GET /api/logs
 * Retourne les derniers logs (en mémoire OU en BD selon la requête)
 * 
 * Query params:
 *  - source: 'memory' (default) ou 'database'
 *  - limit: nombre de logs à retourner (default: 100)
 *  - level: filtrer par niveau (info, warn, error, debug)
 *  - review_id: si source=database, retourner les logs d'une review spécifique
 */
router.get('/', async (req, res) => {
    const source = req.query.source || 'memory';
    const limit = parseInt(req.query.limit, 10) || 100;
    const level = req.query.level || null;
    const reviewId = req.query.review_id || null;

    try {
        let logs = [];

        if (source === 'database') {
            // Récupérer les logs depuis la BD
            if (reviewId) {
                // Logs d'une review spécifique
                logs = await logDatabaseService.getLogsByReview(reviewId);
            } else {
                // Derniers logs de la BD
                logs = await logDatabaseService.getRecentLogs(limit);
            }
        } else {
            // Logs en mémoire (par défaut)
            if (level) {
                logs = logBuffer.getByLevel(level);
            } else {
                logs = logBuffer.getLast(limit);
            }
        }

        return res.status(200).json({
            source,
            count: logs.length,
            logs,
        });
    } catch (error) {
        console.error('[LOGS_API] Erreur:', error.message);
        return res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/logs/stats
 * Obtenir les statistiques des logs en BD
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await logDatabaseService.getLogStats();
        return res.status(200).json(stats);
    } catch (error) {
        console.error('[LOGS_API] Erreur stats:', error.message);
        return res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/logs/reviews/:reviewId
 * Obtenir les logs d'une review spécifique
 */
router.get('/reviews/:reviewId', async (req, res) => {
    try {
        const logs = await logDatabaseService.getLogsByReview(req.params.reviewId);
        return res.status(200).json({
            review_id: req.params.reviewId,
            count: logs.length,
            logs,
        });
    } catch (error) {
        console.error('[LOGS_API] Erreur:', error.message);
        return res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/logs
 * Vider tous les logs (mémoire ET BD)
 */
router.delete('/', async (req, res) => {
    try {
        logBuffer.clear();
        await logDatabaseService.clearAllLogs();
        return res.status(200).json({ message: 'Tous les logs ont été supprimés' });
    } catch (error) {
        console.error('[LOGS_API] Erreur delete:', error.message);
        return res.status(500).json({ error: error.message });
    }
});

module.exports = router;
