# 🧪 GUIDE COMPLET : Tester le RAG sur le Frontend

## **1️⃣ ACCÉDEZ AU FRONTEND**

Ouvrez votre navigateur et allez à :
```
http://localhost:5173
```

Vous devriez voir :
- Code editor (zone de texte)
- Language selector (C, Python, JavaScript, etc.)
- Bouton "Analyser" (bleu)

---

## **2️⃣ TESTEZ AVEC DU CODE PYTHON (RECOMMANDÉ)**

### **Test 1 : Mutable Default Arguments (Pattern py_001)**

**Collez ce code dans l'éditeur :**
```python
def add_item(item, lst=[]):
    lst.append(item)
    return lst

result1 = add_item(1)
result2 = add_item(2)
print(result1)  # Output: [1, 2] NOT [1]
```

**Sélectionnez :** Python
**Cliquez :** "Analyser"

**Attendu :**
```
✅ Analysis Complete
• Bugs: 1 (CRITICAL)
• Security: 0
• Style: 1

[CRITICAL] Mutable default argument
Message: The function parameter 'lst' has a mutable default value
Suggestion: Use lst=None with if lst is None: lst = []
Related Pattern: py_001
```

---

### **Test 2 : SQL Injection (Pattern general_002)**

**Collez ce code :**
```python
import mysql.connector

def get_user(username):
    conn = mysql.connector.connect(user='root', password='password', database='db')
    cursor = conn.cursor()
    query = "SELECT * FROM users WHERE name = '" + username + "'"
    cursor.execute(query)
    return cursor.fetchall()

user = get_user("admin' OR '1'='1")
```

**Sélectionnez :** Python
**Cliquez :** "Analyser"

**Attendu :**
```
✅ Analysis Complete
• Bugs: 0
• Security: 1 (CRITICAL)
• Style: 1

[CRITICAL] SQL Injection vulnerability
Message: String concatenation in SQL query dangerous
Suggestion: Use parameterized queries with ?
Related Pattern: general_002
```

---

### **Test 3 : Code Quality (Multiple Patterns)**

**Collez ce code :**
```python
def calc(a,b,c):
    x=a+b
    y=x*c
    z=y-a
    return z

def process(data):
    for i in range(len(data)):
        print(data[i])

result = calc(1,2,3)
```

**Sélectionnez :** Python
**Cliquez :** "Analyser"

**Attendu :**
```
✅ Analysis Complete
• Bugs: 0
• Security: 0
• Style: 4

[STYLE] Variable naming
Message: Variable names should be descriptive
Suggestion: Use meaningful names like 'sum_value' not 'x'

[STYLE] Function length
Message: Function should have single responsibility
Related Pattern: py_003

[STYLE] Spacing
Message: PEP8: Use spacing around operators
Suggestion: x = a + b (not x=a+b)
```

---

## **3️⃣ TESTEZ AVEC JAVASCRIPT**

### **Test 4 : Async/Await Pattern (js_001)**

**Collez ce code :**
```javascript
function fetchData() {
    fetch('https://api.example.com/data')
        .then(response => response.json())
        .then(data => console.log(data))
        .catch(error => console.error(error));
}

fetchData();
console.log("Data loading..."); // Executes before fetchData
```

**Sélectionnez :** JavaScript
**Cliquez :** "Analyser"

**Attendu :**
```
✅ Analysis Complete
• Bugs: 1
• Security: 0
• Style: 1

[BUG] Async/await pattern
Message: Using .then() instead of async/await is less readable
Suggestion: Use async/await syntax
Related Pattern: js_001
```

---

## **4️⃣ VÉRIFIEZ QUE LE RAG FONCTIONNE**

### **Vérification dans les LOGS Docker**

Ouvrez un terminal et lancez :
```bash
docker-compose logs python-service -f
```

**Attendu** : Vous devriez voir lors de l'analyse :
```
INFO:     POST /rag/retrieve
INFO:     Retrieving patterns for python code...
INFO:     Found 3 similar patterns:
         - py_001 (similarity: 0.92)
         - general_001 (similarity: 0.87)
         - py_003 (similarity: 0.81)
```

---

## **5️⃣ VISUALISEZ TOUT LE FLUX**

### **Commandes pour monitorer en temps réel**

**Terminal 1 - Voir les logs du service Python RAG :**
```bash
docker-compose logs python-service -f
```

**Terminal 2 - Voir les logs du Backend :**
```bash
docker-compose logs backend -f
```

**Terminal 3 - Frontend (navigateur) :**
```
http://localhost:5173
```

### **Flux complet à observer :**

```
1. Frontend : [Code] → [Analyser] → POST /api/analyze
   
   ↓ (Backend logs)
   
2. Backend : POST http://python-service:8000/rag/retrieve
   
   ↓ (Python logs)
   
3. RAG Service : Embed code → Search Chroma → Return Top-3
   
   ↓ (Backend logs)
   
4. Backend : Augment prompt with patterns → POST GroqCloud
   
   ↓ (30 secondes attente)
   
5. Groq Analysis : llama-3.3-70b analyzes with context
   
   ↓
   
6. Frontend : Display results [Bugs] [Security] [Style]
```

---

## **6️⃣ TESTS SANS CODE BUGUÉ (PAS RECOMMANDÉ)**

Si vous testez avec du **code parfait** (0 bugs) :

```python
def greet(name):
    return f"Hello, {name}!"

result = greet("World")
print(result)
```

**Attendu :**
```
✅ Analysis Complete
• Bugs: 0
• Security: 0
• Style: 0

No issues found – Clean code!
```

Le RAG fonctionne toujours même sans patterns détectés ! 🎯

---

## **7️⃣ TESTS AVANCÉS (OPTIONAL)**

### **Test l'API Python RAG directement**

Ouvrez **TEST_RAG.http** dans VS Code avec REST Client, et lancez :

```http
### Tester RAG Retrieval directement
POST http://localhost:8000/rag/retrieve
Content-Type: application/json

{
  "code": "def foo(lst=[]):\n    lst.append(1)\n    return lst",
  "language": "python",
  "category": "bugs"
}
```

**Réponse attendue :**
```json
{
  "patterns": [
    {
      "id": "py_001",
      "name": "Mutable Default Arguments",
      "similarity": 0.92,
      "rule": "Never use mutable objects as default arguments"
    },
    {
      "id": "py_003",
      "name": "Function Design",
      "similarity": 0.87,
      "rule": "..."
    }
  ]
}
```

---

## **8️⃣ CHECKLIST DE VÉRIFICATION**

| Test | Étape | Attendu | ✅/❌ |
|------|-------|---------|-------|
| **Frontend UP** | http://localhost:5173 | Page charge | |
| **Code Python** | Collez le code mutable defaults | UI responsive | |
| **Analyser** | Click bouton | Requête envoyée | |
| **RAG Triggered** | Voir logs python-service | POST /rag/retrieve | |
| **Patterns Retrieved** | Logs Python | Found 3 similar patterns | |
| **Groq Call** | Logs Backend | Calling GroqCloud API | |
| **Results Display** | Frontend | Bugs/Security/Style affichés | |
| **Pattern Link** | Frontend UI | "Related Pattern: py_001" | |

---

## **9️⃣ TROUBLESHOOTING**

### **"Service Python indisponible"**
```bash
# Vérifier le status
docker-compose ps

# Voir les erreurs
docker-compose logs python-service --tail=100
```

### **Pas de patterns trouvés**
```bash
# Vérifier que Chroma est initialisé
curl http://localhost:8000/rag/stats

# Doit retourner:
# {"total_patterns": 20, "collection": "code_patterns"}
```

### **Analyze très lent (> 35 secondes)**
- Groq timeout = 30s
- Total timeout = 30s (Groq) + 5s (RAG) = 35s max
- Si > 35s = Groq API is slow (normal parfois)

### **Groq API Error**
```bash
# Vérifier que l'API key est bonne dans .env
cat .env | grep GROQ_API_KEY
```

---

## **🎯 RÉSUMÉ DES TESTS RECOMMANDÉS**

**Ordre de test suggéré :**

1. ✅ **Test Simple** : Mutable defaults (py_001) → Voir bug détecté
2. ✅ **Test Moyen** : SQL Injection (security) → Voir 2 catégories
3. ✅ **Test Complet** : Code messy → Voir 4+ style issues
4. ✅ **Test JavaScript** : Async/await → Multi-langage
5. ✅ **Test Vide** : Code parfait → See 0 issues

**Durée totale** : ~3-5 minutes par test (30s Groq API)

---

## **📊 CE QUE VOUS VERREZ**

```
┌─────────────────────────────────────────────┐
│ PolyCheck - Analyseur de code IA            │
├─────────────────────────────────────────────┤
│                                             │
│ [Language: Python ▼]  [Analyser] 🚀       │
│                                             │
│ ┌───────────────────────────────────────┐  │
│ │ def foo(lst=[]):                      │  │
│ │     lst.append(1)                     │  │
│ │     return lst                        │  │
│ └───────────────────────────────────────┘  │
│                                             │
│ ✅ Analysis Complete                        │
│ ┌─────────────────────────────────────┐   │
│ │ Total: 1   │ Bugs: 1   │ Security: 0│   │
│ │ Bugs: 2    │ Style: 0                │   │
│ └─────────────────────────────────────┘   │
│                                             │
│ [CRITICAL] Mutable default argument         │
│ Location: Line 1                           │
│ Severity: ⚠️ HIGH                          │
│ Message: The parameter 'lst' has a        │
│          mutable default value             │
│                                             │
│ Fix: Use lst=None pattern                 │
│      Related Pattern: py_001               │
│                                             │
│ Source: GroqCloud (llama-3.3-70b)          │
│ RAG Context: 3 patterns found              │
│                                             │
└─────────────────────────────────────────────┘
```

---

**PRÊT ? GO ! 🚀**

Lancez les tests maintenant et dites-moi si ça marche ! 💪
