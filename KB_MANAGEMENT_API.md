# 📚 API Documentation - Knowledge Base Management

## Endpoints CRUD pour les Patterns

### 1. **GET /rag/patterns** - Lister tous les patterns

Récupère la liste complète de tous les patterns de la base de connaissances.

**Request:**
```bash
curl -X GET http://localhost:8000/rag/patterns
```

**Response (200):**
```json
{
  "status": "ok",
  "total": 20,
  "patterns": [
    {
      "id": "py_001",
      "pattern": "Use list comprehension instead of loop",
      "language": "python",
      "category": "style",
      "severity": "low",
      "rule": "PEP8_COMPREHENSION"
    },
    ...
  ]
}
```

---

### 2. **GET /rag/patterns/{pattern_id}** - Obtenir un pattern spécifique

Récupère les détails d'un pattern par son ID.

**Request:**
```bash
curl -X GET http://localhost:8000/rag/patterns/py_001
```

**Response (200):**
```json
{
  "status": "ok",
  "pattern": {
    "id": "py_001",
    "pattern": "Use list comprehension instead of loop",
    "language": "python",
    "category": "style",
    "severity": "low",
    "rule": "PEP8_COMPREHENSION",
    "document": "Language: python\nPattern: Use list comprehension instead of loop\n..."
  }
}
```

**Response (404):**
```json
{
  "detail": "Pattern 'invalid_id' non trouvé"
}
```

---

### 3. **POST /rag/patterns** - Créer un nouveau pattern

Ajoute un nouveau pattern à la base de connaissances.

**Request:**
```bash
curl -X POST http://localhost:8000/rag/patterns \
  -H "Content-Type: application/json" \
  -d '{
    "id": "custom_001",
    "language": "python",
    "pattern": "Use logging instead of print statements",
    "category": "style",
    "severity": "medium",
    "rule": "LOGGING_PREFERRED",
    "bad_example": "print(debug_info)",
    "good_example": "logger.debug(debug_info)"
  }'
```

**Champs requis:**
- `id`: Identifiant unique (string)
- `language`: Langage (python, javascript, java, typescript, go, rust, c, cpp, all)
- `pattern`: Description du pattern (string)
- `category`: bug, security, ou style
- `severity`: critical, high, medium, ou low
- `rule`: Identifiant court pour la règle (string)

**Champs optionnels:**
- `bad_example`: Exemple de code à éviter
- `good_example`: Exemple de code recommandé

**Response (200):**
```json
{
  "status": "ok",
  "message": "Pattern créé",
  "pattern": {
    "id": "custom_001",
    "language": "python",
    "pattern": "Use logging instead of print statements",
    "category": "style",
    "severity": "medium",
    "rule": "LOGGING_PREFERRED"
  }
}
```

**Response (400) - Erreur:**
```json
{
  "detail": "Champs manquants: rule, category"
}
```

---

### 4. **PUT /rag/patterns/{pattern_id}** - Mettre à jour un pattern

Met à jour un pattern existant (mise à jour partielle).

**Request:**
```bash
curl -X PUT http://localhost:8000/rag/patterns/py_001 \
  -H "Content-Type: application/json" \
  -d '{
    "severity": "high",
    "good_example": "result = [item * 2 for item in items if item > 0]"
  }'
```

**Champs modifiables:**
- `language`, `pattern`, `category`, `severity`, `rule`
- `bad_example`, `good_example`

**Response (200):**
```json
{
  "status": "ok",
  "message": "Pattern mis à jour",
  "pattern": {
    "language": "python",
    "pattern": "Use list comprehension instead of loop",
    "category": "style",
    "severity": "high",
    "rule": "PEP8_COMPREHENSION"
  }
}
```

**Response (404):**
```json
{
  "detail": "Pattern 'invalid_id' non trouvé"
}
```

---

### 5. **DELETE /rag/patterns/{pattern_id}** - Supprimer un pattern

Supprime un pattern de la base de connaissances.

**Request:**
```bash
curl -X DELETE http://localhost:8000/rag/patterns/custom_001
```

**Response (200):**
```json
{
  "status": "ok",
  "message": "Pattern 'custom_001' supprimé"
}
```

**Response (404):**
```json
{
  "detail": "Pattern 'invalid_id' non trouvé"
}
```

---

## Endpoints de Recherche

### **POST /rag/retrieve** - Récupérer patterns pertinents

Recherche les patterns les plus similaires à un code donné.

**Request:**
```bash
curl -X POST http://localhost:8000/rag/retrieve \
  -H "Content-Type: application/json" \
  -d '{
    "code": "result = []\nfor item in items:\n    result.append(item * 2)",
    "language": "python",
    "category": "style"
  }'
```

**Response (200):**
```json
{
  "patterns": [
    {
      "id": "py_001",
      "pattern": "Use list comprehension instead of loop",
      "language": "python",
      "category": "style",
      "severity": "low",
      "rule": "PEP8_COMPREHENSION",
      "similarity_score": 0.94
    },
    ...
  ],
  "augmented_context": "# ─── RÉFÉRENCES DE BONNES PRATIQUES (RAG-Augmented) ───\n..."
}
```

---

### **GET /rag/stats** - Statistiques de la base

Récupère des informations sur la base de patterns.

**Request:**
```bash
curl -X GET http://localhost:8000/rag/stats
```

**Response (200):**
```json
{
  "status": "ok",
  "total_patterns": 20,
  "description": "Base de patterns de bonnes pratiques pour l'analyse de code"
}
```

---

## Exemples d'usage avec Python

### Lister tous les patterns
```python
import requests

response = requests.get('http://localhost:8000/rag/patterns')
patterns = response.json()['patterns']

for p in patterns:
    print(f"{p['id']} - {p['rule']} ({p['language']})")
```

### Créer un pattern personnalisé
```python
import requests

new_pattern = {
    "id": "js_custom_001",
    "language": "javascript",
    "pattern": "Always use === instead of ==",
    "category": "bug",
    "severity": "high",
    "rule": "USE_STRICT_EQUALITY",
    "bad_example": "if (x == 5) { ... }",
    "good_example": "if (x === 5) { ... }"
}

response = requests.post('http://localhost:8000/rag/patterns', json=new_pattern)
if response.status_code == 200:
    print(f"✅ Pattern créé: {response.json()['pattern']['id']}")
else:
    print(f"❌ Erreur: {response.json()['detail']}")
```

### Mettre à jour un pattern
```python
import requests

update_data = {
    "severity": "critical",
    "rule": "STRICT_EQUALITY_REQUIRED"
}

response = requests.put(
    'http://localhost:8000/rag/patterns/js_custom_001',
    json=update_data
)
print(response.json())
```

### Supprimer un pattern
```python
import requests

response = requests.delete('http://localhost:8000/rag/patterns/js_custom_001')
print(response.json())
```

---

## Codes HTTP

| Code | Signification |
|------|---------------|
| 200 | Succès |
| 400 | Erreur de requête (validation) |
| 404 | Pattern non trouvé |
| 500 | Erreur serveur |

---

## Cas d'usage - Workflow complet

```python
import requests

# 1. Lister tous les patterns
print("📚 Patterns actuels:")
response = requests.get('http://localhost:8000/rag/patterns')
print(f"Total: {response.json()['total']} patterns")

# 2. Créer un pattern personnalisé
print("\n✨ Création d'un pattern personnalisé...")
new_pattern = {
    "id": "team_rule_001",
    "language": "python",
    "pattern": "Always use type hints",
    "category": "style",
    "severity": "medium",
    "rule": "TYPE_HINTS_REQUIRED",
    "bad_example": "def add(a, b):\n    return a + b",
    "good_example": "def add(a: int, b: int) -> int:\n    return a + b"
}
r = requests.post('http://localhost:8000/rag/patterns', json=new_pattern)
print(f"Statut: {r.json()['status']}")

# 3. Récupérer le pattern créé
print("\n📖 Récupération du pattern...")
r = requests.get('http://localhost:8000/rag/patterns/team_rule_001')
print(r.json()['pattern'])

# 4. Chercher des patterns pertinents pour un code
print("\n🔍 Recherche de patterns pertinents...")
code_to_analyze = "def multiply(x, y):\n    return x * y"
r = requests.post('http://localhost:8000/rag/retrieve', json={
    "code": code_to_analyze,
    "language": "python",
    "category": "style"
})
print(f"Patterns trouvés: {len(r.json()['patterns'])}")

# 5. Mettre à jour le pattern
print("\n🔄 Mise à jour du pattern...")
r = requests.put('http://localhost:8000/rag/patterns/team_rule_001', json={
    "severity": "high"
})
print(f"Statut: {r.json()['status']}")

# 6. Statistiques
print("\n📊 Statistiques...")
r = requests.get('http://localhost:8000/rag/stats')
print(r.json())
```

Output:
```
📚 Patterns actuels:
Total: 20 patterns

✨ Création d'un pattern personnalisé...
Statut: ok

📖 Récupération du pattern...
{'id': 'team_rule_001', 'pattern': 'Always use type hints', ...}

🔍 Recherche de patterns pertinents...
Patterns trouvés: 3

🔄 Mise à jour du pattern...
Statut: ok

📊 Statistiques...
{'status': 'ok', 'total_patterns': 21, 'description': '...'}
```

---

## Intégration avec Backend Node.js

Le backend peut appeler ces endpoints pour exposer une API REST unifiée :

```javascript
// backend/src/routes/knowledgeBase.js
const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://python-service:8000';

// GET /api/knowledge-base/patterns
router.get('/patterns', async (req, res) => {
    try {
        const response = await fetch(`${PYTHON_SERVICE_URL}/rag/patterns`);
        const data = await response.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/knowledge-base/patterns
router.post('/patterns', async (req, res) => {
    try {
        const response = await fetch(`${PYTHON_SERVICE_URL}/rag/patterns`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Et ainsi de suite pour PUT, DELETE, GET /{id}...

module.exports = router;
```

---

**Auteur:** youneshimi  
**Date:** Mars 2026  
**Version**: 1.0  
**Licence:** MIT
