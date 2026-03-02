import { useState } from 'react';
import IssueCard from './IssueCard.jsx';

const FILTER_OPTS = [
    { value: 'all', label: 'Toutes' },
    { value: 'security', label: '🔒 Sécurité' },
    { value: 'bug', label: '🐛 Bugs' },
    { value: 'style', label: '✨ Style' },
];

const SEVERITY_OPTS = [
    { value: 'all', label: 'Toutes sévérités' },
    { value: 'critical', label: '🚨 Critique' },
    { value: 'high', label: '🔴 Élevé' },
    { value: 'medium', label: '🟡 Moyen' },
    { value: 'low', label: '🟢 Faible' },
];

function StatBadge({ label, value, color }) {
    return (
        <div style={{
            background: 'var(--bg-card)',
            border: `1px solid ${color}44`,
            borderRadius: 'var(--radius)',
            padding: '0.5rem 1rem',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            minWidth: '90px',
        }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color }}>{value}</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>{label}</span>
        </div>
    );
}

export default function AnalysisPanel({ result }) {
    const [catFilter, setCatFilter] = useState('all');
    const [sevFilter, setSevFilter] = useState('all');

    if (!result) return null;

    const { summary, issues = [], warnings = [], review_id, language, filename, metrics } = result;

    // Filtrage
    const filtered = issues.filter(issue => {
        const catOk = catFilter === 'all' || issue.category === catFilter;
        const sevOk = sevFilter === 'all' || issue.severity === sevFilter;
        return catOk && sevOk;
    });

    return (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* ── En-tête résultat ── */}
            <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '1rem 1.25rem',
                display: 'flex', flexDirection: 'column', gap: '0.5rem',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)' }}>
                            ✅ Analyse terminée
                        </h2>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {language.toUpperCase()} {filename ? `· ${filename}` : ''} · ID: {review_id || 'N/A'}
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <StatBadge label="Total" value={summary?.total || 0} color="#6c63ff" />
                        <StatBadge label="Critique" value={summary?.by_severity?.critical || 0} color="#ef4444" />
                        <StatBadge label="Élevé" value={summary?.by_severity?.high || 0} color="#f97316" />
                        <StatBadge label="Sécurité" value={summary?.by_category?.security || 0} color="#ec4899" />
                        <StatBadge label="Bugs" value={summary?.by_category?.bug || 0} color="#f97316" />
                        <StatBadge label="Style" value={summary?.by_category?.style || 0} color="#3b82f6" />
                    </div>
                </div>

                {/* Métriques AST */}
                {metrics && Object.keys(metrics).length > 0 && (
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.8rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                        <span>📄 {metrics.lines_of_code} lignes</span>
                        {metrics.num_functions > 0 && <span>⚙️ {metrics.num_functions} fonctions</span>}
                        {metrics.num_classes > 0 && <span>🏛️ {metrics.num_classes} classes</span>}
                        {metrics.avg_function_length > 0 && <span>📏 moy. {metrics.avg_function_length} lignes/fn</span>}
                    </div>
                )}
            </div>

            {/* ── Avertissements ── */}
            {warnings.length > 0 && (
                <div style={{
                    background: 'rgba(234,179,8,0.08)',
                    border: '1px solid rgba(234,179,8,0.3)',
                    borderRadius: 'var(--radius)',
                    padding: '0.75rem 1rem',
                }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#eab308', marginBottom: '0.3rem' }}>
                        ⚠️ Avertissements
                    </p>
                    {warnings.map((w, i) => (
                        <p key={i} style={{ fontSize: '0.8rem', color: '#fef08a' }}>• {w}</p>
                    ))}
                </div>
            )}

            {/* ── Filtres ── */}
            {issues.length > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Filtrer par :</span>
                    {FILTER_OPTS.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => setCatFilter(opt.value)}
                            style={{
                                padding: '0.3rem 0.8rem',
                                borderRadius: '20px',
                                border: '1px solid',
                                borderColor: catFilter === opt.value ? 'var(--accent)' : 'var(--border)',
                                background: catFilter === opt.value ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)',
                                color: catFilter === opt.value ? 'var(--accent)' : 'var(--text-muted)',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                            }}
                        >
                            {opt.label}
                        </button>
                    ))}

                    <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sévérité :</span>
                    {SEVERITY_OPTS.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => setSevFilter(opt.value)}
                            style={{
                                padding: '0.3rem 0.8rem',
                                borderRadius: '20px',
                                border: '1px solid',
                                borderColor: sevFilter === opt.value ? 'var(--accent)' : 'var(--border)',
                                background: sevFilter === opt.value ? 'rgba(108,99,255,0.15)' : 'var(--bg-card)',
                                color: sevFilter === opt.value ? 'var(--accent)' : 'var(--text-muted)',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                            }}
                        >
                            {opt.label}
                        </button>
                    ))}

                    <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {filtered.length} / {issues.length} issue{issues.length !== 1 ? 's' : ''}
                    </span>
                </div>
            )}

            {/* ── Liste des issues ── */}
            {filtered.length === 0 ? (
                <div style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    padding: '2rem',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                }}>
                    {issues.length === 0
                        ? '🎉 Aucun problème détecté ! Excellent travail.'
                        : '🔍 Aucune issue ne correspond aux filtres sélectionnés.'}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {filtered.map((issue, idx) => (
                        <IssueCard key={`${issue.category}-${issue.line}-${idx}`} issue={issue} />
                    ))}
                </div>
            )}
        </section>
    );
}
