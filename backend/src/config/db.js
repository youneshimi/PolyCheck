'use strict';

const mysql = require('mysql2/promise');

let pool = null;

/**
 * Initialise le pool MySQL avec retry.
 */
async function initDB() {
    const config = {
        host: process.env.MYSQL_HOST || 'mysql',
        port: parseInt(process.env.MYSQL_PORT || '3306', 10),
        user: process.env.MYSQL_USER || 'polycheck',
        password: process.env.MYSQL_PASSWORD || 'polycheck_secret',
        database: process.env.MYSQL_DATABASE || 'polycheck_db',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        timezone: '+00:00',
        charset: 'utf8mb4',
    };

    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
        try {
            pool = mysql.createPool(config);
            // Test de connexion
            const conn = await pool.getConnection();
            conn.release();
            console.log('✅ Connecté à MySQL');
            return pool;
        } catch (err) {
            attempts++;
            console.warn(`⚠️  MySQL non disponible (tentative ${attempts}/${maxAttempts}). Nouvelle tentative dans 3s…`);
            if (attempts >= maxAttempts) {
                throw new Error(`Impossible de se connecter à MySQL après ${maxAttempts} tentatives : ${err.message}`);
            }
            await new Promise(r => setTimeout(r, 3000));
        }
    }
}

/**
 * Retourne le pool MySQL.
 * @throws {Error} si le pool n'est pas initialisé.
 */
function getPool() {
    if (!pool) throw new Error('MySQL non initialisé. Appelez initDB() d\'abord.');
    return pool;
}

/**
 * Exécute une requête et retourne les résultats.
 */
async function query(sql, params = []) {
    try {
        const [rows] = await getPool().execute(sql, params);
        return rows;
    } catch (err) {
        // Erreur MySQL détaillée
        const mysqlError = new Error(`Erreur MySQL [${err.code}] : ${err.message}`);
        mysqlError.code = err.code;
        mysqlError.status = 503;
        throw mysqlError;
    }
}

module.exports = { initDB, getPool, query };
