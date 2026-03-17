import path from 'node:path';

const EXTENSION_MAP = {
    '.py':   'python',
    '.js':   'javascript',
    '.mjs':  'javascript',
    '.cjs':  'javascript',
    '.ts':   'typescript',
    '.tsx':  'typescript',
    '.java': 'java',
    '.go':   'go',
    '.rs':   'rust',
    '.c':    'c',
    '.h':    'c',
    '.cpp':  'cpp',
    '.cc':   'cpp',
    '.cxx':  'cpp',
    '.hpp':  'cpp',
};

const SUPPORTED_LANGUAGES = ['python', 'javascript', 'typescript', 'java', 'go', 'rust', 'c', 'cpp'];

/**
 * Détecte le langage à partir de l'extension du fichier.
 * @param {string} filename
 * @returns {string|null} Langage détecté ou null
 */
export function detectLanguage(filename) {
    if (!filename) return null;
    const ext = path.extname(filename).toLowerCase();
    return EXTENSION_MAP[ext] || null;
}

export { SUPPORTED_LANGUAGES };
