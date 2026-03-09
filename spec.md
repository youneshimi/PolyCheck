# PolyCheck — Spécification Technique (spec.md)

> Version : MVP 1.0 · Date : Mars 2026 · Auteur : youneshimi · Licence : MIT

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Objectifs et périmètre du MVP](#2-objectifs-et-périmètre-du-mvp)
3. [Stack technique](#3-stack-technique)
4. [Services et ports](#4-services-et-ports)
5. [Modèle de données](#5-modèle-de-données)
6. [API Reference](#6-api-reference)
7. [Logique métier](#7-logique-métier)
8. [Gestion des erreurs et cas limites](#8-gestion-des-erreurs-et-cas-limites)
9. [Variables d'environnement](#9-variables-denvironnement)
10. [Déploiement](#10-déploiement)
11. [Tests](#11-tests)
12. [Métriques cibles du MVP](#12-métriques-cibles-du-mvp)
13. [Décisions techniques](#13-décisions-techniques)
14. [Évolutions post-MVP](#14-évolutions-post-mvp)

---

## 1. Vue d'ensemble

PolyCheck est un outil d'analyse de code source **multi-langages** qui combine :

- Une **analyse sémantique IA** via l'API GroqCloud (LLM `llama-3.3-70b-versatile`) sur 3 dimensions simultanées : bugs, sécurité, style.
- Une **analyse statique AST** via un microservice Python (module `ast` natif + heuristiques regex).
- Un **agrégateur intelligent** qui fusionne, déduplique et priorise les résultats des 4 sources.
- Une **persistance MySQL** de toutes les analyses pour historique et consultation.
- Une **interface web React** avec éditeur de code, sélection de langage et affichage filtrable des issues.

---

## 2. Objectifs et périmètre du MVP

### Inclus

- [x] Analyse IA 3-en-1 parallèle (Groq : bugs / sécurité / style)
- [x] Analyse AST statique Python + heuristiques pour 7 autres langages
- [x] Déduplication intelligente des issues (clé composite)
- [x] Priorisation et cap à 12 issues par analyse
- [x] Fallback automatique de modèle Groq en cas de décommissionnement
- [x] Persistance MySQL (reviews + issues) non-bloquante
- [x] API REST complète (analyze, reviews CRUD, health checks)
- [x] Interface React avec éditeur Monaco-style et filtres
- [x] Gestion des cas limites (vide, trop grand, langage non supporté, timeouts, services down)
- [x] Conteneurisation Docker Compose (5 services)
- [x] phpMyAdmin pour l'administration de la base de données

### Hors périmètre MVP

- [ ] Authentification / gestion d'utilisateurs
- [ ] Webhooks / intégration CI/CD
- [ ] Support des fichiers binaires ou archives
- [ ] Analyse de dépôts Git entiers
- [ ] Règles de linting personnalisables
- [ ] Export CSV/PDF natif depuis l'interface

---

## 3. Stack technique

| Composant       | Technologie                          | Version  |
|-----------------|--------------------------------------|----------|
| Frontend        | Vite + React                         | React 18 |
| Backend         | Node.js + Express                    | Node 20, Express 4 |
| Service AST     | Python + FastAPI + Pydantic          | Python 3.12, FastAPI latest |
| Analyse IA      | GroqCloud SDK — `groq-sdk`           | `llama-3.3-70b-versatile` |
| Base de données | MySQL                                | 8.0 |
| Admin DB        | phpMyAdmin                           | latest |
| Orchestration   | Docker Compose                       | v3 |
| Hachage         | SHA-256 (module `crypto` Node.js)    | stdlib |

---

## 4. Services et ports

| Service          | Conteneur Docker      | Port interne | Port exposé | URL locale               |
|------------------|-----------------------|:------------:|:-----------:|--------------------------|
| Frontend         | `frontend`            | 5173         | 5173        | http://localhost:5173    |
| Backend API      | `backend`             | 3001         | 3001        | http://localhost:3001    |
| Service AST      | `python-service`      | 8000         | 8000        | http://localhost:8000    |
| MySQL            | `mysql`               | 3306         | 3306        | localhost:3306           |
| phpMyAdmin       | `phpmyadmin`          | 80           | 8080        | http://localhost:8080    |

### Réseau interne Docker

Tous les services communiquent via le réseau `polycheck_net` défini dans `docker-compose.yml`. Le backend appelle le service Python via `http://python-service:8000`.

---

## 5. Modèle de données

### 5.1 Table `reviews`

```sql
CREATE TABLE reviews (
    id           INT          AUTO_INCREMENT PRIMARY KEY,
    language     VARCHAR(20)  NOT NULL,
    filename     VARCHAR(255) NULL,
    code_snippet MEDIUMTEXT   NOT NULL,
    code_hash    CHAR(64)     NOT NULL,        -- SHA-256 hex
    total_issues INT          NOT NULL DEFAULT 0,
    summary      JSON         NOT NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_code_hash (code_hash),
    INDEX idx_created_at (created_at)
);
```

### 5.2 Table `issues`

```sql
CREATE TABLE issues (
    id        CHAR(36) PRIMARY KEY,           -- UUID v4
    review_id INT      NOT NULL,
    category  ENUM('bug', 'security', 'style') NOT NULL,
    severity  ENUM('critical', 'high', 'medium', 'low') NOT NULL,
    line      INT      NULL,
    `column`  INT      NULL,
    rule      VARCHAR(100) NOT NULL,
    message   TEXT    NOT NULL,
    source    ENUM('groq', 'ast', 'ast+groq') NOT NULL DEFAULT 'groq',
    FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
    INDEX idx_review_id (review_id),
    INDEX idx_severity  (severity),
    INDEX idx_category  (category)
);
```

### 5.3 Structure du champ `summary` (JSON)

```json
{
  "total": 5,
  "total_before_cap": 12,
  "by_severity": {
    "critical": 1,
    "high":     2,
    "medium":   1,
    "low":      1
  },
  "by_category": {
    "security": 2,
    "bug":      2,
    "style":    1
  }
}
```

---

## 6. API Reference

### `POST /api/analyze`

Lance une analyse complète du code soumis.

**Corps (JSON) :**

```json
{
  "code":     "def hello():\n  print('world')",
  "language": "python",
  "filename": "hello.py"
}
```

| Champ      | Type   | Requis | Contraintes                        |
|------------|--------|:------:|------------------------------------|
| `code`     | string | ✔      | Non vide, ≤ 50 Ko (UTF-8)          |
| `language` | string | ✔      | Voir liste des langages supportés  |
| `filename` | string | ✗      | Optionnel, pour affichage uniquement |

**Réponse 200 :**

```json
{
  "review_id": 42,
  "language":  "python",
  "filename":  "hello.py",
  "summary": {
    "total": 2,
    "total_before_cap": 4,
    "by_severity": { "critical": 0, "high": 1, "medium": 1, "low": 0 },
    "by_category": { "security": 0, "bug": 1, "style": 1 }
  },
  "issues": [
    {
      "category":   "bug",
      "severity":   "high",
      "line":       3,
      "column":     null,
      "rule":       "bare-except",
      "message":    "Clause 'except:' sans type d'exception.",
      "suggestion": "Spécifiez le type : `except ValueError:`",
      "source":     "ast"
    }
  ],
  "metrics": {
    "lines_of_code":       12,
    "blank_lines":          2,
    "comment_lines":        1,
    "num_functions":        2,
    "num_classes":          0,
    "avg_function_length":  6.0
  },
  "warnings": []
}
```

---

### `GET /api/reviews`

Liste paginée des analyses enregistrées.

**Query params :**

| Paramètre | Défaut | Max  | Description              |
|-----------|:------:|:----:|--------------------------|
| `page`    | 1      | —    | Numéro de page           |
| `limit`   | 20     | 100  | Nombre de résultats/page |

**Réponse 200 :**

```json
{
  "data": [ { "id": 1, "language": "python", "total_issues": 3, "created_at": "..." } ],
  "pagination": { "page": 1, "limit": 20, "total": 48 }
}
```

---

### `GET /api/reviews/:id`

Détail d'une analyse avec toutes ses issues.

**Réponse 200 :** objet review complet avec champ `issues[]`.
**Réponse 404 :** review introuvable.

---

### `DELETE /api/reviews/:id`

Supprime une analyse et toutes ses issues (CASCADE).

**Réponse 204 :** suppression réussie, corps vide.
**Réponse 404 :** review introuvable.

---

### `GET /health` — Backend (port 3001)

```json
{ "status": "ok", "timestamp": "2026-03-02T15:34:08.000Z" }
```

### `GET /health` — Service Python AST (port 8000)

```json
{ "status": "ok", "service": "polycheck-python-ast" }
```

---

### Codes d'erreur HTTP

| Code | Cas                                      |
|:----:|------------------------------------------|
| 400  | Code vide ou champ obligatoire manquant  |
| 404  | Review non trouvée                       |
| 413  | Code > 50 Ko                             |
| 422  | Langage non supporté                     |
| 503  | MySQL indisponible                       |

---

## 7. Logique métier

### 7.1 Langages supportés

```
python · javascript · typescript · java · go · rust · c · cpp
```

### 7.2 Pipeline d'analyse

```
[Client]
   │
   ▼
POST /api/analyze
   │
   ├─ Validation (middleware) ──► 400 / 413 / 422
   │
   ├─ Hash SHA-256 du code
   │
   ├─ Promise.allSettled([
   │     analyzeWithAST(language, code),    ─► http://python-service:8000/analyze
   │     analyzeWithGroq(language, code)    ─► Groq API (3 requêtes parallèles)
   │                                              ├── bugs prompt
   │                                              ├── security prompt
   │                                              └── style prompt
   │  ])
   │
   ├─ aggregateAndPrioritize(groqResults, astIssues)
   │     ├── Fusion par clé composite
   │     ├── Remontée de sévérité
   │     ├── Tri : severity desc → category → line asc
   │     └── Cap à 12 issues
   │
   ├─ INSERT INTO reviews + issues  (non-bloquant)
   │
   └─► Réponse JSON 200
```

### 7.3 Prompts Groq par catégorie

Chaque prompt est spécialisé et impose un format JSON strict (sans markdown) :

| Catégorie  | Instruction principale                                                  |
|------------|-------------------------------------------------------------------------|
| `bug`      | Bugs, erreurs logiques, comportements indéfinis, problèmes de runtime   |
| `security` | Injections, XSS, secrets hardcodés, OWASP Top 10, permissions excessives |
| `style`    | Lisibilité, nommage, complexité cyclomatique, SOLID/DRY/KISS            |

- Température : `0.1` (réponses déterministes)
- Max tokens : `2048`
- Maximum **10 issues** par catégorie

### 7.4 Règles AST Python (module `ast` natif)

| Règle                  | Sévérité  | Catégorie  | Déclencheur                                        |
|------------------------|:---------:|:----------:|----------------------------------------------------|
| `hardcoded-password`   | critical  | security   | `password =` / `passwd =` avec valeur litérale     |
| `hardcoded-secret`     | critical  | security   | `api_key =` / `token =` avec valeur litérale       |
| `syntax-error`         | critical  | bug        | Erreur de parsing `ast.parse()`                    |
| `bare-except`          | high      | bug        | `except:` sans type                                |
| `broad-exception`      | medium    | bug        | `except Exception:` sans liaison `as e`            |
| `function-too-long`    | medium    | style      | Fonction > 50 lignes                               |
| `too-many-arguments`   | medium    | style      | Fonction avec > 7 paramètres                       |
| `wildcard-import`      | medium    | style      | `from x import *`                                  |
| `comparison-to-true`   | low       | style      | `x == True`                                        |
| `comparison-to-none`   | low       | style      | `x == None`                                        |
| `missing-docstring`    | low       | style      | Fonction > 10 lignes sans docstring                |

### 7.5 Heuristiques multi-langages (non-Python)

| Règle               | Sévérité | Catégorie | Déclencheur                             |
|---------------------|:--------:|:---------:|-----------------------------------------|
| `hardcoded-password`| critical | security  | `password:` / `passwd=` avec valeur     |
| `hardcoded-secret`  | critical | security  | `api_key:` / `token=` avec valeur       |
| `line-too-long`     | low      | style     | Ligne > 120 caractères                  |
| `todo-comment`      | low      | style     | Commentaire `TODO`, `FIXME`, `HACK`, `XXX` |

### 7.6 Algorithme de déduplication (`aggregator.js`)

**Clé composite :** `category | rule | line | message_normalisé`

La normalisation du message consiste à mettre en minuscules et à supprimer les ponctuations/espaces multiples.

**En cas de doublon :**

1. **Sévérité** → la plus haute est conservée (`critical > high > medium > low`)
2. **Source** → union : `groq` + `ast` → `"ast+groq"`
3. **Suggestion** → la plus longue chaîne non vide est retenue

**Tri final :**

```
severity DESC  →  category (security > bug > style)  →  line ASC
```

**Cap MVP :** max **12 issues** après tri. Le champ `summary.total_before_cap` indique le nombre d'issues uniques avant ce plafond.

### 7.7 Fallback modèle Groq

```
Appel avec GROQ_MODEL
        │
        ├─ Succès ──────────────────► résultat normal
        │
        └─ Erreur model_decommissioned
                │
                ├─ Retry avec GROQ_MODEL_FALLBACK
                │       │
                │       ├─ Succès ──► résultat avec warning
                │       │
                │       └─ Échec ───► issues: [] + warning explicite
                │
                └─ L'analyse AST continue indépendamment
```

---

## 8. Gestion des erreurs et cas limites

| Cas                         | Comportement                                         | Code HTTP |
|-----------------------------|------------------------------------------------------|:---------:|
| Code vide                   | Rejet immédiat en middleware                          | 400       |
| Code > 50 Ko                | Rejet avec taille indiquée                           | 413       |
| Langage non supporté        | Rejet avec liste des langages valides                | 422       |
| JSON Groq invalide          | `issues: []` pour la catégorie + warning retourné    | 200       |
| Timeout Groq (> 30s)        | `issues: []` pour la catégorie + warning retourné    | 200       |
| Timeout Python AST (> 10s)  | Analyse Groq continue, AST skippé + warning          | 200       |
| MySQL indisponible          | Analyse retournée sans persistance + log console     | 200       |
| Service Python down         | Groq continue, AST skippé + warning                  | 200       |
| Modèle Groq décommissionné  | Retry automatique sur `GROQ_MODEL_FALLBACK`          | 200       |
| 28 issues brutes reçues     | Dédup + cap → max 12 issues nettes                   | 200       |

---

## 9. Variables d'environnement

### Backend (`backend/.env` ou `docker-compose.yml`)

| Variable              | Requis | Défaut                    | Description                               |
|-----------------------|:------:|---------------------------|-------------------------------------------|
| `GROQ_API_KEY`        | ✔      | —                         | Clé API GroqCloud                         |
| `GROQ_MODEL`          | ✗      | `llama-3.3-70b-versatile` | Modèle IA principal                       |
| `GROQ_MODEL_FALLBACK` | ✗      | `llama-3.1-8b-instant`    | Modèle de secours                         |
| `GROQ_TIMEOUT_MS`     | ✗      | `30000`                   | Timeout Groq en ms                        |
| `DB_HOST`             | ✗      | `mysql`                   | Hôte MySQL                                |
| `DB_PORT`             | ✗      | `3306`                    | Port MySQL                                |
| `DB_USER`             | ✗      | `polycheck`               | Utilisateur MySQL                         |
| `DB_PASSWORD`         | ✗      | `polycheck`               | Mot de passe MySQL                        |
| `DB_NAME`             | ✗      | `polycheck`               | Nom de la base de données                 |
| `PORT`                | ✗      | `3001`                    | Port d'écoute du backend                  |

### Service Python (`python-service`)

| Variable              | Requis | Défaut                                     | Description                  |
|-----------------------|:------:|--------------------------------------------|------------------------------|
| `MAX_FILE_SIZE_BYTES` | ✗      | `51200`                                    | Taille max du code (50 Ko)   |
| `SUPPORTED_LANGUAGES` | ✗      | `python,javascript,typescript,java,go,rust,c,cpp` | Langages acceptés  |

---

## 10. Déploiement

### Prérequis

- Docker Desktop ≥ 24
- Clé API GroqCloud : https://console.groq.com/keys

### Démarrage complet

```bash
cp .env.example .env
# Renseignez GROQ_API_KEY dans .env
docker compose up --build
```

### Services Docker Compose

| Service           | Image de base       | Dockerfile               |
|-------------------|---------------------|--------------------------|
| `frontend`        | `node:20-alpine`    | `frontend/Dockerfile`    |
| `backend`         | `node:20-alpine`    | `backend/Dockerfile`     |
| `python-service`  | `python:3.12-slim`  | `python-service/Dockerfile` |
| `mysql`           | `mysql:8.0`         | — (image officielle)     |
| `phpmyadmin`      | `phpmyadmin:latest` | — (image officielle)     |

### Développement local (sans Docker)

```bash
# MySQL seul via Docker
docker compose up mysql phpmyadmin -d

# Backend
cd backend && npm install
node src/index.js

# Service Python AST
cd python-service && pip install -r requirements.txt
uvicorn app:app --reload --port 8000

# Frontend
cd frontend && npm install
npm run dev
```

### Initialisation de la base de données

Le fichier `db/init.sql` est automatiquement exécuté au premier démarrage du conteneur MySQL. Il crée les tables `reviews` et `issues` avec leurs index.

---

## 11. Tests

### Smoke tests (`tests/smoke.http`)

Fichier compatible REST Client (VS Code) et HTTPie.

```http
### Health check backend
GET http://localhost:3001/health

### Health check service Python AST
GET http://localhost:8000/health

### Analyser du code Python valide
POST http://localhost:3001/api/analyze
Content-Type: application/json

{
  "code": "import os\npassword = \"admin123\"\ndef divide(a, b):\n    return a / b\n",
  "language": "python",
  "filename": "test.py"
}

### Lister les reviews (page 1)
GET http://localhost:3001/api/reviews?page=1&limit=5

### Tester code vide → doit retourner 400
POST http://localhost:3001/api/analyze
Content-Type: application/json

{ "code": "", "language": "python" }

### Tester langage non supporté → doit retourner 422
POST http://localhost:3001/api/analyze
Content-Type: application/json

{ "code": "print(\"hello\")", "language": "cobol" }
```

---

## 12. Métriques cibles du MVP

| Indicateur                  | Valeur cible |
|-----------------------------|:------------:|
| Temps de réponse (p50)      | < 5 s        |
| Temps de réponse (p95)      | < 15 s       |
| Taille max fichier          | 50 Ko        |
| Langages supportés          | 8            |
| Issues brutes max (4 sources) | 30         |
| Issues après dédup + cap    | ≤ 12         |
| Timeout Groq par appel      | 30 s         |
| Timeout service Python AST  | 10 s         |

---

## 13. Décisions techniques

| Date        | Décision                                     | Raison                                              |
|-------------|----------------------------------------------|-----------------------------------------------------|
| 2026-03-02  | `Promise.allSettled` pour les 4 analyses     | Une erreur d'un service ne bloque pas les autres    |
| 2026-03-02  | Groq `llama-3.3-70b-versatile`               | Meilleur rapport qualité/vitesse sur tier gratuit   |
| 2026-03-02  | FastAPI + Pydantic pour le service Python    | Validation native + async + doc OpenAPI auto        |
| 2026-03-02  | MySQL 8.0 avec UUID en PK pour `issues`      | Portabilité, scalabilité horizontale, sans collision|
| 2026-03-02  | Persistance non-bloquante (try/catch isolé)  | Service dégradé plutôt que panne totale             |
| 2026-03-02  | Cap à 12 issues post-dédup                   | Optimiser le ratio signal/bruit pour l'utilisateur  |
| 2026-03-02  | colonne `summary` en JSON natif MySQL 8.0    | Flexibilité pour évolutions futures du schéma       |
| 2026-03-02  | Temperature Groq à 0.1                       | Réponses déterministes et reproductibles            |

---

## 14. Évolutions post-MVP

### Court terme (v1.1)

- [ ] Cache Redis sur le hash SHA-256 pour éviter les ré-analyses identiques
- [ ] Pagination cursor-based pour les reviews (performances sur gros volumes)
- [ ] Support de fichiers multiples / ZIP

### Moyen terme (v2.0)

- [ ] Authentification JWT + espaces de travail par utilisateur
- [ ] Règles AST personnalisables via configuration YAML
- [ ] Webhook sortant (Slack, GitHub PR comments)
- [ ] Intégration CI/CD (GitHub Actions, GitLab CI)
- [ ] Support de l'analyse de dépôts Git distants

### Long terme

- [ ] Fine-tuning du LLM sur des datasets de bugs réels
- [ ] Plugin VS Code natif
- [ ] Tableau de bord analytique (tendances, scores de qualité)
- [ ] Support multilingue de l'interface (i18n)

---

*PolyCheck est un projet open-source sous licence MIT. Contributions bienvenues.*
