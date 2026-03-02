export default function CodeEditor({ value, onChange, language, disabled }) {
    return (
        <div style={{ position: 'relative' }}>
            <div
                style={{
                    position: 'absolute',
                    top: '0.5rem',
                    right: '0.75rem',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    pointerEvents: 'none',
                    zIndex: 1,
                }}
            >
                {language}
            </div>
            <textarea
                value={value}
                onChange={e => onChange(e.target.value)}
                disabled={disabled}
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                placeholder={`Collez votre code ${language} ici…`}
                style={{
                    width: '100%',
                    minHeight: '380px',
                    padding: '1rem',
                    paddingTop: '2rem',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    color: 'var(--text)',
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
                    fontSize: '0.875rem',
                    lineHeight: '1.6',
                    resize: 'vertical',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    opacity: disabled ? 0.6 : 1,
                    cursor: disabled ? 'not-allowed' : 'text',
                    tabSize: 2,
                }}
                onFocus={e => { e.target.style.borderColor = 'var(--accent)'; }}
                onBlur={e => { e.target.style.borderColor = 'var(--border)'; }}
                onKeyDown={e => {
                    // Gestion de la touche Tab pour indentation
                    if (e.key === 'Tab') {
                        e.preventDefault();
                        const start = e.target.selectionStart;
                        const end = e.target.selectionEnd;
                        const newValue = value.substring(0, start) + '  ' + value.substring(end);
                        onChange(newValue);
                        requestAnimationFrame(() => {
                            e.target.selectionStart = e.target.selectionEnd = start + 2;
                        });
                    }
                }}
            />
        </div>
    );
}
