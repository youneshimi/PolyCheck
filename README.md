# PolyCheck 🔍

> Analyseur de code multi-langages propulsé par GroqCloud (llama-3.3-70b-versatile)

PolyCheck effectue **3 analyses IA parallèles** (bugs, sécurité, style) + une **analyse AST statique**, agrège les résultats par priorité et les persiste en MySQL.

---

## Stack technique

| Composant       | Technologie                        |
|-----------------|-------------------------------------|
| Frontend        | Vite + React 18                    |
| Backend         | Node.js 20 + Express 4             |
| Service AST     | Python 3.12 + FastAPI + ast stdlib |
| IA              | GroqCloud – llama-3.3-70b-versatile  |
| Base de données | MySQL 8.0                          |
| Admin DB        | phpMyAdmin                         |
| Orchestration   | Docker Compose                     |

---

## Ports exposés

| Service      | Port  | URL                   |
|--------------|-------|-----------------------|
| Frontend     | 5173  | http://localhost:5173 |
| Backend API  | 3001  | http://localhost:3001 |
| Service AST  | 8000  | http://localhost:8000 |
| phpMyAdmin   | 8080  | http://localhost:8080 |
| MySQL        | 3306  | localhost:3306        |

---

## Modèle Groq & Fallback automatique

PolyCheck utilise deux variables d'environnement pour gérer les évolutions des modèles GroqCloud :

| Variable             | Rôle                                            | Défaut                   |
|----------------------|-------------------------------------------------|--------------------------|
| `GROQ_MODEL`         | Modèle principal utilisé pour les 3 analyses     | `llama-3.3-70b-versatile`|
| `GROQ_MODEL_FALLBACK`| Modèle de secours si le principal est décommisionné | `llama-3.1-8b-instant`|

**Comportement en cas de modèle décommissionné :**
1. Groq répond avec `code: "model_decommissioned"`
2. PolyCheck relance **automatiquement** la même requête avec `GROQ_MODEL_FALLBACK`
3. Si le fallback échoue aussi → `issues: []` + warning explicite dans la réponse
4. L'analyse AST Python continue indépendamment des erreurs Groq

**Changer de modèle :** éditer `.env` puis `docker compose up --build`
```
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_MODEL_FALLBACK=llama-3.1-8b-instant
```

---

## Démarrage rapide

### 1. Prérequis
- [Docker Desktop](https://www.docker.com/products/docker-desktop) ≥ 24
- Clé API GroqCloud : https://console.groq.com/keys

### 2. Configuration
```bash
cp .env.example .env
# Éditez .env et renseignez votre GROQ_API_KEY
```

### 3. Lancement
```bash
docker compose up --build
```

> Le premier démarrage peut prendre 2-3 minutes (téléchargement des images + build).

### 4. Accès
- Interface web : http://localhost:5173
- phpMyAdmin   : http://localhost:8080

---

## API Reference

### `POST /api/analyze`
Analyse un extrait de code.

**Corps (JSON) :**
```json
{
  "code":     "def hello():\n  print('world')",
  "language": "python",
  "filename": "hello.py"
}
```

**Réponse :**
```json
{
  "review_id": "uuid",
  "language":  "python",
  "summary": {
    "total": 2,
    "by_severity": { "critical": 0, "high": 1, "medium": 1, "low": 0 },
    "by_category": { "security": 0, "bug": 1, "style": 1 }
  },
  "issues": [
    {
      "category":   "bug",
      "severity":   "high",
      "line":       3,
      "rule":       "bare-except",
      "message":    "Clause except sans type.",
      "suggestion": "Spécifiez le type d'exception.",
      "source":     "ast"
    }
  ],
  "warnings": []
}
```

**Codes d'erreur :**
| Code | Cas                        |
|------|----------------------------|
| 400  | Code vide ou champ manquant |
| 413  | Fichier > 50 Ko            |
| 422  | Langage non supporté       |
| 503  | MySQL indisponible         |

---

### `GET /api/reviews`
Liste paginée des analyses.

**Query params :** `page` (défaut 1), `limit` (défaut 20, max 100)

---

### `GET /api/reviews/:id`
Détail d'une analyse avec toutes ses issues.

---

### `DELETE /api/reviews/:id`
Supprime une analyse.

---

### `GET /health` (backend)
```json
{ "status": "ok", "timestamp": "2026-03-02T15:34:08.000Z" }
```

### `GET /health` (service Python AST)
```json
{ "status": "ok", "service": "polycheck-python-ast" }
```

---

## Tests rapides avec curl

```bash
# Health check backend
curl http://localhost:3001/health

# Health check service Python
curl http://localhost:8000/health

# Analyser du code Python
curl -X POST http://localhost:3001/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "code": "import os\npassword = \"admin123\"\ndef divide(a, b):\n    return a / b\n",
    "language": "python",
    "filename": "test.py"
  }'

# Lister les reviews
curl "http://localhost:3001/api/reviews?page=1&limit=5"

# Tester fichier vide (doit retourner 400)
curl -X POST http://localhost:3001/api/analyze \
  -H "Content-Type: application/json" \
  -d '{ "code": "", "language": "python" }'

# Tester langage non supporté (doit retourner 422)
curl -X POST http://localhost:3001/api/analyze \
  -H "Content-Type: application/json" \
  -d '{ "code": "print(\"hello\")", "language": "cobol" }'
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Docker Compose                       │
│                                                          │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │ Frontend │───>│   Backend    │───>│ Python AST    │  │
│  │  :5173   │    │   :3001      │    │   :8000       │  │
│  └──────────┘    │  (Express)   │    │  (FastAPI)    │  │
│                  │              │    └───────────────┘  │
│                  │  ┌─────────┐ │                        │
│                  │  │  Groq   │ │    ┌───────────────┐  │
│                  │  │ (3x IA) │ │───>│   MySQL :3306 │  │
│                  │  └─────────┘ │    └───────────────┘  │
│                  └──────────────┘                        │
│                                                          │
│  ┌──────────────┐                                        │
│  │ phpMyAdmin   │                                        │
│  │    :8080     │                                        │
│  └──────────────┘                                        │
└─────────────────────────────────────────────────────────┘
```

### Flux d'analyse
1. Frontend envoie `POST /api/analyze`
2. Backend valide (taille, langue, code non vide)
3. Backend lance **en parallèle** :
   - Appel service Python AST (analyse statique)
   - 3 appels Groq simultanés (bugs / sécurité / style)
4. Aggregateur fusionne, déduplique et trie par priorité :
   `critical > high > medium > low` | `security > bug > style`
5. Persistance MySQL (review + issues)
6. Retour JSON complet au frontend

---

## Cas limites gérés

| Cas                    | Comportement                              |
|------------------------|-------------------------------------------|
| Fichier vide           | HTTP 400 – message explicite              |
| Fichier trop gros > 50 Ko | HTTP 413 – taille indiquée            |
| Langage non supporté   | HTTP 422 – langues supportées listées     |
| JSON Groq invalide     | Fallback `issues: []` + warning retourné  |
| Timeout Groq (>30s)    | Fallback + warning                        |
| Timeout Python (>10s)  | Fallback + warning                        |
| MySQL down             | L'analyse retourne quand même (sans persistance) + log |
| Service Python down    | Analyse Groq continue, AST skippé + warning |

---

## Développement local (sans Docker)

```bash
# MySQL : démarrez via Docker seul
docker compose up mysql phpmyadmin -d

# Backend
cd backend && npm install
cp ../.env.example ../.env  # configurez .env
node src/index.js

# Python AST
cd python-service && pip install -r requirements.txt
uvicorn app:app --reload --port 8000

# Frontend
cd frontend && npm install
npm run dev
```

---

## Langages supportés
`python` · `javascript` · `typescript` · `java` · `go` · `rust` · `c` · `cpp`

---

## Licence
MIT
