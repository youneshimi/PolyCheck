import { useRef, useEffect } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection } from '@codemirror/view';
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { oneDark } from '@codemirror/theme-one-dark';

// Language imports
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { rust } from '@codemirror/lang-rust';
import { go } from '@codemirror/lang-go';

const LANG_MAP = {
    python: python,
    javascript: () => javascript(),
    typescript: () => javascript({ typescript: true }),
    java: java,
    c: cpp,
    'c++': cpp,
    cpp: cpp,
    rust: rust,
    go: go,
};

// Custom dark theme to match PolyCheck's design
const polycheckTheme = EditorView.theme({
    '&': {
        backgroundColor: 'var(--bg-input)',
        color: 'var(--text)',
        fontSize: '0.875rem',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        height: '100%',
    },
    '&.cm-focused': {
        outline: 'none',
        borderColor: 'var(--accent)',
    },
    '.cm-content': {
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
        padding: '0.75rem 0',
        caretColor: 'var(--accent)',
        minHeight: '300px',
    },
    '.cm-gutters': {
        backgroundColor: 'var(--bg-input)',
        color: 'var(--text-muted)',
        border: 'none',
        borderRight: '1px solid var(--border)',
        paddingRight: '4px',
    },
    '.cm-activeLineGutter': {
        backgroundColor: 'rgba(108, 99, 255, 0.1)',
        color: 'var(--accent)',
    },
    '.cm-activeLine': {
        backgroundColor: 'rgba(108, 99, 255, 0.06)',
    },
    '.cm-selectionBackground': {
        backgroundColor: 'rgba(108, 99, 255, 0.25) !important',
    },
    '.cm-cursor': {
        borderLeftColor: 'var(--accent)',
    },
    '.cm-matchingBracket': {
        backgroundColor: 'rgba(108, 99, 255, 0.3)',
        outline: '1px solid rgba(108, 99, 255, 0.5)',
    },
    '.cm-foldGutter': {
        width: '12px',
    },
    '.cm-scroller': {
        overflow: 'auto',
    },
}, { dark: true });

export default function CodeEditor({ value, onChange, language, disabled }) {
    const containerRef = useRef(null);
    const viewRef = useRef(null);
    const onChangeRef = useRef(onChange);
    const readOnlyComp = useRef(new Compartment());

    // Keep callback ref in sync
    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    // Create editor (recreate on language change)
    useEffect(() => {
        if (!containerRef.current) return;

        const langFn = LANG_MAP[language] || LANG_MAP.python;

        const updateListener = EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                onChangeRef.current(update.state.doc.toString());
            }
        });

        const state = EditorState.create({
            doc: value,
            extensions: [
                lineNumbers(),
                highlightActiveLineGutter(),
                history(),
                foldGutter(),
                drawSelection(),
                rectangularSelection(),
                indentOnInput(),
                bracketMatching(),
                closeBrackets(),
                highlightActiveLine(),
                highlightSelectionMatches(),
                syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
                keymap.of([
                    ...closeBracketsKeymap,
                    ...defaultKeymap,
                    ...searchKeymap,
                    ...historyKeymap,
                    ...foldKeymap,
                    indentWithTab,
                ]),
                oneDark,
                polycheckTheme,
                langFn(),
                updateListener,
                EditorState.tabSize.of(2),
                EditorView.lineWrapping,
                readOnlyComp.current.of(EditorState.readOnly.of(disabled)),
            ],
        });

        const view = new EditorView({
            state,
            parent: containerRef.current,
        });

        viewRef.current = view;

        return () => {
            view.destroy();
            viewRef.current = null;
        };
    }, [language]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sync external value changes (e.g. clearing the editor)
    useEffect(() => {
        const view = viewRef.current;
        if (!view) return;
        const currentDoc = view.state.doc.toString();
        if (value !== currentDoc) {
            view.dispatch({
                changes: { from: 0, to: currentDoc.length, insert: value },
            });
        }
    }, [value]);

    // Sync disabled/readOnly state via Compartment
    useEffect(() => {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch({
            effects: readOnlyComp.current.reconfigure(EditorState.readOnly.of(disabled)),
        });
    }, [disabled]);

    return (
        <div
            ref={containerRef}
            style={{
                height: '100%',
                minHeight: '300px',
                borderRadius: 'var(--radius)',
                overflow: 'hidden',
                opacity: disabled ? 0.6 : 1,
                transition: 'opacity 0.2s',
            }}
        />
    );
}
