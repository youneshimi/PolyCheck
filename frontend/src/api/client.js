const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

/**
 * Analyse du code via le backend PolyCheck.
 */
export async function analyzeCode({ code, language, filename = null }) {
    const res = await fetch(`${API_BASE}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language, filename }),
    });

    const data = await res.json();

    if (!res.ok) {
        const err = new Error(data.error || `Erreur HTTP ${res.status}`);
        err.status = res.status;
        throw err;
    }

    return data;
}

/**
 * Liste des reviews avec pagination.
 */
export async function fetchReviews({ page = 1, limit = 20 } = {}) {
    const res = await fetch(`${API_BASE}/api/reviews?page=${page}&limit=${limit}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur chargement reviews');
    return data;
}

/**
 * Détail d'une review par ID.
 */
export async function fetchReview(id) {
    const res = await fetch(`${API_BASE}/api/reviews/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Review introuvable');
    return data;
}
