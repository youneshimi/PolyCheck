'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');

const { initDB } = require('./config/db');
const analyzeRouter = require('./routes/analyze');
const reviewsRouter = require('./routes/reviews');
const logsRouter = require('./routes/logs');

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// ─── Middlewares globaux ─────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/analyze', analyzeRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/logs', logsRouter);

// ─── Health ──────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ error: 'Route introuvable' });
});

// ─── Gestionnaire d'erreurs global ───────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
    console.error('[ERROR]', err.message || err);
    res.status(err.status || 500).json({
        error: err.message || 'Erreur interne du serveur',
    });
});

// ─── Démarrage ───────────────────────────────────────────────────────────────
(async () => {
    try {
        await initDB();
        app.listen(PORT, () => {
            console.log(`✅ PolyCheck Backend démarré sur le port ${PORT}`);
        });
    } catch (err) {
        console.error('❌ Impossible de démarrer le serveur :', err.message);
        process.exit(1);
    }
})();
