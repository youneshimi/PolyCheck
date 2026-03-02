'use strict';

const MAX_FILE_SIZE_BYTES = parseInt(process.env.MAX_FILE_SIZE_BYTES || '51200', 10);
const SUPPORTED_LANGUAGES = (process.env.SUPPORTED_LANGUAGES || 'python,javascript,typescript,java,go,rust,c,cpp')
    .split(',').map(l => l.trim().toLowerCase());

/**
 * Valide la requête d'analyse.
 * Vérifie : présence du code, langue supportée, taille du fichier.
 */
function validateAnalyzeRequest(req, res, next) {
    const { code, language, filename } = req.body;

    // ── code ────────────────────────────────────────────────────────────────────
    if (code === undefined || code === null) {
        return res.status(400).json({ error: 'Le champ "code" est requis.' });
    }

    if (typeof code !== 'string') {
        return res.status(400).json({ error: 'Le champ "code" doit être une chaîne de caractères.' });
    }

    if (code.trim().length === 0) {
        return res.status(400).json({ error: 'Le fichier est vide. Veuillez soumettre du code à analyser.' });
    }

    // ── Taille ──────────────────────────────────────────────────────────────────
    const byteSize = Buffer.byteLength(code, 'utf8');
    if (byteSize > MAX_FILE_SIZE_BYTES) {
        return res.status(413).json({
            error: `Fichier trop volumineux : ${byteSize} octets (max : ${MAX_FILE_SIZE_BYTES} octets).`,
        });
    }

    // ── language ────────────────────────────────────────────────────────────────
    if (!language || typeof language !== 'string') {
        return res.status(400).json({ error: 'Le champ "language" est requis.' });
    }

    const lang = language.trim().toLowerCase();
    if (!SUPPORTED_LANGUAGES.includes(lang)) {
        return res.status(422).json({
            error: `Langage non supporté : "${language}". Langages supportés : ${SUPPORTED_LANGUAGES.join(', ')}.`,
        });
    }

    // Normaliser
    req.body.language = lang;
    req.body.filename = filename ? String(filename).trim() : null;

    next();
}

module.exports = { validateAnalyzeRequest };
