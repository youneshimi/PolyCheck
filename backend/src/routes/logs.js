'use strict';

const express = require('express');
const router = express.Router();
const { logBuffer } = require('../services/logger');

/**
 * GET /api/logs
 * Retourne les derniers logs de l'application
 * 
 * Query params:
 *  - limit: nombre de logs à retourner (default: 100)
 *  - level: filtrer par niveau (info, warn, error, debug)
 */
router.get('/', (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 100;
    const level = req.query.level || null;

    let logs;

    if (level) {
        logs = logBuffer.getByLevel(level);
    } else {
        logs = logBuffer.getLast(limit);
    }

    return res.status(200).json({
        count: logs.length,
        logs,
    });
});

/**
 * DELETE /api/logs
 * Vider tous les logs
 */
router.delete('/', (req, res) => {
    logBuffer.clear();
    return res.status(200).json({ message: 'Logs cleared' });
});

module.exports = router;
