import { useState, useCallback } from 'react';
import { analyzeCode } from './api/client.js';
import CodeEditor from './components/CodeEditor.jsx';
import LanguageSelector from './components/LanguageSelector.jsx';
import AnalysisPanel from './components/AnalysisPanel.jsx';
import LogConsole from './components/LogConsole.jsx';
import './App.css';

export default function App() {
    const [code, setCode] = useState('');
    const [language, setLanguage] = useState('python');
    const [filename, setFilename] = useState('');
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleAnalyze = useCallback(async () => {
        if (!code.trim()) {
            setError('Le code ne peut pas être vide.');
            return;
        }

        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const data = await analyzeCode({ code, language, filename: filename || null });
            setResult(data);
        } catch (err) {
            setError(err.message || 'Une erreur inattendue est survenue.');
        } finally {
            setLoading(false);
        }
    }, [code, language, filename]);

    return (
        <div className="app">
            {/* ── Header ── */}
            <header className="app-header">
                <div className="header-brand">
                    <span className="header-icon">🔍</span>
                    <h1>PolyCheck</h1>
                    <span className="header-tagline">Analyseur de code IA multi-langages</span>
                </div>
            </header>

            {/* ── Zone de saisie ── */}
            <main className="app-main">
                <section className="input-section">
                    <div className="input-controls">
                        <LanguageSelector value={language} onChange={setLanguage} />

                        <input
                            className="filename-input"
                            type="text"
                            placeholder="Nom du fichier (optionnel, ex: main.py)"
                            value={filename}
                            onChange={e => setFilename(e.target.value)}
                            disabled={loading}
                        />

                        <button
                            className={`analyze-btn ${loading ? 'loading' : ''}`}
                            onClick={handleAnalyze}
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <span className="spinner" />
                                    Analyse en cours…
                                </>
                            ) : (
                                '⚡ Analyser'
                            )}
                        </button>
                    </div>

                    <CodeEditor
                        value={code}
                        onChange={setCode}
                        language={language}
                        disabled={loading}
                    />

                    {/* Compteur de caractères */}
                    <div className="code-meta">
                        <span>{code.length.toLocaleString()} caractères</span>
                        <span>{code.split('\n').length} lignes</span>
                    </div>
                </section>

                {/* ── Erreur ── */}
                {error && (
                    <div className="error-banner" role="alert">
                        <span>⚠️</span> {error}
                    </div>
                )}

                {/* ── Résultats ── */}
                {result && (
                    <AnalysisPanel result={result} />
                )}
            </main>

            <footer className="app-footer">
                PolyCheck MVP — Propulsé par GroqCloud (llama3-70b-8192)
            </footer>

            {/* ── Console de logs ── */}
            <LogConsole />
        </div>
    );
}
