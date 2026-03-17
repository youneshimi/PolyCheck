# PolyCheck — Spécification Technique (spec.md)

> Version : 1.1 · Date : Mars 2026 · Auteur : youneshimi · Licence : MIT

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Objectifs et périmètre](#2-objectifs-et-périmètre)
3. [Architecture globale](#3-architecture-globale)
4. [Stack technique](#4-stack-technique)
5. [Services et ports](#5-services-et-ports)
6. [Modèle de données](#6-modèle-de-données)
7. [API Reference](#7-api-reference)
8. [Logique métier](#8-logique-métier)
9. [Système RAG (Retrieval Augmented Generation)](#9-système-rag-retrieval-augmented-generation)
10. [Serveur MCP (Model Context Protocol)](#10-serveur-mcp-model-context-protocol)
11. [Système de logs](#11-système-de-logs)
12. [Interface utilisateur](#12-interface-utilisateur)
13. [Gestion des erreurs et cas limites](#13-gestion-des-erreurs-et-cas-limites)
14. [Variables d'environnement](#14-variables-denvironnement)
15. [Déploiement](#15-déploiement)
16. [Tests](#16-tests)
17. [Métriques cibles](#17-métriques-cibles)
18. [Décisions techniques](#18-décisions-techniques)
19. [Évolutions post-MVP](#19-évolutions-post-mvp)

---

## 1. Vue d'ensemble

PolyCheck est un outil d'analyse de code source **multi-langages** qui combine :

- Une **analyse sémantique IA** via l'API GroqCloud (LLM `llama-3.3-70b-versatile`) sur 3 dimensions simultanées : bugs, sécurité, style.
- Une **analyse statique AST** via un microservice Python (module `ast` natif + heuristiques regex).
- Un **système RAG** (Retrieval Augmented Generation) basé sur ChromaDB qui enrichit les prompts LLM avec une base de connaissances de bonnes pratiques.
- Un **agrégateur intelligent** qui fusionne, déduplique (exact + fuzzy) et priorise les résultats des 4 sources.
- Un **serveur MCP** (Model Context Protocol) en PHP exposant 11 outils JSON-RPC 2.0, permettant l'intégration directe avec Claude et d'autres clients IA.
- Un **système de logs** en temps réel avec double stockage (mémoire + MySQL) et rétention automatique.
- Une **persistance MySQL** de toutes les analyses avec UUIDs.
- Une **interface web React** avec éditeur CodeMirror 6, thèmes Dracula/Light, console de logs flottante et filtres avancés.

---

## 2. Objectifs et périmètre

### Fonctionnalités implémentées

- [x] Analyse IA 3-en-1 parallèle (Groq : bugs / sécurité / style)
- [x] Analyse AST statique Python + heuristiques pour 7 autres langages
- [x] **Système RAG** : base de connaissances ChromaDB + embeddings Sentence-Transformers + augmentation de prompts
- [x] **Serveur MCP** (PHP, JSON-RPC 2.0) : 11 outils exposés pour intégration IA
- [x] Déduplication intelligente avancée : canonisation de règles (20+ variantes) + fenêtre glissante ±3 lignes
- [x] Priorisation et cap à 12 issues par analyse
- [x] Fallback automatique de modèle Groq en cas de décommissionnement
- [x] Persistance MySQL (reviews + issues + logs) non-bloquante avec UUIDs
- [x] **Rétention automatique** : conservation des 5 dernières analyses
- [x] API REST complète (analyze, reviews CRUD, logs CRUD, health checks)
- [x] **API RAG** complète (retrieve, patterns CRUD, stats)
- [x] Interface React avec éditeur CodeMirror 6 et thème dual (Dracula/Light)
- [x] **Console de logs flottante** avec auto-scroll et polling temps réel
- [x] Gestion des cas limites (vide, trop grand, langage non supporté, timeouts, services down)
- [x] Conteneurisation Docker Compose (**6 services**)
- [x] phpMyAdmin pour l'administration de la base de données

### Hors périmètre

- [ ] Authentification / gestion d'utilisateurs
- [ ] Webhooks / intégration CI/CD
- [ ] Support des fichiers binaires ou archives
- [ ] Analyse de dépôts Git entiers
- [ ] Règles de linting personnalisables via l'UI
- [ ] Export CSV/PDF natif depuis l'interface

---

## 3. Architecture globale

```
┌──────────────────────────────────────────────────────────────────────┐
│                         UTILISATEUR                                  │
│                 (Navigateur Web / Client IA MCP)                     │
└───────┬────────────────────────────────────┬─────────────────────────┘
        │ HTTP (port 5173)                   │ JSON-RPC 2.0 (port 3002)
        ▼                                    ▼
┌───────────────┐                   ┌─────────────────┐
│   Frontend    │                   │   MCP Server    │
│  Vite+React   │                   │     PHP 8.1     │
│  CodeMirror 6 │                   │  11 outils MCP  │
│  LogConsole   │                   │  Guzzle HTTP    │
└───────┬───────┘                   └───┬─────────┬───┘
        │ HTTP (port 3001)              │         │
        ▼                              ▼         │
┌──────────────────────────────────────────┐     │
│            Backend Node.js               │     │
│           Express + Groq SDK             │     │
│                                          │     │
│  ┌─────────────┐  ┌──────────────────┐   │     │
│  │ groqService  │  │   aggregator     │   │     │
│  │ + RAG augment│  │ canon + fuzzy    │   │     │
│  └──────┬──────┘  │ + exact dedup    │   │     │
│         │         └──────────────────┘   │     │
│  ┌──────┴──────┐                         │     │
│  │ 3 prompts   │  Promise.allSettled     │     │
│  │  parallèles │  (AST + Groq)          │     │
│  └─────────────┘                         │     │
└─────┬──────────────────────────┬─────────┘     │
      │ HTTP (port 8000)         │ MySQL (3306)  │
      ▼                          ▼               │
┌──────────────────┐    ┌──────────────┐         │
│  Python Service  │    │   MySQL 8.0  │         │
│  FastAPI + AST   │◄───┤  reviews     │         │
│                  │    │  issues      │         │
│  ┌────────────┐  │    │  analysis_   │         │
│  │ RAG Service│  │    │    logs      │         │
│  │ ChromaDB   │◄─┼────┘              │         │
│  │ Sentence-  │  │    └──────────────┘         │
│  │ Transformers│ │                              │
│  └────────────┘  │◄────────────────────────────┘
└──────────────────┘     HTTP (port 8000)
```

---

## 4. Stack technique

| Composant            | Technologie                                | Version / Détail              |
|----------------------|--------------------------------------------|-------------------------------|
| Frontend             | Vite + React                               | React 18, Vite 5              |
| Éditeur de code      | CodeMirror 6                               | Coloration syntaxique 8 langages |
| Backend              | Node.js + Express                          | Node 20, Express 4            |
| Analyse IA           | GroqCloud SDK — `groq-sdk`                 | `llama-3.3-70b-versatile`     |
| Service AST          | Python + FastAPI + Pydantic                | Python 3.12, FastAPI          |
| RAG — Vecteurs       | ChromaDB (base vectorielle)                | PersistentClient, cosine      |
| RAG — Embeddings     | Sentence-Transformers                      | `all-MiniLM-L6-v2`           |
| Serveur MCP          | PHP 8.1 + Guzzle HTTP                     | JSON-RPC 2.0                  |
| Base de données      | MySQL                                      | 8.0                           |
| Admin DB             | phpMyAdmin                                 | latest                        |
| Orchestration        | Docker Compose                             | v3                            |
| Hachage              | SHA-256 (module `crypto` Node.js)          | stdlib                        |

---

## 5. Services et ports

| Service          | Conteneur Docker        | Port interne | Port exposé | URL locale             |
|------------------|-------------------------|:------------:|:-----------:|------------------------|
| Frontend         | `polycheck_frontend`    | 80           | 5173        | http://localhost:5173  |
| Backend API      | `polycheck_backend`     | 3001         | 3001        | http://localhost:3001  |
| Service Python   | `polycheck_python`      | 8000         | 8000        | http://localhost:8000  |
| MCP Server       | `polycheck_mcp`         | 3002         | 3002        | http://localhost:3002  |
| MySQL            | `polycheck_mysql`       | 3306         | 3306        | localhost:3306         |
| phpMyAdmin       | `polycheck_phpmyadmin`  | 80           | 8080        | http://localhost:8080  |

### Réseau interne Docker

Tous les services communiquent via le réseau `polycheck_net` (driver bridge). Les communications inter-services utilisent les noms de conteneurs :
- Backend → Python : `http://python-service:8000`
- MCP → Backend : `http://backend:3001`
- MCP → Python : `http://python-service:8000`

---

## 6. Modèle de données

### 6.1 Table `reviews`

```sql
CREATE TABLE reviews (
    id           VARCHAR(36)  NOT NULL DEFAULT (UUID()),  -- UUID v4
    language     VARCHAR(50)  NOT NULL,
    filename     VARCHAR(255) DEFAULT NULL,
    code_snippet MEDIUMTEXT   NOT NULL,
    code_hash    VARCHAR(64)  NOT NULL,                   -- SHA-256 hex
    total_issues INT          NOT NULL DEFAULT 0,
    summary      JSON         DEFAULT NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_language   (language),
    INDEX idx_code_hash  (code_hash),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 6.2 Table `issues`

```sql
CREATE TABLE issues (
    id          VARCHAR(36)  NOT NULL DEFAULT (UUID()),   -- UUID v4
    review_id   VARCHAR(36)  NOT NULL,
    category    ENUM('bug','security','style') NOT NULL,
    severity    ENUM('critical','high','medium','low') NOT NULL,
    line        INT          DEFAULT NULL,
    `column`    INT          DEFAULT NULL,
    rule        VARCHAR(100) DEFAULT NULL,
    message     TEXT         NOT NULL,
    suggestion  TEXT         DEFAULT NULL,
    source      ENUM('groq','ast') NOT NULL DEFAULT 'groq',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_review_id (review_id),
    INDEX idx_category  (category),
    INDEX idx_severity  (severity),
    CONSTRAINT fk_issues_review
        FOREIGN KEY (review_id) REFERENCES reviews(id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 6.3 Table `analysis_logs`

```sql
CREATE TABLE analysis_logs (
    id          VARCHAR(36)  NOT NULL DEFAULT (UUID()),
    review_id   VARCHAR(36)  NOT NULL,
    timestamp   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    level       ENUM('info','warn','error','debug') NOT NULL DEFAULT 'info',
    message     VARCHAR(500) NOT NULL,
    metadata    JSON         DEFAULT NULL,
    PRIMARY KEY (id),
    INDEX idx_review_id (review_id),
    INDEX idx_timestamp (timestamp),
    INDEX idx_level     (level),
    CONSTRAINT fk_analysis_logs_review
        FOREIGN KEY (review_id) REFERENCES reviews(id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 6.4 Structure du champ `summary` (JSON)

```json
{
  "total": 5,
  "total_before_cap": 12,
  "by_severity": {
    "critical": 1,
    "high": 2,
    "medium": 1,
    "low": 1
  },
  "by_category": {
    "security": 2,
    "bug": 2,
    "style": 1
  },
  "by_source": {
    "groq": 2,
    "ast": 2,
    "ast+groq": 1
  }
}
```

---

## 7. API Reference

### 7.1 Backend REST API (port 3001)

#### `POST /api/analyze`

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
| `code`     | string | oui    | Non vide, max 50 Ko (UTF-8)       |
| `language` | string | oui    | Voir liste des langages supportés  |
| `filename` | string | non    | Optionnel, pour affichage          |

**Réponse 200 :**

```json
{
  "review_id": "a1b2c3d4-...",
  "language":  "python",
  "filename":  "hello.py",
  "summary": {
    "total": 2,
    "total_before_cap": 4,
    "by_severity": { "critical": 0, "high": 1, "medium": 1, "low": 0 },
    "by_category": { "security": 0, "bug": 1, "style": 1 },
    "by_source":   { "groq": 1, "ast": 1, "ast+groq": 0 }
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

#### `GET /api/reviews`

Liste paginée des analyses enregistrées.

| Paramètre | Défaut | Max  | Description              |
|-----------|:------:|:----:|--------------------------|
| `page`    | 1      | —    | Numéro de page           |
| `limit`   | 20     | 100  | Nombre de résultats/page |

**Réponse 200 :**

```json
{
  "data": [ { "id": "uuid...", "language": "python", "total_issues": 3, "created_at": "..." } ],
  "pagination": { "page": 1, "limit": 20, "total": 48 }
}
```

---

#### `GET /api/reviews/:id`

Détail d'une analyse avec toutes ses issues.

**Réponse 200 :** objet review complet avec champ `issues[]`.
**Réponse 404 :** review introuvable.

---

#### `DELETE /api/reviews/:id`

Supprime une analyse et toutes ses issues + logs (CASCADE).

**Réponse 204 :** suppression réussie, corps vide.
**Réponse 404 :** review introuvable.

---

#### `GET /api/logs`

Récupère les logs d'analyse.

| Paramètre | Défaut | Description                          |
|-----------|:------:|--------------------------------------|
| `source`  | —      | Filtrer par source                   |
| `limit`   | 200    | Nombre max de logs                   |
| `level`   | —      | Filtrer par niveau (info/warn/error/debug) |

---

#### `GET /api/logs/stats`

Statistiques des logs : compteurs par niveau.

---

#### `DELETE /api/logs`

Efface tous les logs en mémoire.

---

#### `GET /health`

```json
{ "status": "ok", "timestamp": "2026-03-02T15:34:08.000Z" }
```

---

### 7.2 Service Python AST (port 8000)

#### `POST /analyze`

Analyse AST + calcul de métriques du code soumis.

#### `GET /health`

```json
{ "status": "ok", "service": "polycheck-python-ast" }
```

#### `POST /rag/retrieve`

Recherche de patterns similaires par embeddings (cosine similarity, top 3).

```json
{ "code": "...", "language": "python", "category": "bug" }
```

#### `GET /rag/patterns`

Liste tous les patterns de la base de connaissances.

#### `GET /rag/patterns/{id}`

Détail d'un pattern spécifique.

#### `POST /rag/patterns`

Crée un nouveau pattern (vectorisé automatiquement).

#### `PUT /rag/patterns/{id}`

Met à jour un pattern existant.

#### `DELETE /rag/patterns/{id}`

Supprime un pattern.

#### `GET /rag/stats`

Statistiques RAG : nombre total de patterns, état du service.

---

### 7.3 Codes d'erreur HTTP

| Code | Cas                                      |
|:----:|------------------------------------------|
| 400  | Code vide ou champ obligatoire manquant  |
| 404  | Review ou pattern non trouvé             |
| 413  | Code > 50 Ko                             |
| 422  | Langage non supporté                     |
| 503  | MySQL indisponible                       |

---

## 8. Logique métier

### 8.1 Langages supportés

```
python · javascript · typescript · java · go · rust · c · cpp
```

### 8.2 Pipeline d'analyse

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
   │                                              ├── bugs prompt  (+RAG patterns)
   │                                              ├── security prompt (+RAG patterns)
   │                                              └── style prompt (+RAG patterns)
   │  ])
   │
   ├─ aggregateAndPrioritize(groqResults, astIssues)
   │     ├── Canonisation de règles (20+ variantes → forme canonique)
   │     ├── Dédup exacte par clé composite (canonRule | line)
   │     ├── Dédup fuzzy ±3 lignes (bare-except, division-by-zero)
   │     ├── Fusion : sévérité max, catégorie max, source fusionnée
   │     ├── Tri : severity desc → category desc → line asc
   │     └── Cap à 12 issues
   │
   ├─ INSERT INTO reviews + issues  (non-bloquant)
   ├─ INSERT INTO analysis_logs     (non-bloquant)
   ├─ Rétention : conservation des 5 dernières analyses
   │
   └─► Réponse JSON 200
```

### 8.3 Prompts Groq par catégorie

Chaque prompt est spécialisé, impose un format JSON strict (sans markdown), et est potentiellement **enrichi par le RAG** :

| Catégorie  | Instruction principale                                                  |
|------------|-------------------------------------------------------------------------|
| `bug`      | Bugs, erreurs logiques, comportements indéfinis, problèmes de runtime   |
| `security` | Injections, XSS, secrets hardcodés, OWASP Top 10, permissions excessives |
| `style`    | Lisibilité, nommage, complexité cyclomatique, SOLID/DRY/KISS            |

- Température : `0.1` (réponses déterministes)
- Max tokens : `2048`
- Maximum **10 issues** par catégorie
- **Augmentation RAG** : les prompts sont enrichis avec les 3 patterns les plus pertinents (si RAG activé)

### 8.4 Règles AST Python (module `ast` natif)

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

### 8.5 Heuristiques multi-langages (non-Python)

| Règle               | Sévérité | Catégorie | Déclencheur                             |
|---------------------|:--------:|:---------:|-----------------------------------------|
| `hardcoded-password`| critical | security  | `password:` / `passwd=` avec valeur     |
| `hardcoded-secret`  | critical | security  | `api_key:` / `token=` avec valeur       |
| `line-too-long`     | low      | style     | Ligne > 120 caractères                  |
| `todo-comment`      | low      | style     | Commentaire `TODO`, `FIXME`, `HACK`, `XXX` |

### 8.6 Algorithme de déduplication avancé (`aggregator.js`)

#### Étape 1 : Canonisation des règles

La fonction `canonicalizeRule(rule, message)` normalise les identifiants de règles pour fusionner les variantes cross-catégories que Groq peut retourner différemment selon le prompt (bug/security/style) :

| Forme canonique      | Variantes reconnues                                                                |
|----------------------|------------------------------------------------------------------------------------|
| `eval`               | `eval*`, `injection` (si message mentionne eval/dynamic code)                      |
| `shell-injection`    | `shell*`, `os-command*`, `command-injection*`, `exec*`, `spawn*`, `os.system`      |
| `hardcoded-secret`   | `hardcoded*`, `hard-coded*`, `secret`, `credential*`, `token*`, `key*`, `password` |
| `sql-injection`      | `sql*`                                                                             |
| `bare-except`        | `bare-except*`, `broad-except*`, `empty-except*`, `generic-except*`, `e722`        |
| `division-by-zero`   | `division*`, `zero-division*`, `divide-by-zero*`                                   |

#### Étape 2a : Déduplication exacte

**Clé composite :** `canonRule | line`

Pour toutes les règles sauf celles soumises à la dédup fuzzy. La catégorie et le message sont **exclus** de la clé : deux prompts Groq décrivent la même construction avec des mots différents.

#### Étape 2b : Déduplication fuzzy (fenêtre glissante ±3 lignes)

Appliquée uniquement à `bare-except` et `division-by-zero` : Groq peut reporter la même construction sur `try:` (ligne N) ou `except:` (ligne N+3) selon le prompt.

- Tri par ligne d'abord (déterministe)
- Pour chaque issue : cherche une existante avec `|line_a - line_b| <= 3`
- Si trouvée → fusion. Sinon → nouvelle entrée indépendante.

#### Étape 3 : Fusion

En cas de doublon :

1. **Catégorie** → la plus importante : `security > bug > style`
2. **Sévérité** → la plus haute : `critical > high > medium > low`
3. **Source** → union : `groq` + `ast` → `"ast+groq"`
4. **Suggestion** → la plus longue chaîne non vide
5. **Message** → le plus long
6. **Ligne** → la plus petite (stabiliser l'affichage)

#### Étape 4 : Tri et cap

```
severity DESC  →  category DESC (security > bug > style)  →  line ASC
```

**Cap :** max **12 issues** après tri. Le champ `summary.total_before_cap` indique le nombre avant plafond.

### 8.7 Fallback modèle Groq

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

## 9. Système RAG (Retrieval Augmented Generation)

### 9.1 Vue d'ensemble

Le système RAG enrichit les prompts envoyés à Groq avec des patterns de bonnes pratiques issus d'une base de connaissances vectorielle. Cela améliore la précision et la pertinence des détections IA.

### 9.2 Stack technique RAG

| Composant       | Technologie                              | Rôle                                          |
|-----------------|------------------------------------------|-----------------------------------------------|
| Base vectorielle| ChromaDB (PersistentClient)              | Stockage et recherche par similarité cosine   |
| Embeddings      | Sentence-Transformers `all-MiniLM-L6-v2` | Vectorisation des patterns et des requêtes    |
| Service         | Intégré au Python Service (FastAPI)       | Endpoints REST pour CRUD et recherche         |

### 9.3 Fonctionnement

```
Code soumis → Backend → fetchRAGPatterns(language, code, category)
                              │
                              ▼
                   POST /rag/retrieve (Python Service)
                              │
                              ├─ Encode query : "Code en {language} de catégorie {category}: {code[:500]}"
                              ├─ Recherche ChromaDB : cosine similarity, top 3
                              ├─ Filtre : language OU "all"
                              │
                              ▼
                   Patterns retournés avec score de similarité
                              │
                              ▼
                   augmentPromptWithPatterns(basePrompt, patterns)
                              │
                              ├─ Ajoute section "RÉFÉRENCES DE BONNES PRATIQUES (RAG-Augmented)"
                              ├─ Chaque pattern : rule, catégorie, sévérité, % confiance
                              │
                              ▼
                   Prompt augmenté → envoyé à Groq
```

### 9.4 Patterns par défaut (17 patterns)

| Catégorie    | Langages            | Exemples de patterns                                                    |
|--------------|---------------------|-------------------------------------------------------------------------|
| **Python**   | `python` (5)        | List comprehension, None comparison, context managers, hardcoded secrets, f-strings |
| **JavaScript** | `javascript` (4)  | const preferred, async/await, XSS prevention, no console.log           |
| **Java**     | `java` (3)          | try-with-resources, @Override, SQL injection prevention                 |
| **Général**  | `all` (4)           | Naming convention, comment clarity, no secrets in code, null check      |

### 9.5 API RAG (CRUD)

Tous les endpoints sont sur le Python Service (port 8000) :

| Méthode | Endpoint                | Description                              |
|---------|-------------------------|------------------------------------------|
| POST    | `/rag/retrieve`         | Recherche par similarité vectorielle     |
| GET     | `/rag/patterns`         | Liste tous les patterns                  |
| GET     | `/rag/patterns/{id}`    | Détail d'un pattern                      |
| POST    | `/rag/patterns`         | Crée un nouveau pattern                  |
| PUT     | `/rag/patterns/{id}`    | Met à jour un pattern                    |
| DELETE  | `/rag/patterns/{id}`    | Supprime un pattern                      |
| GET     | `/rag/stats`            | Statistiques (nombre de patterns, état)  |

### 9.6 Activation/Désactivation

- Variable d'environnement : `RAG_ENABLED=true|false` (défaut : `true`)
- Si désactivé : les prompts Groq sont envoyés sans augmentation
- Le RAG est **optionnel et non-bloquant** : en cas d'erreur, l'analyse continue normalement

---

## 10. Serveur MCP (Model Context Protocol)

### 10.1 Vue d'ensemble

Le serveur MCP expose les fonctionnalités de PolyCheck comme des **outils** accessibles via le protocole **JSON-RPC 2.0**, permettant l'intégration directe avec Claude Desktop, Claude Code et d'autres clients compatibles MCP.

### 10.2 Stack technique MCP

| Composant   | Technologie                    | Détail                                          |
|-------------|--------------------------------|-------------------------------------------------|
| Runtime     | PHP 8.1                        | Serveur HTTP intégré (`php -S`)                 |
| HTTP Client | Guzzle HTTP                    | Appels vers Backend et Python Service           |
| Protocole   | JSON-RPC 2.0                   | Conforme à la spec MCP `2025-03-26`             |
| Routing     | `public/index.php`             | POST `/mcp`, GET `/health`, GET `/` (dashboard) |

### 10.3 Méthodes JSON-RPC supportées

| Méthode       | Description                                    |
|---------------|------------------------------------------------|
| `initialize`  | Handshake MCP (version protocole, capabilities)|
| `ping`        | Vérification de connectivité                   |
| `tools/list`  | Liste les 11 outils disponibles                |
| `tools/call`  | Exécute un outil spécifique                    |

### 10.4 Outils MCP exposés (11)

| #  | Outil             | Description                                                     | Params requis                                     |
|----|-------------------|-----------------------------------------------------------------|---------------------------------------------------|
| 1  | `analyze_code`    | Analyse complète du code (IA + AST + RAG)                       | `code`, `language`                                |
| 2  | `list_reviews`    | Liste paginée des analyses précédentes                          | —                                                 |
| 3  | `get_review`      | Détail complet d'une analyse avec issues                        | `review_id`                                       |
| 4  | `delete_review`   | Suppression d'une analyse (cascade)                             | `review_id`                                       |
| 5  | `search_patterns` | Recherche vectorielle de patterns RAG                           | `code`, `language`, `category`                    |
| 6  | `list_patterns`   | Liste tous les patterns RAG                                     | —                                                 |
| 7  | `get_pattern`     | Détail d'un pattern spécifique                                  | `pattern_id`                                      |
| 8  | `create_pattern`  | Ajoute un pattern à la KB RAG                                   | `id`, `language`, `pattern`, `category`, `severity`, `rule` |
| 9  | `update_pattern`  | Modifie un pattern existant                                     | `pattern_id`                                      |
| 10 | `delete_pattern`  | Supprime un pattern de la KB                                    | `pattern_id`                                      |
| 11 | `get_rag_stats`   | Statistiques de la base de connaissances                        | —                                                 |

### 10.5 Dashboard de test

Un dashboard HTML est accessible sur `http://localhost:3002/` permettant de tester interactivement les outils MCP depuis le navigateur.

---

## 11. Système de logs

### 11.1 Architecture

Le système de logs utilise un **double stockage** :

| Couche              | Technologie        | Capacité        | Utilisation                     |
|---------------------|--------------------|-----------------|---------------------------------|
| Mémoire (FIFO)     | Buffer JS in-memory| 500 entrées max | Polling rapide depuis le frontend|
| Base de données     | MySQL `analysis_logs` | Illimité     | Persistance et audit            |

### 11.2 Niveaux de log

| Niveau  | Couleur UI | Utilisation                                    |
|---------|:----------:|------------------------------------------------|
| `info`  | bleu       | Étapes normales (analyse lancée, terminée)     |
| `warn`  | orange     | Service dégradé (timeout, fallback)            |
| `error` | rouge      | Erreurs (Groq invalide, service down)          |
| `debug` | gris       | Détails techniques (compteurs, métriques)      |

### 11.3 Rétention automatique

Le système conserve automatiquement les logs des **5 dernières analyses**. Les analyses plus anciennes et leurs logs associés sont supprimés en cascade.

### 11.4 Console de logs flottante (UI)

Le composant `LogConsole` est un panneau flottant (bottom-right) avec :
- **Polling temps réel** : fetch `GET /api/logs` toutes les 1 seconde
- **Auto-scroll** : défilement automatique vers le dernier log (désactivable)
- **Filtrage visuel** : couleurs par niveau + bordures latérales
- **Actions** : effacer les logs, fermer/ouvrir le panneau
- **Compteurs** : total de logs, nombre d'erreurs et avertissements

---

## 12. Interface utilisateur

### 12.1 Layout

| Zone            | Contenu                                                          |
|-----------------|------------------------------------------------------------------|
| **Header**      | Logo, tagline "Analyseur de code IA multi-langages", toggle thème|
| **Panel gauche**| Éditeur CodeMirror 6, sélecteur de langage, input filename, bouton analyser, compteur caractères/lignes |
| **Panel droit** | Résultats d'analyse OU état vide, badges statistiques, filtres, cartes d'issues |
| **Footer**      | Attribution "Propulsé par GroqCloud"                             |
| **Flottant**    | Console de logs (bottom-right)                                   |

### 12.2 Éditeur de code (CodeMirror 6)

- Coloration syntaxique pour 8 langages : Python, JavaScript, TypeScript, Java, Go, Rust, C, C++
- Thème adaptatif : s'adapte au thème dark/light
- Numéros de lignes
- Désactivation pendant l'analyse (état `loading`)

### 12.3 Système de thèmes

| Thème      | Base de couleurs                   | Détection                         |
|------------|------------------------------------|------------------------------------|
| **Dracula** (dark)  | Fond `#282a36`, accents violets  | `prefers-color-scheme: dark`     |
| **Light**           | Fond blanc, accents bleus        | `prefers-color-scheme: light`    |

- **Persistance** : `localStorage` clé `polycheck-theme`
- **Auto-détection** : media query système au premier chargement
- **Toggle** : bouton dans le header (icônes SVG soleil/lune)
- **Variables CSS** : toutes les couleurs sont dynamiques via `data-theme` attribute

### 12.4 Affichage des résultats

- **Badges statistiques colorés** : total, critical (rouge), high (orange), security, bugs, style
- **Filtres** : par catégorie (security, bug, style) et par sévérité
- **Cartes d'issues** : catégorie, sévérité, numéro de ligne, message, suggestion, source (Groq/AST)
- **Métriques de code** : lignes, fonctions, classes, longueur moyenne des fonctions
- **Section warnings** : services en erreur, timeouts, fallbacks utilisés

---

## 13. Gestion des erreurs et cas limites

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
| RAG indisponible            | Analyse continue sans augmentation + log warning     | 200       |
| 28 issues brutes reçues     | Dédup + cap → max 12 issues nettes                   | 200       |

---

## 14. Variables d'environnement

### GroqCloud

| Variable              | Requis | Défaut                    | Description                               |
|-----------------------|:------:|---------------------------|-------------------------------------------|
| `GROQ_API_KEY`        | oui    | —                         | Clé API GroqCloud                         |
| `GROQ_MODEL`          | non    | `llama-3.3-70b-versatile` | Modèle IA principal                       |
| `GROQ_MODEL_FALLBACK` | non   | `llama-3.1-8b-instant`    | Modèle de secours                         |
| `GROQ_TIMEOUT_MS`     | non    | `30000`                   | Timeout Groq en ms                        |

### MySQL

| Variable              | Requis | Défaut               | Description                               |
|-----------------------|:------:|----------------------|-------------------------------------------|
| `MYSQL_HOST`          | non    | `mysql`              | Hôte MySQL                                |
| `MYSQL_PORT`          | non    | `3306`               | Port MySQL                                |
| `MYSQL_USER`          | non    | `polycheck`          | Utilisateur MySQL                         |
| `MYSQL_PASSWORD`      | non    | `polycheck_secret`   | Mot de passe MySQL                        |
| `MYSQL_DATABASE`      | non    | `polycheck_db`       | Nom de la base de données                 |
| `MYSQL_ROOT_PASSWORD` | non    | `root_secret`        | Mot de passe root MySQL                   |

### Backend

| Variable              | Requis | Défaut                          | Description                  |
|-----------------------|:------:|---------------------------------|------------------------------|
| `BACKEND_PORT`        | non    | `3001`                          | Port d'écoute du backend     |
| `NODE_ENV`            | non    | `development`                   | Environnement Node.js        |
| `PYTHON_SERVICE_URL`  | non    | `http://python-service:8000`    | URL du service Python        |
| `PYTHON_TIMEOUT_MS`   | non    | `10000`                         | Timeout Python en ms         |

### RAG

| Variable              | Requis | Défaut                    | Description                               |
|-----------------------|:------:|---------------------------|-------------------------------------------|
| `RAG_ENABLED`         | non    | `true`                    | Active/désactive l'augmentation RAG       |
| `CHROMA_DB_PATH`      | non    | `/tmp/polycheck_chroma`   | Chemin de stockage ChromaDB               |

### Limites

| Variable              | Requis | Défaut                                     | Description                  |
|-----------------------|:------:|--------------------------------------------|------------------------------|
| `MAX_FILE_SIZE_BYTES` | non    | `51200`                                    | Taille max du code (50 Ko)   |
| `SUPPORTED_LANGUAGES` | non    | `python,javascript,typescript,java,go,rust,c,cpp` | Langages acceptés  |

### MCP Server

| Variable              | Requis | Défaut | Description                               |
|-----------------------|:------:|--------|-------------------------------------------|
| `MCP_SERVER_PORT`     | non    | `3002` | Port du serveur MCP                       |

### Frontend

| Variable              | Requis | Défaut                    | Description                               |
|-----------------------|:------:|---------------------------|-------------------------------------------|
| `VITE_API_BASE_URL`   | non    | `http://localhost:3001`   | URL de l'API backend pour le frontend     |

---

## 15. Déploiement

### Prérequis

- Docker Desktop >= 24
- Clé API GroqCloud : https://console.groq.com/keys

### Démarrage complet (Docker)

```bash
cp .env.example .env
# Renseignez GROQ_API_KEY dans .env
docker compose up --build
```

### Services Docker Compose (6 services)

| Service           | Image de base        | Dockerfile                    | Healthcheck           |
|-------------------|----------------------|-------------------------------|-----------------------|
| `mysql`           | `mysql:8.0`          | — (image officielle)          | `mysqladmin ping`     |
| `phpmyadmin`      | `phpmyadmin:latest`  | — (image officielle)          | —                     |
| `python-service`  | `python:3.12-slim`   | `python-service/Dockerfile`   | `curl /health`        |
| `backend`         | `node:20-alpine`     | `backend/Dockerfile`          | —                     |
| `mcp-server`      | PHP 8.1              | `mcp-server/Dockerfile`       | `curl /health`        |
| `frontend`        | `node:20-alpine`     | `frontend/Dockerfile`         | —                     |

### Ordre de démarrage (depends_on)

```
mysql (healthy) → phpmyadmin
                → python-service (healthy) ─┬─→ backend ──→ frontend
                                            └─→ mcp-server
```

### Volumes persistants

- `mysql_data` : données MySQL persistées entre redémarrages

### Développement local (sans Docker)

```bash
# MySQL seul via Docker
docker compose up mysql phpmyadmin -d

# Backend
cd backend && npm install
node src/index.js

# Service Python AST + RAG
cd python-service && pip install -r requirements.txt
uvicorn app:app --reload --port 8000

# MCP Server
cd mcp-server && composer install
php -S 0.0.0.0:3002 -t public

# Frontend
cd frontend && npm install
npm run dev
```

### Initialisation de la base de données

Le fichier `db/init.sql` est automatiquement exécuté au premier démarrage du conteneur MySQL. Il crée les tables `reviews`, `issues` et `analysis_logs` avec leurs index et contraintes de clé étrangère (CASCADE).

---

## 16. Tests

### Smoke tests (`tests/smoke.http`)

Fichier compatible REST Client (VS Code) et HTTPie.

```http
### Health check backend
GET http://localhost:3001/health

### Health check service Python AST
GET http://localhost:8000/health

### Health check MCP Server
GET http://localhost:3002/health

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

### MCP : initialize
POST http://localhost:3002/mcp
Content-Type: application/json

{ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {} }

### MCP : tools/list
POST http://localhost:3002/mcp
Content-Type: application/json

{ "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {} }

### RAG : lister les patterns
GET http://localhost:8000/rag/patterns

### RAG : statistiques
GET http://localhost:8000/rag/stats
```

---

## 17. Métriques cibles

| Indicateur                    | Valeur cible |
|-------------------------------|:------------:|
| Temps de réponse (p50)        | < 5 s        |
| Temps de réponse (p95)        | < 15 s       |
| Taille max fichier            | 50 Ko        |
| Langages supportés            | 8            |
| Issues brutes max (4 sources) | 30           |
| Issues après dédup + cap      | ≤ 12         |
| Timeout Groq par appel        | 30 s         |
| Timeout service Python AST    | 10 s         |
| Patterns RAG par défaut       | 17           |
| Rétention analyses            | 5 dernières  |
| Outils MCP exposés            | 11           |

---

## 18. Décisions techniques

| Date        | Décision                                           | Raison                                                         |
|-------------|-----------------------------------------------------|----------------------------------------------------------------|
| 2026-03-02  | `Promise.allSettled` pour les 4 analyses            | Une erreur d'un service ne bloque pas les autres               |
| 2026-03-02  | Groq `llama-3.3-70b-versatile`                      | Meilleur rapport qualité/vitesse sur tier gratuit              |
| 2026-03-02  | FastAPI + Pydantic pour le service Python            | Validation native + async + doc OpenAPI auto                   |
| 2026-03-02  | MySQL 8.0 avec UUID en PK                           | Portabilité, scalabilité horizontale, sans collision           |
| 2026-03-02  | Persistance non-bloquante (try/catch isolé)          | Service dégradé plutôt que panne totale                        |
| 2026-03-02  | Cap à 12 issues post-dédup                           | Optimiser le ratio signal/bruit pour l'utilisateur             |
| 2026-03-02  | Colonne `summary` en JSON natif MySQL 8.0            | Flexibilité pour évolutions futures du schéma                  |
| 2026-03-02  | Température Groq à 0.1                              | Réponses déterministes et reproductibles                       |
| 2026-03-10  | ChromaDB + Sentence-Transformers pour le RAG        | Base vectorielle légère, embeddings multilingues, pas de GPU   |
| 2026-03-10  | RAG optionnel (`RAG_ENABLED`)                       | Pas de régression si le service Python est lent au démarrage   |
| 2026-03-12  | Serveur MCP en PHP 8.1                              | Diversité technologique (exigence pédagogique), Guzzle HTTP    |
| 2026-03-12  | JSON-RPC 2.0 pour le protocole MCP                  | Conformité à la spécification MCP officielle                   |
| 2026-03-14  | Canonisation de règles dans l'agrégateur            | Fusion des variantes cross-catégories Groq (20+ mappings)      |
| 2026-03-14  | Dédup fuzzy ±3 lignes pour bare-except/division     | Groq reporte la même construction sur des lignes voisines      |
| 2026-03-15  | CodeMirror 6 au lieu de textarea                    | Coloration syntaxique, numéros de lignes, thèmes              |
| 2026-03-15  | Double stockage logs (mémoire + MySQL)              | Polling rapide pour l'UI + persistance pour audit              |
| 2026-03-15  | Rétention à 5 analyses                              | Éviter la croissance incontrôlée de la base de données         |

---

## 19. Évolutions post-MVP

### Court terme (v1.1)

- [ ] Cache Redis sur le hash SHA-256 pour éviter les ré-analyses identiques
- [ ] Pagination cursor-based pour les reviews (performances sur gros volumes)
- [ ] Support de fichiers multiples / ZIP
- [ ] Export CSV/PDF des résultats d'analyse

### Moyen terme (v2.0)

- [ ] Authentification JWT + espaces de travail par utilisateur
- [ ] Règles AST personnalisables via configuration YAML
- [ ] Webhook sortant (Slack, GitHub PR comments)
- [ ] Intégration CI/CD (GitHub Actions, GitLab CI)
- [ ] Support de l'analyse de dépôts Git distants
- [ ] Enrichissement continu de la KB RAG par apprentissage des analyses

### Long terme

- [ ] Fine-tuning du LLM sur des datasets de bugs réels
- [ ] Plugin VS Code natif
- [ ] Tableau de bord analytique (tendances, scores de qualité)
- [ ] Support multilingue de l'interface (i18n)
- [ ] Clustering de patterns RAG pour détection de tendances

---

*PolyCheck est un projet open-source sous licence MIT. Contributions bienvenues.*
