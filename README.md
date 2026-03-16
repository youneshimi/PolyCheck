# PolyCheck

> Analyseur de code multi-langages propulsé par l'IA (GroqCloud) + Analyse AST statique + RAG

PolyCheck combine **3 analyses IA parallèles** (bugs, sécurité, style), une **analyse AST statique** et un système **RAG** (Retrieval Augmented Generation) pour fournir des revues de code intelligentes. Les résultats sont dédupliqués, priorisés et persistés en MySQL. Un **serveur MCP** expose toutes les fonctionnalités aux clients IA (Claude, etc.).

---

## Table des matières

- [Stack technique](#stack-technique)
- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Démarrage rapide](#démarrage-rapide)
- [Services & Ports](#services--ports)
- [Variables d'environnement](#variables-denvironnement)
- [Interface utilisateur](#interface-utilisateur)
- [API Backend (REST)](#api-backend-rest)
- [Serveur MCP (JSON-RPC 2.0)](#serveur-mcp-json-rpc-20)
- [Service Python AST](#service-python-ast)
- [Système RAG](#système-rag)
- [Moteur de déduplication](#moteur-de-déduplication)
- [Schéma de base de données](#schéma-de-base-de-données)
- [Modèle Groq & Fallback](#modèle-groq--fallback)
- [Système de logs](#système-de-logs)
- [Cas limites gérés](#cas-limites-gérés)
- [Tests rapides (curl)](#tests-rapides-curl)
- [Développement local](#développement-local-sans-docker)
- [Langages supportés](#langages-supportés)
- [Licence](#licence)

---

## Stack technique

| Composant        | Technologie                                  |
|------------------|----------------------------------------------|
| Frontend         | Vite + React 18 + CodeMirror 6               |
| Backend          | Node.js 20 + Express 4                       |
| Service AST      | Python 3.12 + FastAPI + ast stdlib            |
| Serveur MCP      | PHP 8.1 + Guzzle (JSON-RPC 2.0)              |
| IA               | GroqCloud – llama-3.3-70b-versatile           |
| RAG              | ChromaDB + Sentence-Transformers (all-MiniLM) |
| Base de données  | MySQL 8.0                                    |
| Admin DB         | phpMyAdmin                                   |
| Orchestration    | Docker Compose (6 services)                  |

---

## Fonctionnalités

### Analyse de code

| Fonctionnalité                        | Description                                                              |
|---------------------------------------|--------------------------------------------------------------------------|
| **3 analyses IA parallèles**          | Groq LLM analyse bugs, sécurité et style en simultané                    |
| **Analyse AST statique**              | Parsing natif Python (`ast`) + heuristiques pour les autres langages     |
| **RAG (best practices)**              | Augmente les prompts IA avec des patterns de bonnes pratiques (ChromaDB) |
| **Déduplication intelligente**        | Fusion cross-source, canonicalisation des règles, matching flou ±3 lignes |
| **Cap à 12 issues**                   | Signal > bruit : les issues les plus critiques en priorité               |
| **Fallback modèle IA**               | Retry automatique sur modèle de secours si le principal est décommissionné |
| **8 langages supportés**              | Python, JavaScript, TypeScript, Java, Go, Rust, C, C++                   |

### Interface utilisateur

| Fonctionnalité                        | Description                                                              |
|---------------------------------------|--------------------------------------------------------------------------|
| **Éditeur CodeMirror 6**              | Numéros de lignes, coloration syntaxique, fold, bracket matching, undo   |
| **Layout split-panel**                | Éditeur à gauche, résultats à droite (responsive : empilé sur mobile)    |
| **Thème Dracula / Light**             | Toggle dans le header, persisté en localStorage, détecte le système      |
| **Filtres d'issues**                  | Par catégorie (sécurité, bug, style) et par sévérité                     |
| **Statistiques visuelles**            | Badges colorés : total, critique, élevé, sécurité, bugs, style          |
| **Métriques de code**                 | Lignes, fonctions, classes, longueur moyenne des fonctions               |
| **Console de logs flottante**         | Logs temps réel du backend avec auto-scroll et filtres                   |

### Intégration & API

| Fonctionnalité                        | Description                                                              |
|---------------------------------------|--------------------------------------------------------------------------|
| **API REST complète**                 | CRUD analyses + logs + health checks                                     |
| **Serveur MCP (11 outils)**           | Intégration Claude/AI via JSON-RPC 2.0 (analyse, reviews, RAG)          |
| **Persistance MySQL**                 | Reviews, issues et logs avec cascade delete                              |
| **Rétention automatique**             | Nettoyage auto des logs (garde les 5 dernières analyses)                 |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Docker Compose                         │
│                                                               │
│  ┌───────────┐     ┌──────────────┐     ┌─────────────────┐  │
│  │ Frontend  │────>│   Backend    │────>│  Python AST     │  │
│  │  :5173    │     │   :3001      │     │  + RAG :8000    │  │
│  │ (React +  │     │  (Express)   │     │  (FastAPI +     │  │
│  │ CodeMirror│     │              │     │   ChromaDB)     │  │
│  └───────────┘     │  ┌────────┐  │     └─────────────────┘  │
│                    │  │ Groq   │  │                            │
│  ┌───────────┐     │  │ (3x IA)│  │     ┌─────────────────┐  │
│  │ MCP Server│────>│  └────────┘  │────>│  MySQL :3306    │  │
│  │  :3002    │     └──────────────┘     └─────────────────┘  │
│  │  (PHP)    │                                                │
│  └───────────┘     ┌──────────────┐                           │
│                    │ phpMyAdmin   │                            │
│                    │   :8080      │                            │
│                    └──────────────┘                            │
└──────────────────────────────────────────────────────────────┘
```

### Flux d'analyse complet

```
Utilisateur saisit du code dans l'éditeur
    │
    ▼
Frontend → POST /api/analyze (backend:3001)
    │
    ▼
Backend valide : langage, taille (≤ 50 Ko), code non vide
    │
    ▼
[EXÉCUTION PARALLÈLE]
    │
    ├──→ Service Python (:8000)
    │    ├── Parse AST natif (Python)
    │    ├── Analyse heuristique (autres langages)
    │    └── Retourne : issues + métriques
    │
    └──→ 3× Appels Groq (LLM)
         ├── Analyse bugs (erreurs logiques, runtime)
         ├── Analyse sécurité (OWASP, injections, secrets)
         ├── Analyse style (conventions, complexité, DRY)
         │
         └── + Augmentation RAG (optionnel)
              └── Top 3 patterns ChromaDB injectés dans le prompt
    │
    ▼
Moteur d'agrégation
    ├── Canonicalisation des règles
    ├── Dédup exacte (règle | ligne)
    ├── Dédup floue (±3 lignes pour bare-except, division-by-zero)
    ├── Fusion : sévérité max, sources combinées (ast+groq)
    ├── Tri : sévérité ↓ → catégorie ↓ → ligne ↑
    └── Cap : max 12 issues
    │
    ▼
Persistance MySQL (non-bloquante)
    ├── INSERT review + issues + logs
    └── Nettoyage auto (rétention 5 analyses)
    │
    ▼
Réponse JSON → Frontend affiche résultats
```

### Layout UI

```
┌──────────────────────────────────────┐
│  Header              [☀ Clair]      │
├──────────────┬───────────────────────┤
│  CodeMirror  │  Résultats d'analyse  │
│  (éditeur    │  ┌─────────────────┐  │
│   + colora-  │  │ Stats badges    │  │
│   tion syn-  │  │ Filtres         │  │
│   taxique)   │  │ Issue cards     │  │
│              │  │ Métriques       │  │
│              │  └─────────────────┘  │
├──────────────┴───────────────────────┤
│  Footer              [📋 Logs]      │
└──────────────────────────────────────┘
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

| Service     | URL                   |
|-------------|-----------------------|
| Interface   | http://localhost:5173  |
| phpMyAdmin  | http://localhost:8080  |
| API Backend | http://localhost:3001  |
| MCP Server  | http://localhost:3002  |

---

## Services & Ports

| Service        | Port | Technologie        | Rôle                                      |
|----------------|------|--------------------|-------------------------------------------|
| **frontend**   | 5173 | React + Vite       | Interface web (éditeur + résultats)        |
| **backend**    | 3001 | Node.js + Express  | API REST, orchestration, intégration Groq  |
| **python-service** | 8000 | FastAPI        | Analyse AST statique + gestion RAG         |
| **mcp-server** | 3002 | PHP 8.1 + Guzzle   | Serveur MCP (JSON-RPC 2.0) pour clients IA |
| **mysql**      | 3306 | MySQL 8.0          | Persistance (reviews, issues, logs)        |
| **phpmyadmin** | 8080 | phpMyAdmin         | Administration base de données             |

**Réseau** : `polycheck_net` (bridge Docker)
**Volume** : `mysql_data` (données MySQL persistantes)

---

## Variables d'environnement

```bash
# ─── GroqCloud ───────────────────────────────────────────
GROQ_API_KEY=my-groq-api-key-here         # Clé API (obligatoire)
GROQ_MODEL=llama-3.3-70b-versatile        # Modèle principal
GROQ_MODEL_FALLBACK=llama-3.1-8b-instant  # Modèle de secours
GROQ_TIMEOUT_MS=30000                     # Timeout appels Groq (ms)

# ─── MySQL ───────────────────────────────────────────────
MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_USER=polycheck
MYSQL_PASSWORD=polycheck_secret
MYSQL_DATABASE=polycheck_db
MYSQL_ROOT_PASSWORD=root_secret

# ─── Backend ─────────────────────────────────────────────
BACKEND_PORT=3001
NODE_ENV=development

# ─── Service Python ──────────────────────────────────────
PYTHON_SERVICE_URL=http://python-service:8000
PYTHON_TIMEOUT_MS=10000                   # Timeout appels Python (ms)

# ─── RAG ─────────────────────────────────────────────────
RAG_ENABLED=true                          # Activer/désactiver le RAG
CHROMA_DB_PATH=/tmp/polycheck_chroma      # Chemin base vectorielle

# ─── Limites ─────────────────────────────────────────────
MAX_FILE_SIZE_BYTES=51200                 # Taille max fichier (50 Ko)
SUPPORTED_LANGUAGES=python,javascript,typescript,java,go,rust,c,cpp

# ─── MCP ─────────────────────────────────────────────────
MCP_SERVER_PORT=3002

# ─── Frontend ────────────────────────────────────────────
VITE_API_BASE_URL=http://localhost:3001
```

---

## Interface utilisateur

### Éditeur de code (CodeMirror 6)

- Coloration syntaxique pour les 8 langages
- Numéros de lignes, fold/unfold, bracket matching
- Auto-indentation, fermeture automatique des crochets/parenthèses
- Undo/redo (historique), recherche (Ctrl+F)
- Police monospace : JetBrains Mono, Fira Code, Cascadia Code
- Compteur de caractères et de lignes

### Thèmes

| Propriété      | Dracula (sombre)      | Light (clair)         |
|----------------|-----------------------|-----------------------|
| Background     | `#282a36`             | `#f0f2f5`             |
| Cartes         | `#343746`             | `#ffffff`             |
| Accent         | `#bd93f9` (purple)    | `#7c3aed` (purple)    |
| Texte          | `#f8f8f2`             | `#1e293b`             |
| Texte muted    | `#6272a4`             | `#64748b`             |
| Critical       | `#ff5555`             | `#dc2626`             |
| High           | `#ffb86c`             | `#ea580c`             |
| Medium         | `#e2b93d`             | `#ca8a04`             |
| Low            | `#50fa7b`             | `#16a34a`             |

- Le thème est détecté automatiquement via `prefers-color-scheme` au premier chargement
- Le choix est persisté dans `localStorage`
- Toggle accessible dans le header

---

## API Backend (REST)

### `POST /api/analyze`

Analyse un extrait de code (endpoint principal).

**Corps (JSON) :**

```json
{
  "code": "def hello():\n  print('world')",
  "language": "python",
  "filename": "hello.py"
}
```

**Réponse :**

```json
{
  "review_id": "uuid",
  "language": "python",
  "filename": "hello.py",
  "summary": {
    "total": 3,
    "by_severity": { "critical": 0, "high": 1, "medium": 1, "low": 1 },
    "by_category": { "security": 0, "bug": 1, "style": 2 },
    "by_source": { "groq": 2, "ast": 1 },
    "total_before_cap": 3
  },
  "issues": [
    {
      "category": "bug",
      "severity": "high",
      "line": 3,
      "rule": "bare-except",
      "message": "Clause except sans type.",
      "suggestion": "Spécifiez le type d'exception.",
      "source": "ast"
    }
  ],
  "metrics": {
    "lines_of_code": 10,
    "blank_lines": 2,
    "comment_lines": 1,
    "num_functions": 1,
    "num_classes": 0,
    "avg_function_length": 5
  },
  "warnings": []
}
```

**Codes d'erreur :**

| Code | Cas                         |
|------|-----------------------------|
| 400  | Code vide ou champ manquant |
| 413  | Fichier > 50 Ko             |
| 422  | Langage non supporté        |
| 503  | MySQL indisponible          |

### `GET /api/reviews`

Liste paginée des analyses.

**Query params :** `page` (défaut 1), `limit` (défaut 20, max 100)

### `GET /api/reviews/:id`

Détail d'une analyse avec toutes ses issues (triées par sévérité desc, catégorie desc, ligne asc).

### `DELETE /api/reviews/:id`

Supprime une analyse (cascade : issues + logs associés).

### `GET /api/logs`

Récupère les logs d'analyse.

**Query params :** `source` (memory/database), `limit`, `level`, `review_id`

### `GET /api/logs/stats`

Statistiques des logs : total, erreurs, warnings, infos, nombre d'analyses.

### `DELETE /api/logs`

Vide le buffer mémoire et les logs en base.

### `GET /health`

```json
{ "status": "ok", "timestamp": "2026-03-02T15:34:08.000Z" }
```

---

## Serveur MCP (JSON-RPC 2.0)

Le serveur MCP (Model Context Protocol v2025-03-26) expose PolyCheck comme un ensemble d'outils utilisables par Claude et d'autres clients IA.

**Technologie :** PHP 8.1 + Guzzle HTTP, port `3002`

### Endpoints HTTP

| Endpoint      | Méthode | Description                              |
|---------------|---------|------------------------------------------|
| `POST /mcp`   | POST    | Dispatch des requêtes JSON-RPC 2.0       |
| `GET /mcp`    | GET     | Flux SSE (messages serveur)              |
| `DELETE /mcp` | DELETE  | Fin de session                           |
| `GET /health`  | GET     | Health check                             |

### 11 outils MCP exposés

#### Outils d'analyse

| Outil             | Paramètres                    | Description                         |
|-------------------|-------------------------------|-------------------------------------|
| `analyze_code`    | `code`, `language`, `filename?` | Lance une analyse complète du code  |

#### Gestion des reviews

| Outil             | Paramètres            | Description                            |
|-------------------|-----------------------|----------------------------------------|
| `list_reviews`    | `page?`, `limit?`     | Liste paginée des analyses             |
| `get_review`      | `review_id`           | Détail d'une analyse avec ses issues   |
| `delete_review`   | `review_id`           | Supprime une analyse                   |

#### Gestion de la base de connaissances RAG

| Outil             | Paramètres                                    | Description                                  |
|-------------------|-----------------------------------------------|----------------------------------------------|
| `search_patterns` | `code`, `language`, `category?`               | Recherche les best practices pertinentes     |
| `list_patterns`   | —                                             | Liste tous les patterns de la KB             |
| `get_pattern`     | `pattern_id`                                  | Détail d'un pattern                          |
| `create_pattern`  | `id`, `language`, `pattern`, `category`, `severity`, `rule`, `bad_example?`, `good_example?` | Ajoute un pattern |
| `update_pattern`  | `pattern_id`, champs à modifier               | Met à jour un pattern                        |
| `delete_pattern`  | `pattern_id`                                  | Supprime un pattern                          |
| `get_rag_stats`   | —                                             | Statistiques de la KB                        |

### Exemple d'appel MCP

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "analyze_code",
    "arguments": {
      "code": "password = 'admin123'",
      "language": "python",
      "filename": "config.py"
    }
  }
}
```

---

## Service Python AST

**Technologie :** FastAPI + Python 3.12, port `8000`

### Analyse AST native (Python)

Utilise le module `ast` pour parser et visiter l'arbre syntaxique :

| Règle                  | Sévérité | Description                                 |
|------------------------|----------|---------------------------------------------|
| `syntax-error`         | critical | Erreur de syntaxe Python                    |
| `bare-except`          | high     | `except:` sans type d'exception             |
| `broad-exception`      | medium   | `except Exception:` sans `as`               |
| `wildcard-import`      | medium   | `from X import *`                           |
| `hardcoded-password`   | high     | Mot de passe en dur dans le code            |
| `hardcoded-secret`     | high     | Clé API / token / secret en dur             |
| `function-too-long`    | medium   | Fonction > 50 lignes                        |
| `too-many-arguments`   | medium   | Fonction avec > 7 paramètres                |
| `missing-docstring`    | low      | Fonction > 10 lignes sans docstring         |
| `comparison-to-true`   | low      | `x == True` au lieu de `x`                  |
| `comparison-to-none`   | low      | `x == None` au lieu de `x is None`          |

### Analyse heuristique (autres langages)

Pour JS, TS, Java, Go, Rust, C, C++ :

| Règle                | Sévérité | Description                    |
|----------------------|----------|--------------------------------|
| `hardcoded-secret`   | high     | Secrets détectés par regex     |
| `line-too-long`      | low      | Ligne > 120 caractères         |
| `todo-comment`       | low      | TODO/FIXME/HACK dans le code   |

### Métriques calculées

- `lines_of_code` — Lignes de code totales
- `blank_lines` — Lignes vides
- `comment_lines` — Lignes de commentaires
- `num_functions` — Nombre de fonctions
- `num_classes` — Nombre de classes
- `avg_function_length` — Longueur moyenne des fonctions

### Endpoints Python

| Endpoint        | Méthode | Description                |
|-----------------|---------|----------------------------|
| `POST /analyze` | POST    | Analyse AST + métriques    |
| `GET /health`   | GET     | Health check du service    |

---

## Système RAG

Le RAG (Retrieval Augmented Generation) enrichit les analyses IA avec des patterns de bonnes pratiques stockés dans une base vectorielle.

**Technologie :** ChromaDB (base vectorielle) + Sentence-Transformers (`all-MiniLM-L6-v2`)

### Fonctionnement

1. Le backend appelle `POST /rag/retrieve` avec le code à analyser
2. ChromaDB recherche les 3 patterns les plus similaires (cosine similarity)
3. Les patterns trouvés sont injectés dans le prompt Groq
4. Le LLM utilise ces best practices pour affiner son analyse

### 17 patterns pré-chargés

| Langage     | Nombre | Exemples                                                    |
|-------------|--------|-------------------------------------------------------------|
| Python      | 5      | List comprehension, None comparison, context managers, secrets, f-strings |
| JavaScript  | 4      | const/let, async/await, prévention XSS, pas de console.log  |
| Java        | 3      | try-with-resources, @Override, prévention SQL injection      |
| Général     | 4+     | Noms significatifs, commentaires clairs, pas de secrets, null checks |

### Endpoints RAG

| Endpoint                       | Méthode | Description                           |
|--------------------------------|---------|---------------------------------------|
| `POST /rag/retrieve`           | POST    | Recherche les patterns pertinents     |
| `GET /rag/patterns`            | GET     | Liste tous les patterns               |
| `GET /rag/patterns/{id}`       | GET     | Détail d'un pattern                   |
| `POST /rag/patterns`           | POST    | Crée un nouveau pattern               |
| `PUT /rag/patterns/{id}`       | PUT     | Met à jour un pattern                 |
| `DELETE /rag/patterns/{id}`    | DELETE  | Supprime un pattern                   |
| `GET /rag/stats`               | GET     | Statistiques de la base               |

### Structure d'un pattern

```json
{
  "id": "py_001",
  "language": "python",
  "pattern": "Utiliser les list comprehensions au lieu des boucles for",
  "category": "style",
  "severity": "low",
  "rule": "PEP8_COMPREHENSION",
  "bad_example": "result = []\nfor item in items:\n    result.append(item * 2)",
  "good_example": "result = [item * 2 for item in items]"
}
```

> Désactivable via `RAG_ENABLED=false` dans le `.env`

---

## Moteur de déduplication

PolyCheck reçoit jusqu'à 4 sources simultanées (Groq×3 + AST). Sans déduplication, un même problème peut apparaître jusqu'à 4 fois.

### Stratégie (aggregator.js)

| Étape                          | Description                                                    |
|--------------------------------|----------------------------------------------------------------|
| **1. Canonicalisation**        | Normalise les noms de règles variants vers un nom canonique    |
| **2. Dédup exacte**            | Clé : `rule \| line` — fusionne les doublons                   |
| **3. Dédup floue**             | Fenêtre ±3 lignes pour `bare-except`, `division-by-zero`      |
| **4. Fusion**                  | Sévérité max, catégorie max, sources combinées, suggestion la plus longue |
| **5. Tri**                     | `severity desc → category desc → line asc`                    |
| **6. Cap**                     | Maximum **12 issues** retournées                               |

### Règles canoniques

| Canonique            | Variantes reconnues                                       |
|----------------------|-----------------------------------------------------------|
| `bare-except`        | `emptyexcept`, `broad-except`, `e722`, etc.               |
| `hardcoded-secret`   | `credential*`, `token*`, `api-secret`, `password*`, etc.  |
| `shell-injection`    | `os-command`, `exec`, `spawn`, `subprocess`, etc.         |
| `eval`               | `dynamic-code`, `injection` (contexte code), etc.         |
| `sql-injection`      | `sql*`, `query-injection`, etc.                           |
| `division-by-zero`   | `zerodivision`, `divide-by-zero`, etc.                    |

---

## Schéma de base de données

### Table `reviews`

| Colonne        | Type          | Description                          |
|----------------|---------------|--------------------------------------|
| `id`           | UUID (PK)     | Identifiant unique                   |
| `language`     | VARCHAR(50)   | Langage analysé                      |
| `filename`     | VARCHAR(255)  | Nom du fichier (optionnel)           |
| `code_snippet` | MEDIUMTEXT    | Code source analysé                  |
| `code_hash`    | CHAR(64)      | Hash SHA256 (détection doublons)     |
| `total_issues` | INT           | Nombre d'issues                      |
| `summary`      | JSON          | Résumé (by_severity, by_category...) |
| `created_at`   | DATETIME      | Date de création                     |
| `updated_at`   | DATETIME      | Date de mise à jour                  |

### Table `issues` (FK → reviews, CASCADE)

| Colonne      | Type                                 | Description              |
|--------------|--------------------------------------|--------------------------|
| `id`         | UUID (PK)                            | Identifiant unique       |
| `review_id`  | UUID (FK)                            | Référence à la review    |
| `category`   | ENUM(bug, security, style)           | Catégorie                |
| `severity`   | ENUM(critical, high, medium, low)    | Sévérité                 |
| `line`       | INT                                  | Numéro de ligne          |
| `column`     | INT                                  | Numéro de colonne        |
| `rule`       | VARCHAR(100)                         | Identifiant de la règle  |
| `message`    | TEXT                                 | Description du problème  |
| `suggestion` | TEXT                                 | Suggestion de correction |
| `source`     | ENUM(groq, ast)                      | Source de détection      |

### Table `analysis_logs` (FK → reviews, CASCADE)

| Colonne      | Type                                 | Description              |
|--------------|--------------------------------------|--------------------------|
| `id`         | UUID (PK)                            | Identifiant unique       |
| `review_id`  | UUID (FK)                            | Référence à la review    |
| `timestamp`  | DATETIME                             | Date/heure du log        |
| `level`      | ENUM(info, warn, error, debug)       | Niveau de log            |
| `message`    | VARCHAR(500)                         | Message du log           |
| `metadata`   | JSON                                 | Données contextuelles    |

---

## Modèle Groq & Fallback

| Variable               | Rôle                                               | Défaut                     |
|------------------------|-----------------------------------------------------|----------------------------|
| `GROQ_MODEL`           | Modèle principal pour les 3 analyses                 | `llama-3.3-70b-versatile`  |
| `GROQ_MODEL_FALLBACK`  | Modèle de secours si le principal est décommissionné | `llama-3.1-8b-instant`     |

**Comportement en cas de modèle décommissionné :**

1. Groq répond avec `code: "model_decommissioned"`
2. PolyCheck relance **automatiquement** la même requête avec `GROQ_MODEL_FALLBACK`
3. Si le fallback échoue aussi → `issues: []` + warning explicite
4. L'analyse AST continue indépendamment des erreurs Groq

**Paramètres Groq :** température `0.1`, max tokens `2048`, timeout `30s`

---

## Système de logs

### Double stockage

| Type      | Description                                            | Capacité          |
|-----------|--------------------------------------------------------|-------------------|
| **Mémoire** | Buffer FIFO en RAM (classe `LogBuffer`)              | 500 entrées max   |
| **MySQL**   | Table `analysis_logs` avec rétention automatique     | 5 dernières analyses |

### Niveaux

| Niveau  | Couleur UI  | Usage                          |
|---------|-------------|--------------------------------|
| `error` | Rouge       | Erreurs Groq, MySQL, parsing   |
| `warn`  | Orange      | Timeouts, fallbacks, dégradés  |
| `info`  | Bleu        | Étapes d'analyse normales      |
| `debug` | Gris        | Détails techniques             |

### Console de logs (frontend)

- Position fixe en bas à droite
- Auto-scroll avec toggle
- Compteur de logs
- Boutons : effacer, fermer
- Polling toutes les secondes

---

## Cas limites gérés

| Cas                        | Comportement                                          |
|----------------------------|-------------------------------------------------------|
| Fichier vide               | HTTP 400 — message explicite                          |
| Fichier > 50 Ko            | HTTP 413 — taille indiquée                            |
| Langage non supporté       | HTTP 422 — langues supportées listées                 |
| JSON Groq invalide         | Fallback `issues: []` + warning retourné              |
| Timeout Groq (> 30s)       | Fallback + warning                                    |
| Timeout Python (> 10s)     | Fallback + warning                                    |
| MySQL down                 | L'analyse continue (sans persistance) + log           |
| Service Python down        | Analyse Groq continue, AST skippé + warning           |
| Modèle IA décommissionné   | Retry auto avec modèle fallback                       |
| 28 issues brutes           | Dédup + cap → max 12 issues nettes                    |
| RAG désactivé              | Analyse IA sans augmentation, fonctionne normalement  |

---

## Tests rapides (curl)

```bash
# ─── Health checks ───────────────────────────────────────
curl http://localhost:3001/health        # Backend
curl http://localhost:8000/health        # Python AST
curl http://localhost:3002/health        # MCP Server

# ─── Analyser du code Python ─────────────────────────────
curl -X POST http://localhost:3001/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "code": "import os\npassword = \"admin123\"\ndef divide(a, b):\n    return a / b\n",
    "language": "python",
    "filename": "test.py"
  }'

# ─── Lister les reviews ─────────────────────────────────
curl "http://localhost:3001/api/reviews?page=1&limit=5"

# ─── Détail d'une review ────────────────────────────────
curl http://localhost:3001/api/reviews/<review_id>

# ─── Supprimer une review ───────────────────────────────
curl -X DELETE http://localhost:3001/api/reviews/<review_id>

# ─── Logs ────────────────────────────────────────────────
curl http://localhost:3001/api/logs?limit=50
curl http://localhost:3001/api/logs/stats

# ─── RAG : rechercher des patterns ──────────────────────
curl -X POST http://localhost:8000/rag/retrieve \
  -H "Content-Type: application/json" \
  -d '{ "code": "password = \"123\"", "language": "python" }'

# ─── RAG : lister les patterns ──────────────────────────
curl http://localhost:8000/rag/patterns
curl http://localhost:8000/rag/stats

# ─── MCP : appel JSON-RPC ───────────────────────────────
curl -X POST http://localhost:3002/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "analyze_code",
      "arguments": {
        "code": "eval(input())",
        "language": "python"
      }
    }
  }'

# ─── Tests d'erreur ─────────────────────────────────────
# Code vide (400)
curl -X POST http://localhost:3001/api/analyze \
  -H "Content-Type: application/json" \
  -d '{ "code": "", "language": "python" }'

# Langage non supporté (422)
curl -X POST http://localhost:3001/api/analyze \
  -H "Content-Type: application/json" \
  -d '{ "code": "print(\"hello\")", "language": "cobol" }'
```

---

## Développement local (sans Docker)

```bash
# MySQL : démarrez via Docker seul
docker compose up mysql phpmyadmin -d

# Backend
cd backend && npm install
cp ../.env.example ../.env   # configurez .env
node src/index.js

# Python AST + RAG
cd python-service && pip install -r requirements.txt
uvicorn app:app --reload --port 8000

# MCP Server
cd mcp-server && composer install
php -S 0.0.0.0:3002 -t public

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
