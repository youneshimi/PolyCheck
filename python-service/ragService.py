"""
RAG Service - Retrieval Augmented Generation pour PolyCheck
Gère une base de patterns de bonnes pratiques et les récupère pour enrichir les analyses.
"""

import chromadb
import os
from typing import List, Dict
from sentence_transformers import SentenceTransformer

# Initialisation de Chroma
CHROMA_DB_PATH = os.getenv("CHROMA_DB_PATH", "/tmp/polycheck_chroma")
chroma_client = None
collection = None
embedding_model = None

def initialize_rag():
    """Initialise la base Chroma et le modèle d'embeddings."""
    global chroma_client, collection, embedding_model
    
    chroma_client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
    
    # Créer ou récupérer la collection
    collection = chroma_client.get_or_create_collection(
        name="code_patterns",
        metadata={"hnsw:space": "cosine"}
    )
    
    # Modèle d'embeddings (multi-lingua, léger)
    embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
    
    # Initialiser les patterns par défaut si la collection est vide
    if collection.count() == 0:
        _load_default_patterns()
    
    print(f"✅ RAG Service initialisé. Collection: {collection.count()} patterns")

def _load_default_patterns():
    """Charge les patterns de bonnes pratiques par défaut."""
    
    default_patterns = [
        # ─── Python Patterns ───
        {
            "id": "py_001",
            "language": "python",
            "pattern": "Use list comprehension instead of loop",
            "bad_example": "result = []\nfor item in items:\n    result.append(item * 2)",
            "good_example": "result = [item * 2 for item in items]",
            "category": "style",
            "severity": "low",
            "rule": "PEP8_COMPREHENSION"
        },
        {
            "id": "py_002",
            "language": "python",
            "pattern": "Always use == for None comparisons",
            "bad_example": "if value is not None:",
            "good_example": "if value is not None:",
            "category": "style",
            "severity": "medium",
            "rule": "NONE_COMPARISON"
        },
        {
            "id": "py_003",
            "language": "python",
            "pattern": "Use context managers for file operations",
            "bad_example": "f = open('file.txt')\ndata = f.read()\nf.close()",
            "good_example": "with open('file.txt') as f:\n    data = f.read()",
            "category": "style",
            "severity": "high",
            "rule": "FILE_CONTEXT_MANAGER"
        },
        {
            "id": "py_004",
            "language": "python",
            "pattern": "Avoid hardcoded secrets",
            "bad_example": "API_KEY = 'sk_live_abc123xyz'",
            "good_example": "API_KEY = os.getenv('API_KEY')",
            "category": "security",
            "severity": "critical",
            "rule": "HARDCODED_SECRET"
        },
        {
            "id": "py_005",
            "language": "python",
            "pattern": "Use f-strings instead of .format()",
            "bad_example": "msg = 'Hello {}'.format(name)",
            "good_example": "msg = f'Hello {name}'",
            "category": "style",
            "severity": "low",
            "rule": "FSTRING_PREFERRED"
        },
        
        # ─── JavaScript Patterns ───
        {
            "id": "js_001",
            "language": "javascript",
            "pattern": "Use const by default, let only when reassignment needed",
            "bad_example": "var x = 5;\nvar y = x + 1;",
            "good_example": "const x = 5;\nconst y = x + 1;",
            "category": "style",
            "severity": "medium",
            "rule": "CONST_PREFERRED"
        },
        {
            "id": "js_002",
            "language": "javascript",
            "pattern": "Async/await instead of promise chains",
            "bad_example": "function getData() {\n  return fetch('/api').then(r => r.json());\n}",
            "good_example": "async function getData() {\n  const r = await fetch('/api');\n  return r.json();\n}",
            "category": "style",
            "severity": "medium",
            "rule": "ASYNC_AWAIT_PREFERRED"
        },
        {
            "id": "js_003",
            "language": "javascript",
            "pattern": "Validate user input to prevent XSS",
            "bad_example": "document.getElementById('div').innerHTML = userInput;",
            "good_example": "document.getElementById('div').textContent = userInput;",
            "category": "security",
            "severity": "critical",
            "rule": "XSS_PREVENTION"
        },
        {
            "id": "js_004",
            "language": "javascript",
            "pattern": "No console logs in production",
            "bad_example": "console.log(apiKey);",
            "good_example": "logger.debug(apiKey);  // ou retirer complètement",
            "category": "security",
            "severity": "high",
            "rule": "NO_CONSOLE_LOGS"
        },
        
        # ─── Java Patterns ───
        {
            "id": "java_001",
            "language": "java",
            "pattern": "Use try-with-resources for AutoCloseable",
            "bad_example": "BufferedReader br = new BufferedReader(...);\nString line = br.readLine();\nbr.close();",
            "good_example": "try (BufferedReader br = new BufferedReader(...)) {\n  String line = br.readLine();\n}",
            "category": "style",
            "severity": "high",
            "rule": "TRY_WITH_RESOURCES"
        },
        {
            "id": "java_002",
            "language": "java",
            "pattern": "Use @Override annotation when overriding methods",
            "bad_example": "public String toString() { return \"MyClass\"; }",
            "good_example": "@Override\npublic String toString() { return \"MyClass\"; }",
            "category": "style",
            "severity": "low",
            "rule": "OVERRIDE_ANNOTATION"
        },
        {
            "id": "java_003",
            "language": "java",
            "pattern": "Validate SQL queries to prevent SQL injection",
            "bad_example": "String query = \"SELECT * FROM users WHERE id = \" + userId;",
            "good_example": "String query = \"SELECT * FROM users WHERE id = ?\";\npreparedStatement.setInt(1, userId);",
            "category": "security",
            "severity": "critical",
            "rule": "SQL_INJECTION_PREVENTION"
        },
        
        # ─── General Patterns ───
        {
            "id": "general_001",
            "language": "all",
            "pattern": "Meaningful variable names",
            "bad_example": "x = y * z",
            "good_example": "total_price = unit_price * quantity",
            "category": "style",
            "severity": "medium",
            "rule": "NAMING_CONVENTION"
        },
        {
            "id": "general_002",
            "language": "all",
            "pattern": "Add comments for complex logic",
            "bad_example": "# Calculate x = (a * b) / (c - d)",
            "good_example": "# Discount percentage calculation\nx = (base_price * discount_rate) / (max_items - minimum_order)",
            "category": "style",
            "severity": "low",
            "rule": "COMMENT_CLARITY"
        },
        {
            "id": "general_003",
            "language": "all",
            "pattern": "Never commit secrets (API keys, tokens, passwords)",
            "bad_example": "API_KEY='sk_test_xxxx'\nDATABASE_PASSWORD='admin123'",
            "good_example": "Load from environment variables or .env file",
            "category": "security",
            "severity": "critical",
            "rule": "NO_SECRETS_IN_CODE"
        },
        {
            "id": "general_004",
            "language": "all",
            "pattern": "Check for null/undefined before using",
            "bad_example": "obj.property.nested_property",
            "good_example": "if (obj && obj.property) { return obj.property.nested_property; }",
            "category": "bug",
            "severity": "high",
            "rule": "NULL_CHECK"
        },
    ]
    
    # Ajouter les patterns à Chroma
    for pattern in default_patterns:
        # Créer un document texte pour l'embedding
        doc_text = f"""
        Language: {pattern['language']}
        Pattern: {pattern['pattern']}
        Category: {pattern['category']}
        Rule: {pattern['rule']}
        Bad: {pattern['bad_example']}
        Good: {pattern['good_example']}
        """
        
        collection.add(
            ids=[pattern['id']],
            documents=[doc_text],
            metadatas=[{
                "language": pattern['language'],
                "pattern": pattern['pattern'],
                "category": pattern['category'],
                "severity": pattern['severity'],
                "rule": pattern['rule']
            }],
            embeddings=[embedding_model.encode(doc_text).tolist()]
        )
    
    print(f"✅ {len(default_patterns)} patterns de base chargés")

def retrieve_relevant_patterns(code: str, language: str, category: str, top_k: int = 3) -> List[Dict]:
    """
    Récupère les patterns les plus similaires au code fourni.
    
    Args:
        code: Le code à analyser
        language: Le langage de programmation
        category: La catégorie d'analyse (bug, security, style)
        top_k: Nombre de patterns à récupérer
    
    Returns:
        Liste des patterns les plus pertinents
    """
    
    if not chroma_client or not collection:
        return []
    
    try:
        # Créer un query text pertinent
        query_text = f"Code en {language} de catégorie {category}: {code[:500]}"
        
        # Convertir en embedding
        query_embedding = embedding_model.encode(query_text).tolist()
        
        # Rechercher dans Chroma
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where={"$or": [
                {"language": language},
                {"language": "all"}
            ]} if language != "all" else None
        )
        
        if not results or not results['ids'] or len(results['ids']) == 0:
            return []
        
        # Formater les résultats
        patterns = []
        for i, pattern_id in enumerate(results['ids'][0]):
            metadata = results['metadatas'][0][i]
            distance = results['distances'][0][i]
            
            patterns.append({
                "id": pattern_id,
                "pattern": metadata.get('pattern', ''),
                "language": metadata.get('language', ''),
                "category": metadata.get('category', ''),
                "severity": metadata.get('severity', ''),
                "rule": metadata.get('rule', ''),
                "similarity_score": 1 - distance  # Convertir distance en similarité
            })
        
        return patterns
    
    except Exception as e:
        print(f"❌ Erreur retrieval RAG: {str(e)}")
        return []

def augment_prompt_with_patterns(base_prompt: str, patterns: List[Dict]) -> str:
    """
    Augmente le prompt original avec les patterns trouvés.
    """
    
    if not patterns:
        return base_prompt
    
    augmented = base_prompt + "\n\n# ─── BONNES PRATIQUES À CONSIDÉRER (RAG-Augmented) ───\n"
    
    for pattern in patterns:
        augmented += f"\n📌 **{pattern['rule']}** (Similarité: {pattern['similarity_score']:.2%})\n"
        augmented += f"   - Pattern: {pattern['pattern']}\n"
        augmented += f"   - Catégorie: {pattern['category']}\n"
    
    augmented += "\nUtilisez ces patterns pour enrichir votre analyse.\n"
    
    return augmented


# ─── CRUD Operations pour KB Management ─────────────────────────────────────

def list_all_patterns() -> List[Dict]:
    """
    Liste tous les patterns de la collection.
    
    Returns:
        Liste de tous les patterns avec métadonnées
    """
    
    if not collection:
        return []
    
    try:
        all_data = collection.get(include=["metadatas", "documents", "embeddings"])
        
        patterns = []
        for i, pattern_id in enumerate(all_data['ids']):
            metadata = all_data['metadatas'][i]
            patterns.append({
                "id": pattern_id,
                "pattern": metadata.get('pattern', ''),
                "language": metadata.get('language', ''),
                "category": metadata.get('category', ''),
                "severity": metadata.get('severity', ''),
                "rule": metadata.get('rule', ''),
            })
        
        return patterns
    except Exception as e:
        print(f"❌ Erreur list_all_patterns: {str(e)}")
        return []


def get_pattern(pattern_id: str) -> Dict:
    """
    Récupère un pattern spécifique par son ID.
    
    Args:
        pattern_id: ID unique du pattern
    
    Returns:
        Données du pattern ou dict vide si non trouvé
    """
    
    if not collection:
        return {}
    
    try:
        result = collection.get(ids=[pattern_id], include=["metadatas", "documents"])
        
        if not result['ids'] or len(result['ids']) == 0:
            return {}
        
        metadata = result['metadatas'][0]
        document = result['documents'][0] if result['documents'] else ""
        
        return {
            "id": pattern_id,
            "pattern": metadata.get('pattern', ''),
            "language": metadata.get('language', ''),
            "category": metadata.get('category', ''),
            "severity": metadata.get('severity', ''),
            "rule": metadata.get('rule', ''),
            "document": document,
        }
    except Exception as e:
        print(f"❌ Erreur get_pattern: {str(e)}")
        return {}


def add_pattern(pattern_data: Dict) -> Dict:
    """
    Ajoute un nouveau pattern à la collection.
    
    Args:
        pattern_data: Dict avec
            - id: ID unique
            - language: Langage (python, javascript, all, etc.)
            - pattern: Description du pattern
            - category: bug, security, ou style
            - severity: critical, high, medium, low
            - rule: Identifiant court (e.g. "PEP8_COMPREHENSION")
            - bad_example: (optionnel) Code à éviter
            - good_example: (optionnel) Code recommandé
    
    Returns:
        Dict avec status et pattern créé ou message d'erreur
    """
    
    if not collection or not embedding_model:
        return {"status": "error", "message": "RAG non initialisé"}
    
    try:
        # Validation
        required = ['id', 'language', 'pattern', 'category', 'severity', 'rule']
        missing = [k for k in required if k not in pattern_data or not pattern_data[k]]
        if missing:
            return {"status": "error", "message": f"Champs manquants: {', '.join(missing)}"}
        
        # Vérifier que le pattern n'existe pas déjà
        existing = collection.get(ids=[pattern_data['id']])
        if existing['ids']:
            return {"status": "error", "message": f"Pattern avec ID '{pattern_data['id']}' existe déjà"}
        
        # Créer le document texte pour embedding
        doc_text = f"""
        Language: {pattern_data['language']}
        Pattern: {pattern_data['pattern']}
        Category: {pattern_data['category']}
        Rule: {pattern_data['rule']}
        Bad: {pattern_data.get('bad_example', '')}
        Good: {pattern_data.get('good_example', '')}
        """
        
        # Ajouter à Chroma
        collection.add(
            ids=[pattern_data['id']],
            documents=[doc_text],
            metadatas=[{
                "language": pattern_data['language'],
                "pattern": pattern_data['pattern'],
                "category": pattern_data['category'],
                "severity": pattern_data['severity'],
                "rule": pattern_data['rule']
            }],
            embeddings=[embedding_model.encode(doc_text).tolist()]
        )
        
        print(f"✅ Pattern ajouté: {pattern_data['id']}")
        return {"status": "ok", "message": "Pattern créé", "pattern": pattern_data}
    
    except Exception as e:
        print(f"❌ Erreur add_pattern: {str(e)}")
        return {"status": "error", "message": str(e)}


def update_pattern(pattern_id: str, pattern_data: Dict) -> Dict:
    """
    Met à jour un pattern existant.
    
    Args:
        pattern_id: ID du pattern à mettre à jour
        pattern_data: Nouvelles données (mêmes champs que add_pattern)
    
    Returns:
        Dict avec status et pattern mis à jour ou message d'erreur
    """
    
    if not collection or not embedding_model:
        return {"status": "error", "message": "RAG non initialisé"}
    
    try:
        # Vérifier que le pattern existe
        existing = collection.get(ids=[pattern_id])
        if not existing['ids']:
            return {"status": "error", "message": f"Pattern '{pattern_id}' non trouvé"}
        
        # Fusionner les données existantes avec les nouvelles
        old_metadata = existing['metadatas'][0]
        new_metadata = {
            "language": pattern_data.get('language', old_metadata.get('language')),
            "pattern": pattern_data.get('pattern', old_metadata.get('pattern')),
            "category": pattern_data.get('category', old_metadata.get('category')),
            "severity": pattern_data.get('severity', old_metadata.get('severity')),
            "rule": pattern_data.get('rule', old_metadata.get('rule'))
        }
        
        # Créer le nouveau document
        doc_text = f"""
        Language: {new_metadata['language']}
        Pattern: {new_metadata['pattern']}
        Category: {new_metadata['category']}
        Rule: {new_metadata['rule']}
        Bad: {pattern_data.get('bad_example', '')}
        Good: {pattern_data.get('good_example', '')}
        """
        
        # Mettre à jour dans Chroma
        collection.update(
            ids=[pattern_id],
            documents=[doc_text],
            metadatas=[new_metadata],
            embeddings=[embedding_model.encode(doc_text).tolist()]
        )
        
        print(f"✅ Pattern mis à jour: {pattern_id}")
        return {"status": "ok", "message": "Pattern mis à jour", "pattern": new_metadata}
    
    except Exception as e:
        print(f"❌ Erreur update_pattern: {str(e)}")
        return {"status": "error", "message": str(e)}


def delete_pattern(pattern_id: str) -> Dict:
    """
    Supprime un pattern de la collection.
    
    Args:
        pattern_id: ID du pattern à supprimer
    
    Returns:
        Dict avec status et message
    """
    
    if not collection:
        return {"status": "error", "message": "RAG non initialisé"}
    
    try:
        # Vérifier que le pattern existe
        existing = collection.get(ids=[pattern_id])
        if not existing['ids']:
            return {"status": "error", "message": f"Pattern '{pattern_id}' non trouvé"}
        
        # Supprimer de Chroma
        collection.delete(ids=[pattern_id])
        
        print(f"✅ Pattern supprimé: {pattern_id}")
        return {"status": "ok", "message": f"Pattern '{pattern_id}' supprimé"}
    
    except Exception as e:
        print(f"❌ Erreur delete_pattern: {str(e)}")
        return {"status": "error", "message": str(e)}
