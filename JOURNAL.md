# JOURNAL.md – PolyCheck

> Journal de développement du MVP PolyCheck.
> Format : Date · Auteur · Action · Statut

---

## [2026-03-02] – Initialisation du projet

### ✅ Réalisé
- [ ] Création de l'arborescence complète du projet
- [ ] Configuration Docker Compose (5 services)
- [ ] Schéma MySQL (`reviews` + `issues`) avec FK et index
- [ ] Backend Express : routes `/api/analyze` et `/api/reviews`
- [ ] Service Python FastAPI : analyse AST + heuristiques
- [ ] Intégration GroqCloud (3 analyses parallèles)
- [ ] Agrégateur + priorisation (`critical > high > medium > low`)
- [ ] Frontend Vite + React : éditeur + filtres + affichage
- [ ] Gestion des cas limites (fichier vide, trop gros, langage non supporté, timeouts)
- [ ] `.env.example` + `.gitignore`
- [ ] `README.md` complet
- [ ] `tests/smoke.http`

### 🔧 En cours
- _Rien pour le moment_

### ❌ Bloquants
- _Aucun_

---

## Template pour les prochaines entrées

```
## [YYYY-MM-DD] – <Titre de la session>

### ✅ Réalisé
- [ ] <tâche 1>
- [ ] <tâche 2>

### 🔧 En cours
- <tâche en cours>

### ❌ Bloquants
- <problème rencontré et solution envisagée>

### 📝 Notes
- <observations, décisions techniques, compromis>
```

---

## [2026-03-09] – Intégration RAG & Knowledge Base Management

### ✅ Réalisé
- [x] Ajouter dépendances RAG (chromadb, sentence-transformers)
- [x] Créer ragService.py avec base de 20+ patterns
- [x] Implémenter Retrieval patterns similaires (Chroma)
- [x] Ajouter endpoints `/rag/retrieve` et `/rag/stats`
- [x] Intégrer RAG dans groqService.js (augmentation prompts)
- [x] Ajouter configuration RAG (.env)
- [x] Implémenter CRUD patterns (`list`, `get`, `create`, `update`, `delete`)
- [x] Ajouter endpoints `/rag/patterns*` pour KB management
- [x] Documentation complète (RAG_ARCHITECTURE.md + KB_MANAGEMENT_API.md)
- [x] Smoke tests (tests/knowledge-base.http)

### 🔧 En cours
- _Aucun_

### ❌ Bloquants
- _Aucun_

### 📝 Notes
- RAG est optionnel (RAG_ENABLED=true par défaut, peut être désactivé)
- Service Python exécute patterns embedding = ~400ms par requête
- Patterns base est persistante via Chroma (résiliente redémarrage)
- Modèle embeddings lightweight: all-MiniLM-L6-v2 (22MB)
- CORS mise à jour pour PUT/DELETE
- Architecture : Code → RAG Service → Groq (augmenté) → Résultats

---

## Décisions techniques

| Date         | Décision                                 | Raison                                  |
|--------------|------------------------------------------|-----------------------------------------|
| 2026-03-02  | Groq llama3-70b-8192 pour les 3 analyses | Meilleur rapport qualité/vitesse gratuit |
| 2026-03-02  | FastAPI pour le service Python           | Validation Pydantic native + async      |
| 2026-03-02  | MySQL 8.0 avec UUID en PK                | Portabilité + scalabilité               |
| 2026-03-02  | Les 3 analyses Groq en parallèle         | Réduire le temps de réponse à ~1/3      |
| 2026-03-02  | Persistance non-bloquante                | L'analyse retourne même si MySQL est down |

---

## Métriques MVP

| Indicateur                | Valeur cible |
|---------------------------|--------------|
| Temps de réponse (p50)    | < 5s         |
| Temps de réponse (p95)    | < 15s        |
| Taille max fichier        | 50 Ko        |
| Langages supportés        | 8            |
| Issues max par analyse    | 30 (10 × 3)  |
