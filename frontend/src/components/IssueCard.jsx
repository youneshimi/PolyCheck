const SEVERITY_CONFIG = {
    critical: { color: 'var(--critical)', label: 'CRITIQUE', icon: '🚨' },
    high:     { color: 'var(--high)',     label: 'ELEVE',    icon: '🔴' },
    medium:   { color: 'var(--medium)',   label: 'MOYEN',    icon: '🟡' },
    low:      { color: 'var(--low)',      label: 'FAIBLE',   icon: '🟢' },
};

const CATEGORY_CONFIG = {
    security: { color: 'var(--security)', icon: '🔒', label: 'Securite' },
    bug:      { color: 'var(--bug)',      icon: '🐛', label: 'Bug' },
    style:    { color: 'var(--style-c)',  icon: '✨', label: 'Style' },
};

export default function IssueCard({ issue }) {
    const sev = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.low;
    const cat = CATEGORY_CONFIG[issue.category] || CATEGORY_CONFIG.style;

    return (
        <div
            style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderLeft: `4px solid ${sev.color}`,
                borderRadius: 'var(--radius)',
                padding: '0.9rem 1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
                transition: 'background 0.25s ease, border-color 0.25s ease',
            }}
        >
            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
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

                <span
                    style={{
                        background: 'var(--accent-bg)',
                        color: cat.color,
                        border: '1px solid var(--border)',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                    }}
                >
                    {cat.icon} {cat.label}
                </span>

                {issue.rule && (
                    <code
                        style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)',
                            background: 'var(--code-bg)',
                            padding: '0.1rem 0.4rem',
                            borderRadius: '4px',
                        }}
                    >
                        {issue.rule}
                    </code>
                )}

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
                        background: 'var(--suggestion-bg)',
                        border: '1px solid var(--suggestion-border)',
                        borderRadius: '6px',
                        padding: '0.5rem 0.75rem',
                        fontSize: '0.85rem',
                        color: 'var(--accent)',
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
