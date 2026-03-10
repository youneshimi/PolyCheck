'use strict';

/**
 * In-memory logger pour capturer les logs de l'application
 * et les servir via API au frontend
 */

class LogBuffer {
    constructor(maxSize = 500) {
        this.logs = [];
        this.maxSize = maxSize;
    }

    log(level, message, metadata = {}) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,      // 'info', 'warn', 'error', 'debug'
            message,
            metadata,
        };

        this.logs.push(entry);

        // Garder seulement les derniers maxSize logs
        if (this.logs.length > this.maxSize) {
            this.logs.shift();
        }

        // Aussi log en console standard
        const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]`;
        if (level === 'error') {
            console.error(prefix, message, metadata);
        } else if (level === 'warn') {
            console.warn(prefix, message, metadata);
        } else {
            console.log(prefix, message, metadata);
        }
    }

    info(message, metadata = {}) {
        this.log('info', message, metadata);
    }

    warn(message, metadata = {}) {
        this.log('warn', message, metadata);
    }

    error(message, metadata = {}) {
        this.log('error', message, metadata);
    }

    debug(message, metadata = {}) {
        this.log('debug', message, metadata);
    }

    // Retourner tous les logs
    getAll() {
        return this.logs;
    }

    // Retourner les derniers N logs
    getLast(count = 100) {
        return this.logs.slice(-count);
    }

    // Filtrer par niveau
    getByLevel(level) {
        return this.logs.filter(l => l.level === level);
    }

    // Vider les logs
    clear() {
        this.logs = [];
    }
}

// Instance globale unique
const logBuffer = new LogBuffer();

module.exports = { logBuffer };
