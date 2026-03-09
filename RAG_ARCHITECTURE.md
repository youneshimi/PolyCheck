# 🔄 Architecture RAG - PolyCheck

## Vue d'ensemble

PolyCheck implémente une architecture **Retrieval Augmented Generation (RAG)** qui enrichit les analyses IA avec une base de bonnes pratiques contextualisées.

## Flux d'exécution

```
Utilisateur soumet code
        ↓
[Backend Node.js - groqService.js]
        ↓
    callGroq(language, code, category)
        ↓
    ┌─ Appel RAG (optionnel)
    │   └→ [Service Python - /rag/retrieve]
    │       ├→ Embed le code
    │       ├→ Rechercher patterns similaires (Chroma)
    │       └→ Retourner top-3 patterns pertinents
    │
    ├─ Augmenter prompt avec patterns trouvés
    │
    └─ Appeler Groq avec prompt enrichi
            ↓
        [GroqCloud]
            ↓
        Analyse augmentée
            ↓
        Retourner résultats
```

## Composants

### 1. **Service Python RAG** (`python-service/ragService.py`)

Gère une base vectorielle de patterns de bonnes pratiques.

**Fonctionnalités:**
- Initialisation Chroma (stockage persistant)
- Modèle d'embeddings `sentence-transformers`
- Base de 20+ patterns par défaut (Python, JS, Java, General)
- Endpoint `/rag/retrieve` pour retrouver patterns par similarité

**Base de patterns par défaut:**

| ID | Language | Pattern | Rule | Catégorie |
|----|----------|---------|------|-----------|
| py_001 | Python | List comprehension over loop | PEP8_COMPREHENSION | style |
| py_003 | Python | File ops with context manager | FILE_CONTEXT_MANAGER | style |
| py_004 | Python | Avoid hardcoded secrets | HARDCODED_SECRET | security |
| js_001 | JavaScript | Const by default | CONST_PREFERRED | style |
| js_003 | JavaScript | Validate input for XSS | XSS_PREVENTION | security |
| java_001 | Java | Try-with-resources | TRY_WITH_RESOURCES | style |
| general_003 | all | Never commit secrets | NO_SECRETS_IN_CODE | security |
| ... | ... | ... | ... | ... |

### 2. **Service Groq augmenté** (`backend/src/services/groqService.js`)

Intègre RAG pour enrichir les prompts envoyés à GroqCloud.

**Nouvelles fonctions:**
- `fetchRAGPatterns(language, code, category)` - Appelle `/rag/retrieve` du service Python
- `augmentPromptWithPatterns(basePrompt, patterns)` - Enrichit le prompt avec règles trouvées
- `callGroq(language, code, category)` - Exécute RAG puis Groq

**Exemple de prompt augmenté:**
```
Tu es un expert en détection de bugs pour le langage python.
...

# ─── RÉFÉRENCES DE BONNES PRATIQUES (RAG-Augmented) ───
Tenez compte de ces patterns pertinents dans votre analyse :

📌 **HARDCODED_SECRET** (Règle: Avoid hardcoded secrets)
   - Catégorie: security | Sévérité: critical
   - Pertinence: 94% confiance

📌 **FILE_CONTEXT_MANAGER** (Règle: Use context managers for file operations)
   - Catégorie: style | Sévérité: high
   - Pertinence: 87% confiance

⚠️ Si des problèmes correspondent à ces patterns, mentionnez le rule ID dans votre réponse.
```

## Configuration

### Variables d'environnement

| Variable | Type | Défaut | Description |
|----------|------|--------|-------------|
| `RAG_ENABLED` | bool | true | Active/désactive l'augmentation RAG |
| `PYTHON_SERVICE_URL` | string | `http://python-service:8000` | URL du service Python |
| `CHROMA_DB_PATH` | string | `/tmp/polycheck_chroma` | Chemin stockage vectoriel |

### Exemple `.env`
```bash
# Activer RAG
RAG_ENABLED=true

# URL du service Python (local dev ou Docker)
PYTHON_SERVICE_URL=http://python-service:8000

# Stockage de la base vectorielle
CHROMA_DB_PATH=/tmp/polycheck_chroma
```

## Endpoints RAG

### Service Python (`python-service`)

#### `POST /rag/retrieve`
Récupère les patterns les plus pertinents pour un code donné.

**Request:**
```json
{
  "code": "import os\napi_key = 'sk_...'",
  "language": "python",
  "category": "security"
}
```

**Response:**
```json
{
  "patterns": [
    {
      "id": "py_004",
      "pattern": "Avoid hardcoded secrets",
      "language": "python",
      "category": "security",
      "severity": "critical",
      "rule": "HARDCODED_SECRET",
      "similarity_score": 0.94
    },
    ...
  ],
  "augmented_context": "# ─── RÉFÉRENCES DE BONNES PRATIQUES (RAG-Augmented) ───\n..."
}
```

#### `GET /rag/stats`
Récupère les stats de la base de patterns.

**Response:**
```json
{
  "status": "ok",
  "total_patterns": 20,
  "description": "Base de patterns de bonnes pratiques pour l'analyse de code"
}
```

## Sécurité et performance

### Performance
- **Timeout RAG:** 5 secondes (optional, ne bloque pas l'analyse)
- **Limitation code:** 1000 premiers caractères (pour embeddings rapides)
- **Top-K patterns:** 3 patterns par requête
- **Modèle embeddings:** `all-MiniLM-L6-v2` (lightweight, 22MB)

### Failover
- Si RAG échoue : l'analyse Groq continue sans augmentation
- Si service Python indisponible : warning dans logs, analyse continue
- `RAG_ENABLED=false` pour désactiver complètement

## Cas d'usage

### ✅ Recommandé

1. **Analyse de sécurité** — RAG aide à trouver secrets/injections
2. **Analyse de style** — Patterns de bonnes pratiques du langage
3. **Projets multilingues** — Patterns spécifiques au langage détectés

### ❌ Non recommandé

- Code très court (<50 chars) — Patterns peu pertinents
- Analyse temps-réel critique — RAG ajoute ~500ms
- Stockage cloud limité — Chroma persistant nécessaire

## Extension future

### Ajouter patterns personnalisés

```python
# Dans ragService.py, ajouter à _load_default_patterns()
custom_pattern = {
    "id": "custom_001",
    "language": "python",
    "pattern": "Use logging instead of print",
    "bad_example": "print(debug_info)",
    "good_example": "logger.debug(debug_info)",
    "category": "style",
    "severity": "low",
    "rule": "LOGGING_PREFERRED"
}
```

### Optimisations post-MVP

- [ ] Support multi-utilisateurs (DB des patterns par user)
- [ ] Patterns dynamiques via API
- [ ] Analytics des patterns détectés
- [ ] Clustering automatique des patterns similaires
- [ ] Fine-tuning du modèle embeddings par domaine

## Dépannage

### RAG ne fonctionne pas
```bash
# 1. Vérifier service Python
curl http://localhost:8000/rag/stats

# 2. Vérifier logs Docker
docker-compose logs python-service

# 3. Désactiver temporairement
RAG_ENABLED=false docker-compose up
```

### Service Python ne démarre pas
```bash
# Réinstaller dependances
pip install -r python-service/requirements.txt

# Vérifier Chroma
ls -la /tmp/polycheck_chroma/
```

## Métriques

- **Temps moyen RAG:** ~400ms
- **Patterns base:** 20 patterns de base (extensible)
- **Modèle embeddings:** all-MiniLM-L6-v2 (384 dimensions)
- **Similarité moyenne:** 0.75-0.95
- **Couverture langages:** Python, JavaScript, Java, Go, Rust, C, C++

---

**Auteur:** youneshimi  
**Date:** Mars 2026  
**Licence:** MIT
