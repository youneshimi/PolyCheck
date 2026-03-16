import { useState, useCallback, useEffect } from 'react';
import { analyzeCode } from './api/client.js';
import CodeEditor from './components/CodeEditor.jsx';
import LanguageSelector from './components/LanguageSelector.jsx';
import AnalysisPanel from './components/AnalysisPanel.jsx';
import LogConsole from './components/LogConsole.jsx';
import './App.css';

function getInitialTheme() {
    const saved = localStorage.getItem('polycheck-theme');
    if (saved) return saved;
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export default function App() {
    const [code, setCode] = useState('');
    const [language, setLanguage] = useState('python');
    const [filename, setFilename] = useState('');
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [theme, setTheme] = useState(getInitialTheme);

    const isDark = theme === 'dark';

    // Apply theme to document
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('polycheck-theme', theme);
    }, [theme]);

    const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

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
                <div className="header-content">
                    <div className="header-brand">
                        <span className="header-icon"></span>
                        <h1>PolyCheck</h1>
                        <span className="header-tagline">Analyseur de code IA multi-langages</span>
                    </div>
                    <button
                        className="theme-toggle"
                        onClick={toggleTheme}
                        title={isDark ? 'Passer au thème clair' : 'Passer au thème sombre'}
                        aria-label="Toggle theme"
                    >
                        <span className="theme-toggle-icon">
                            {isDark ? (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="5"/>
                                    <line x1="12" y1="1" x2="12" y2="3"/>
                                    <line x1="12" y1="21" x2="12" y2="23"/>
                                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                                    <line x1="1" y1="12" x2="3" y2="12"/>
                                    <line x1="21" y1="12" x2="23" y2="12"/>
                                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                                </svg>
                            ) : (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                                </svg>
                            )}
                        </span>
                        <span className="theme-toggle-label">{isDark ? 'Clair' : 'Sombre'}</span>
                    </button>
                </div>
            </header>

            {/* ── Split Panel Layout ── */}
            <main className="app-main">
                {/* LEFT: Code Editor Panel */}
                <section className="panel-left">
                    <div className="panel-header">
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
                        </div>
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

                    <div className="editor-wrapper">
                        <CodeEditor
                            value={code}
                            onChange={setCode}
                            language={language}
                            disabled={loading}
                            isDark={isDark}
                        />
                    </div>

                    <div className="code-meta">
                        <span>{code.length.toLocaleString()} caractères</span>
                        <span>{code.split('\n').length} lignes</span>
                    </div>
                </section>

                {/* RIGHT: Results Panel */}
                <section className="panel-right">
                    {error && (
                        <div className="error-banner" role="alert">
                            <span>⚠️</span> {error}
                        </div>
                    )}

                    {result ? (
                        <AnalysisPanel result={result} />
                    ) : (
                        <div className="empty-results">
                            <div className="empty-results-icon">📋</div>
                            <h3>Résultats d'analyse</h3>
                            <p>Collez votre code à gauche et cliquez sur <strong>⚡ Analyser</strong> pour voir les résultats ici.</p>
                        </div>
                    )}
                </section>
            </main>

            <footer className="app-footer">
                PolyCheck MVP — Propulsé par GroqCloud (llama3-70b-8192)
            </footer>

            {/* ── Console de logs ── */}
            <LogConsole />
        </div>
    );
}
