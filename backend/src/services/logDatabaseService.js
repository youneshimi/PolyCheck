'use strict';

const { query } = require('../config/db');

/**
 * Service pour persister les logs en base de données
 * Garder seulement les 5 dernières analyses
 */

class LogDatabaseService {
    /**
     * Sauvegarder les logs d'une analyse dans la BD
     * @param {string} reviewId - ID de la review/analyse
     * @param {Array} logs - Liste des logs à sauvegarder
     */
    async saveLogs(reviewId, logs) {
        if (!reviewId || !logs || logs.length === 0) {
            return;
        }

        try {
            // Insérer chaque log dans la table analysis_logs
            for (const log of logs) {
                const metadata = JSON.stringify(log.metadata || {});
                const timestamp = new Date(log.timestamp || Date.now());
                await query(
                    'INSERT INTO analysis_logs (review_id, timestamp, level, message, metadata) VALUES (?, ?, ?, ?, ?)',
                    [reviewId, timestamp, log.level, log.message, metadata]
                );
            }

            // Nettoyer les anciens logs (garder seulement les 5 dernières analyses)
            await this.cleanOldLogs();

            console.log(`[LOG_DB] ${logs.length} logs sauvegardés pour l'analyse ${reviewId}`);
        } catch (error) {
            console.error('[LOG_DB] Erreur lors de la sauvegarde des logs:', error.message);
            // Non-bloquant: on continue même si la sauvegarde échoue
        }
    }

    /**
     * Récupérer les logs d'une review spécifique
     * @param {string} reviewId - ID de la review
     * @returns {Array} Liste des logs
     */
    async getLogsByReview(reviewId) {
        try {
            const results = await query(
                'SELECT * FROM analysis_logs WHERE review_id = ? ORDER BY timestamp ASC',
                [reviewId]
            );
            return results || [];
        } catch (error) {
            console.error('[LOG_DB] Erreur lors de la lecture des logs:', error.message);
            return [];
        }
    }

    /**
     * Nettoyer les anciens logs (garder seulement les 5 dernières analyses)
     * Supprime les logs des analyses plus anciennes que les 5 dernières
     */
    async cleanOldLogs() {
        try {
            // Obtenir les IDs des 5 dernières analyses
            const result = await query(
                `SELECT review_id FROM analysis_logs 
                 GROUP BY review_id 
                 ORDER BY MAX(timestamp) DESC 
                 LIMIT 5`
            );

            if (result && result.length > 0) {
                const recentReviewIds = result.map(r => r.review_id);
                const placeholders = recentReviewIds.map(() => '?').join(',');

                // Supprimer les logs des analyses qui ne sont pas dans les 5 derniers
                await query(
                    `DELETE FROM analysis_logs 
                     WHERE review_id NOT IN (${placeholders})`,
                    recentReviewIds
                );

                console.log('[LOG_DB] Ancien logs nettoyés (garde 5 dernières analyses)');
            }
        } catch (error) {
            console.error('[LOG_DB] Erreur lors du nettoyage des logs:', error.message);
            // Non-bloquant
        }
    }

    /**
     * Récupérer les logs récents (toutes les analyses confondues)
     * @param {number} limit - Nombre de logs à retourner
     * @returns {Array} Liste des logs triés par timestamp DESC
     */
    async getRecentLogs(limit = 100) {
        try {
            const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(1000, Number(limit))) : 100;
            const results = await query(
                `SELECT * FROM analysis_logs 
                 ORDER BY timestamp DESC 
                 LIMIT ${safeLimit}`
            );
            return (results || []).reverse(); // Inverser pour avoir l'ordre chronologique
        } catch (error) {
            console.error('[LOG_DB] Erreur lors de la lecture des logs récents:', error.message);
            return [];
        }
    }

    /**
     * Supprimer tous les logs
     */
    async clearAllLogs() {
        try {
            await query('DELETE FROM analysis_logs');
            console.log('[LOG_DB] Tous les logs ont été supprimés');
        } catch (error) {
            console.error('[LOG_DB] Erreur lors de la suppression des logs:', error.message);
        }
    }

    /**
     * Obtenir les statistiques des logs
     */
    async getLogStats() {
        try {
            const result = await query(
                `SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as errors,
                    SUM(CASE WHEN level = 'warn' THEN 1 ELSE 0 END) as warnings,
                    SUM(CASE WHEN level = 'info' THEN 1 ELSE 0 END) as infos,
                    COUNT(DISTINCT review_id) as analyses
                 FROM analysis_logs`
            );
            return result?.[0] || { total: 0, errors: 0, warnings: 0, infos: 0, analyses: 0 };
        } catch (error) {
            console.error('[LOG_DB] Erreur lors de la lecture des stats:', error.message);
            return { total: 0, errors: 0, warnings: 0, infos: 0, analyses: 0 };
        }
    }
}

module.exports = new LogDatabaseService();
