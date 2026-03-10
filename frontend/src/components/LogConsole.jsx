import React, { useState, useEffect, useRef } from 'react';
import './LogConsole.css';

export default function LogConsole() {
    const [logs, setLogs] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [autoScroll, setAutoScroll] = useState(true);
    const logEndRef = useRef(null);

    // Fetch logs toutes les secondes
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const response = await fetch('http://localhost:3001/api/logs?limit=200');
                const data = await response.json();
                setLogs(data.logs || []);
            } catch (error) {
                console.error('Failed to fetch logs:', error);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    // Auto-scroll vers le bas
    useEffect(() => {
        if (autoScroll && logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, autoScroll]);

    const clearLogs = async () => {
        try {
            await fetch('http://localhost:3001/api/logs', { method: 'DELETE' });
            setLogs([]);
        } catch (error) {
            console.error('Failed to clear logs:', error);
        }
    };

    const getLevelColor = (level) => {
        switch (level) {
            case 'error':
                return '#ff4444';
            case 'warn':
                return '#ffaa00';
            case 'info':
                return '#4488ff';
            case 'debug':
                return '#888888';
            default:
                return '#ffffff';
        }
    };

    const getLevelBgColor = (level) => {
        switch (level) {
            case 'error':
                return '#2a1a1a';
            case 'warn':
                return '#2a2a1a';
            case 'info':
                return '#1a1a2a';
            case 'debug':
                return '#1a1a1a';
            default:
                return '#1a1a1a';
        }
    };

    return (
        <div className="log-console-container">
            {/* Bouton toggle */}
            <button
                className="log-toggle-btn"
                onClick={() => setIsOpen(!isOpen)}
                title={isOpen ? 'Fermer la console' : 'Ouvrir la console'}
            >
                📋 Logs {logs.length > 0 && <span className="log-count">{logs.length}</span>}
            </button>

            {/* Console */}
            {isOpen && (
                <div className="log-console-panel">
                    {/* Header */}
                    <div className="log-console-header">
                        <h3>📋 Console de Logs</h3>
                        <div className="log-controls">
                            <label>
                                <input
                                    type="checkbox"
                                    checked={autoScroll}
                                    onChange={(e) => setAutoScroll(e.target.checked)}
                                />
                                Auto-scroll
                            </label>
                            <button className="log-clear-btn" onClick={clearLogs}>
                                🗑️ Effacer
                            </button>
                            <button
                                className="log-close-btn"
                                onClick={() => setIsOpen(false)}
                            >
                                ✕
                            </button>
                        </div>
                    </div>

                    {/* Logs */}
                    <div className="log-console-body">
                        {logs.length === 0 ? (
                            <div className="log-empty">En attente de logs...</div>
                        ) : (
                            logs.map((log, idx) => (
                                <div
                                    key={idx}
                                    className="log-entry"
                                    style={{
                                        backgroundColor: getLevelBgColor(log.level),
                                        borderLeft: `3px solid ${getLevelColor(log.level)}`,
                                    }}
                                >
                                    <span className="log-time">{log.timestamp.slice(11, 19)}</span>
                                    <span
                                        className="log-level"
                                        style={{ color: getLevelColor(log.level) }}
                                    >
                                        [{log.level.toUpperCase()}]
                                    </span>
                                    <span className="log-message">{log.message}</span>
                                    {Object.keys(log.metadata).length > 0 && (
                                        <span className="log-metadata">
                                            {JSON.stringify(log.metadata)}
                                        </span>
                                    )}
                                </div>
                            ))
                        )}
                        <div ref={logEndRef} />
                    </div>

                    {/* Footer */}
                    <div className="log-console-footer">
                        <span>{logs.length} logs</span>
                        <span>
                            {logs.filter((l) => l.level === 'error').length} erreurs,{' '}
                            {logs.filter((l) => l.level === 'warn').length} avertissements
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
