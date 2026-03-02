const SEVERITY_CONFIG = {
    critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'CRITIQUE', icon: '🚨' },
    high: { color: '#f97316', bg: 'rgba(249,115,22,0.1)', label: 'ÉLEVÉ', icon: '🔴' },
    medium: { color: '#eab308', bg: 'rgba(234,179,8,0.1)', label: 'MOYEN', icon: '🟡' },
    low: { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', label: 'FAIBLE', icon: '🟢' },
};

const CATEGORY_CONFIG = {
    security: { color: '#ec4899', icon: '🔒', label: 'Sécurité' },
    bug: { color: '#f97316', icon: '🐛', label: 'Bug' },
    style: { color: '#3b82f6', icon: '✨', label: 'Style' },
};

export default function IssueCard({ issue }) {
    const sev = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.low;
    const cat = CATEGORY_CONFIG[issue.category] || CATEGORY_CONFIG.style;

    return (
        <div
            style={{
                background: sev.bg,
                border: `1px solid ${sev.color}33`,
                borderLeft: `4px solid ${sev.color}`,
                borderRadius: 'var(--radius)',
                padding: '0.9rem 1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
            }}
        >
            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                {/* Sévérité */}
                <span
                    style={{
                        background: sev.color,
                        color: '#fff',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        letterSpacing: '0.5px',
                    }}
                >
                    {sev.icon} {sev.label}
                </span>

                {/* Catégorie */}
                <span
                    style={{
                        background: `${cat.color}22`,
                        color: cat.color,
                        border: `1px solid ${cat.color}44`,
                        padding: '0.15rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                    }}
                >
                    {cat.icon} {cat.label}
                </span>

                {/* Règle */}
                {issue.rule && (
                    <code
                        style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)',
                            background: 'rgba(255,255,255,0.05)',
                            padding: '0.1rem 0.4rem',
                            borderRadius: '4px',
                        }}
                    >
                        {issue.rule}
                    </code>
                )}

                {/* Ligne */}
                {issue.line && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                        Ligne {issue.line}
                    </span>
                )}
            </div>

            {/* ── Message ── */}
            <p style={{ fontSize: '0.9rem', color: 'var(--text)', lineHeight: '1.5' }}>
                {issue.message}
            </p>

            {/* ── Suggestion ── */}
            {issue.suggestion && (
                <div
                    style={{
                        background: 'rgba(108,99,255,0.08)',
                        border: '1px solid rgba(108,99,255,0.2)',
                        borderRadius: '6px',
                        padding: '0.5rem 0.75rem',
                        fontSize: '0.85rem',
                        color: '#a5b4fc',
                        display: 'flex',
                        gap: '0.4rem',
                        alignItems: 'flex-start',
                    }}
                >
                    <span>💡</span>
                    <span>{issue.suggestion}</span>
                </div>
            )}

            {/* Source */}
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                Source : {issue.source === 'groq' ? '🤖 GroqCloud' : '🔬 AST'}
            </div>
        </div>
    );
}
