import { useRef, useEffect } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection } from '@codemirror/view';
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { oneDark } from '@codemirror/theme-one-dark';

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

function createPolycheckTheme(isDark) {
    return EditorView.theme({
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
            backgroundColor: isDark ? 'rgba(189, 147, 249, 0.1)' : 'rgba(124, 58, 237, 0.08)',
            color: 'var(--accent)',
        },
        '.cm-activeLine': {
            backgroundColor: isDark ? 'rgba(189, 147, 249, 0.06)' : 'rgba(124, 58, 237, 0.04)',
        },
        '.cm-selectionBackground': {
            backgroundColor: isDark ? 'rgba(189, 147, 249, 0.25) !important' : 'rgba(124, 58, 237, 0.15) !important',
        },
        '.cm-cursor': {
            borderLeftColor: 'var(--accent)',
        },
        '.cm-matchingBracket': {
            backgroundColor: isDark ? 'rgba(189, 147, 249, 0.3)' : 'rgba(124, 58, 237, 0.2)',
            outline: isDark ? '1px solid rgba(189, 147, 249, 0.5)' : '1px solid rgba(124, 58, 237, 0.4)',
        },
        '.cm-foldGutter': {
            width: '12px',
        },
        '.cm-scroller': {
            overflow: 'auto',
        },
    }, { dark: isDark });
}

export default function CodeEditor({ value, onChange, language, disabled, isDark = true }) {
    const containerRef = useRef(null);
    const viewRef = useRef(null);
    const onChangeRef = useRef(onChange);
    const readOnlyComp = useRef(new Compartment());

    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    // Create editor (recreate on language or theme change)
    useEffect(() => {
        if (!containerRef.current) return;

        const langFn = LANG_MAP[language] || LANG_MAP.python;

        const updateListener = EditorView.updateListener.of((update) => {
            if (update.docChanged) {
                onChangeRef.current(update.state.doc.toString());
            }
        });

        const extensions = [
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
        ];

        // Dark mode: oneDark syntax highlighting
        if (isDark) {
            extensions.push(oneDark);
        }

        extensions.push(
            createPolycheckTheme(isDark),
            langFn(),
            updateListener,
            EditorState.tabSize.of(2),
            EditorView.lineWrapping,
            readOnlyComp.current.of(EditorState.readOnly.of(disabled)),
        );

        const state = EditorState.create({ doc: value, extensions });

        const view = new EditorView({
            state,
            parent: containerRef.current,
        });

        viewRef.current = view;

        return () => {
            view.destroy();
            viewRef.current = null;
        };
    }, [language, isDark]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sync external value changes
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

    // Sync disabled state
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
