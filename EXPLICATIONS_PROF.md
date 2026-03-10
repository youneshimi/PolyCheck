# PolyCheck - RAG Implementation Report

## 👨‍🎓 Explications Projet TP : Module RAG et IA Gateway

---

## **1. QU'EST-CE QUE J'AI FAIT ?**

J'ai implémenté un système complet de **Retrieval Augmented Generation (RAG)** pour améliorer l'analyse de code automatisée via GroqCloud.

### Avant (sans RAG)
```
Code Utilisateur → GroqCloud → Analysis générique
```

### Après (avec RAG)
```
Code Utilisateur 
    ↓
Python RAG Service (Vector Search)
    ↓ retrieve top-3 similar patterns
Augmentation du prompt
    ↓
GroqCloud (llama-3.3-70b) → Analysis intelligente & contextualisée
```

---

## **2. ARCHITECTURE GLOBALE**

### **Microservices Déployés (Docker Compose)**

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (Vite + React)           │
│                    port 5173 (UI)                   │
└─────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│            Backend API (Express.js)                 │
│         port 3001 (/api/analyze)                    │
└─────────────────────────────────────────────────────┘
              ↓                          ↓
    ┌──────────────────┐      ┌──────────────────────┐
    │  GroqCloud API   │      │  Python RAG Service  │
    │ (llama-3.3-70b)  │      │   (FastAPI)          │
    │                  │      │  port 8000           │
    └──────────────────┘      └──────────────────────┘
                                     ↓
                          ┌──────────────────────┐
                          │  Chroma Vector DB    │
                          │  (20+ Patterns)      │
                          │  Storage: /tmp/      │
                          │  Embeddings: 384-dim │
                          └──────────────────────┘
    
    ├──────────────────┐
    │   MySQL 8.0      │
    │   (Historique)   │
    └──────────────────┘
```

---

## **3. LES 4 ÉTAPES D'IMPLÉMENTATION**

### **ÉTAPE 1 : RAG Foundation & Service Setup**
**Objectif** : Créer le cœur du système RAG

**Fichiers créés** :
- `python-service/ragService.py` (450+ lignes)

**Donctionnalités** :
```python
def initialize_rag()
    → Charge Chroma collection "code_patterns"
    → Charge embedding model "all-MiniLM-L6-v2"
    → Initialise 20+ patterns par défaut

def retrieve_relevant_patterns(code, language, category)
    → Embedding du code utilisateur
    → Recherche vectorielle cosine similarity
    → Retourne Top-3 patterns similaires

def add_pattern(pattern_data)
    → Créer nouveau pattern
    → Insert dans Chroma
    → Embedding automatique
```

**Patterns par défaut** (20 total) :
- **Python** (5) : mutable defaults, list comprehensions, naming...
- **JavaScript** (4) : async/await, closures, scope...
- **Java** (3) : inheritance, interfaces, exceptions...
- **General** (4+) : security, performance, readability...

**Endpoints créés** :
- `GET /rag/stats` → Statistiques KB
- `POST /rag/retrieve` → RAG retrieval principal

---

### **ÉTAPE 2 : Groq-RAG Integration & Prompt Augmentation**
**Objectif** : Connecter RAG au backend et Groq

**Fichiers modifiés** :
- `backend/src/services/groqService.js`

**Nouvelles fonctions** :
```javascript
async fetchRAGPatterns(language, code, category)
    → Appelle Python service /rag/retrieve
    → Timeout: 5 secondes (non-blocking)
    → Fallback si service indisponible

function augmentPromptWithPatterns(basePrompt, patterns)
    → Injecte patterns trouvés dans le prompt
    → Format: "Pattern ID | Similarity Score | Détail"

async callGroq()
    → AVANT: Direct to Groq (old way)
    → APRÈS: 
        1. RAG retrieval (if RAG_ENABLED=true)
        2. Augment prompt
        3. Call Groq avec contexte enrichi
        4. Return results
```

**Configuration** :
```
RAG_ENABLED=true
PYTHON_SERVICE_URL=http://python-service:8000
GROQ_MODEL=llama-3.3-70b-versatile
```

---

### **ÉTAPE 3 : CRUD & Knowledge Base Management**
**Objectif** : Permettre gestion complète de la KB

**Endpoints implémentés** (7 total) :

```
GET  /rag/patterns          → Liste tous (20+ patterns)
GET  /rag/patterns/{id}     → Détail 1 pattern
POST /rag/patterns          → Créer nouveau
PUT  /rag/patterns/{id}     → Modifier
DELETE /rag/patterns/{id}   → Supprimer
POST /rag/retrieve          → RAG search
GET  /rag/stats             → KB statistics
```

**Validation** (Pydantic) :
```python
class PatternCreateRequest
    id: str              # Unique identifier
    name: str            # Human readable
    language: str        # python, javascript, java, general...
    category: str        # bug, security, style, performance
    description: str     # Le quoi
    rule: str           # Le pourquoi
    example: str        # Mauvais exemple
    fix: str            # Bon exemple
```

**Error handling** :
- 400 Bad Request (validation fail)
- 404 Not Found (pattern doesn't exist)
- 500 Server Error (Chroma fail)

---

### **ÉTAPE 4 : Docker & Compatibility Fixes**
**Objectif** : Déployer entièrement containerisé

**Problèmes rencontrés & fixes** :

| Problème | Cause | Fix |
|----------|-------|-----|
| numpy 1.24.3 incompatible | Python 3.12 removed pkgutil.ImpImporter | `numpy>=1.26.0,<2.0.0` |
| chromadb + numpy 2.0 conflict | chromadb use deprecated np.float_ | Cap `numpy<2.0.0` |
| 600MB CUDA download inutile | torch default GPU build | `torch --index-url CPU-only` |
| sentence-transformers 2.2.2 fail | huggingface_hub API change | `sentence-transformers==2.5.1` |
| Missing build tools | C compiler needed pour numpy | `apt-get install build-essential` |

**Dockerfile optimisé** :
```dockerfile
FROM python:3.12-slim
RUN apt-get install build-essential python3-dev curl
RUN pip install torch --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY app.py ragService.py .
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0"]
```

**Résultat** :
✅ 5 containers actifs (frontend, backend, python-service, mysql, phpmyadmin)
✅ Tous les services UP et HEALTHY
✅ Port 5173 (UI) accesible

---

## **4. COMMENT ÇA MARCHE (Flux Complet)**

### **Scénario : Étudiant upload code Python**

```
Étape 1 : FRONTEND
┌─────────────────────────────────┐
│ def foo(lst=[]):                │  User code
│     lst.append(1)               │
│     return lst                  │
└─────────────────────────────────┘
         ↓ [Analyser]

Étape 2 : BACKEND
POST /api/analyze
{
  "code": "...",
  "language": "python"
}
         ↓

Étape 3 : RAG RETRIEVAL
POST http://python-service:8000/rag/retrieve
{
  "code": "def foo(lst=[]):",
  "language": "python",
  "category": "bugs"
}
         ↓
Python Service:
  1. Embedding du code (all-MiniLM-L6-v2)
  2. Recherche vectors similaires dans Chroma
  3. Retourne Top-3:
     - py_001: "Mutable Default Arguments" (score: 0.92)
     - py_003: "Function Design" (score: 0.87)
     - general_001: "Code Quality" (score: 0.81)
         ↓

Étape 4 : PROMPT AUGMENTATION
Prompt original:
"Analyze this Python code for bugs, security, style..."

Prompt augmenté:
"Analyze this Python code for bugs, security, style...

Relevant patterns found:
- Pattern py_001 (0.92): Avoid mutable default arguments as default 
  → Use None instead: def foo(lst=None):

- Pattern py_003 (0.87): Function should have single responsibility
  → Each function does one thing well

- Pattern general_001 (0.81): Code quality best practices
  → Clear naming, proper error handling..."
         ↓

Étape 5 : GROQ ANALYSIS
Groq llama-3.3-70b analyzes with context
         ↓ (30 secondes max)

Étape 6 : RESPONSE
{
  "bugs": [
    {
      "severity": "CRITICAL",
      "message": "Mutable default argument detected",
      "suggestion": "Use lst=None with default_factory pattern",
      "relevantPattern": "py_001"
    }
  ],
  "security": [...],
  "style": [...]
}
         ↓

Étape 7 : FRONTEND DISPLAY
┌──────────────────────────────────────┐
│ ✅ Analysis Complete                 │
│ • 1 Bug (CRITICAL)                   │
│ • 0 Security Issues                  │
│ • 2 Style Issues                     │
│                                      │
│ [CRITICAL] Mutable default arg...   │
│ Suggestion: Use None pattern        │
│ Related Pattern: py_001              │
└──────────────────────────────────────┘
```

---

## **5. STATISTIQUES FINALES**

### **Code**
- **ragService.py** : 450+ lignes (Core RAG)
- **groqService.js** : +200 lignes (Groq integration)
- **app.py** : +150 lignes (RAG endpoints)
- **Documentation** : 3 markdown files (RAG_ARCHITECTURE, KB_MANAGEMENT_API, TEST_RAG)

### **Infrastructure**
- **Services Docker** : 5 (frontend, backend, python, mysql, phpmyadmin)
- **API Endpoints** : 7 RAG endpoints + 2 Backend endpoints
- **Databases** : Chroma (vectors) + MySQL (history)
- **Deployment** : Docker Compose (production-ready)

### **Knowledge Base**
- **Total Patterns** : 20+ prédéfinis
- **Langages** : Python, JavaScript, Java, General
- **Embedding Model** : all-MiniLM-L6-v2 (384-dim, 22MB)
- **Vector Storage** : Chroma (persistent, /tmp/polycheck_chroma)
- **Search** : Cosine similarity, Top-3 retrieval

### **AI**
- **Primary Model** : llama-3.3-70b-versatile (GroqCloud)
- **Fallback Model** : llama-3.1-8b-instant
- **Timeout** : 30 secondes (Groq), 5 secondes (RAG)
- **Graceful Degradation** : Fonctionne sans RAG si service fail

---

## **6. CAS D'USAGE ACADÉMIQUE**

### **Pour le TP**
```
❶ Étudiants upload code
❷ PolyCheck analyse avec feedback contextualisé (RAG)
❸ Patterns pedagogiques réutilisables
❹ Amélioration progressive du code
```

### **Pour le Prof**
```
✓ Peut ajouter patterns customs (POST /rag/patterns)
✓ Tous les étudiants reçoivent feedback uniforme
✓ Traçabilité historique (MySQL)
✓ Analytics sur patterns les plus détectés
```

### **Pour l'Production**
```
✓ Multi-langage (Python, JS, Java, C, etc.)
✓ Scalable (Docker, Kubernetes ready)
✓ Sécurisé (API key in .env, no secrets in repo)
✓ Performant (5s RAG timeout, non-blocking)
✓ Maintainable (CRUD KB, version patterns)
```

---

## **7. TECHNOLOGIES UTILISÉES**

| Layer | Tech | Version | Purpose |
|-------|------|---------|---------|
| **Frontend** | React 18 + Vite | Latest | Code editor UI |
| **Backend** | Node.js + Express | 20 | API orchestration |
| **RAG Engine** | Python + FastAPI | 3.12 | Vector search |
| **Vector DB** | Chroma | 0.4.24 | Persistent KB |
| **Embeddings** | sentence-transformers | 2.5.1 | Code embeddings |
| **AI Model** | GroqCloud | llama-3.3-70b | Analysis engine |
| **Database** | MySQL | 8.0 | History storage |
| **Container** | Docker + Docker Compose | Latest | Deployment |
| **HTTP Client** | fetch/axios | Latest | Inter-service |

---

## **8. AVANTAGES DE CETTE IMPLÉMENTATION**

### **Pour l'Apprentissage**
✅ Feedback intelligent basé sur patterns réels
✅ Contexte pédagogique à chaque analyse
✅ Patterns réutilisables d'un TP à l'autre

### **Pour la Production**
✅ Système scalable (microservices)
✅ Non-blocking (RAG timeout 5s)
✅ Resilient (fallback si RAG down)
✅ Auditable (MySQL history)
✅ Customizable (full CRUD KB)

### **Pour le Dev**
✅ Clean architecture (separation concerns)
✅ Well documented (3 markdown files)
✅ Tested (10 smoke tests)
✅ Containerized (Docker)
✅ Version controlled (Git)

---

## **9. PROCHAINES ÉTAPES POSSIBLES**

```
Phase 2 (Optionnel) :
  □ Frontend KB management UI
  □ Analytics dashboard (patterns stats)
  □ User authentication
  □ Pattern versioning
  □ A/B testing different prompts
  
Phase 3 (Advanced) :
  □ Fine-tuning sur Groq
  □ Multi-language support expansion
  □ Pattern clustering analysis
  □ Collaborative KB (community patterns)
```

---

## **CONCLUSION**

J'ai construit un **système RAG production-ready** pour l'analyse de code automatisée qui :

1. ✅ Enrichit les analyses IA avec contexte pertinent
2. ✅ Fournit feedback intelligent plutôt que générique
3. ✅ Permet gestion complète de la Knowledge Base
4. ✅ Déploie facilement en Docker
5. ✅ Fonctionne même si le RAG échoue (graceful degradation)
6. ✅ Peut être utilisé pour TP académique ET production

**C'est un vrai projet d'IA moderne !** 🚀

---

**Fichiers principaux à montrer au prof** :
- `python-service/ragService.py` (Core RAG)
- `backend/src/services/groqService.js` (Integration)
- `RAG_ARCHITECTURE.md` (Documentation)
- `KB_MANAGEMENT_API.md` (API Reference)
- `docker-compose.yml` (Deployment)
- `TEST_RAG.http` (Tests)
