/**
 * Client HTTP pour l'API PolyCheck Backend.
 */

export class ApiClient {
    constructor(baseUrl = 'http://localhost:3001') {
        this.baseUrl = baseUrl.replace(/\/+$/, '');
    }

    /**
     * Lance une analyse de code.
     * @param {string} code
     * @param {string} language
     * @param {string|null} filename
     * @returns {Promise<object>}
     */
    async analyze(code, language, filename = null) {
        const body = { code, language };
        if (filename) body.filename = filename;

        return this._post('/api/analyze', body);
    }

    /**
     * Liste les reviews paginées.
     * @param {number} page
     * @param {number} limit
     * @returns {Promise<object>}
     */
    async listReviews(page = 1, limit = 20) {
        return this._get(`/api/reviews?page=${page}&limit=${limit}`);
    }

    /**
     * Récupère le détail d'une review.
     * @param {string} id
     * @returns {Promise<object>}
     */
    async getReview(id) {
        return this._get(`/api/reviews/${id}`);
    }

    /**
     * Health check du backend.
     * @returns {Promise<object>}
     */
    async health() {
        return this._get('/health');
    }

    // ── Helpers HTTP ─────────────────────────────────────────────────────────

    async _get(path) {
        return this._request('GET', path);
    }

    async _post(path, body) {
        return this._request('POST', path, body);
    }

    async _request(method, path, body = null) {
        const url = `${this.baseUrl}${path}`;
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (body) opts.body = JSON.stringify(body);

        let response;
        try {
            response = await fetch(url, opts);
        } catch (err) {
            if (err.cause?.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
                throw new Error(
                    `Impossible de joindre le backend PolyCheck à ${this.baseUrl}.\n` +
                    `Vérifiez que la stack est démarrée (docker compose up).`
                );
            }
            throw new Error(`Erreur réseau : ${err.message}`);
        }

        if (response.status === 204) return {};

        let data;
        try {
            data = await response.json();
        } catch {
            throw new Error(`Réponse invalide du serveur (HTTP ${response.status})`);
        }

        if (!response.ok) {
            throw new Error(data.error || `Erreur HTTP ${response.status}`);
        }

        return data;
    }
}
