const LANGUAGES = [
    { value: 'python', label: '🐍 Python' },
    { value: 'javascript', label: '⚡ JavaScript' },
    { value: 'typescript', label: '🟦 TypeScript' },
    { value: 'java', label: '☕ Java' },
    { value: 'go', label: '🐹 Go' },
    { value: 'rust', label: '🦀 Rust' },
    { value: 'c', label: '🔧 C' },
    { value: 'cpp', label: '🔧 C++' },
];

export default function LanguageSelector({ value, onChange }) {
    return (
        <select
            className="lang-selector"
            value={value}
            onChange={e => onChange(e.target.value)}
            style={{
                padding: '0.6rem 0.9rem',
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text)',
                fontSize: '0.9rem',
                cursor: 'pointer',
                outline: 'none',
                minWidth: '160px',
            }}
        >
            {LANGUAGES.map(lang => (
                <option key={lang.value} value={lang.value}>
                    {lang.label}
                </option>
            ))}
        </select>
    );
}
