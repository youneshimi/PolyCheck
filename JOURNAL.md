# JOURNAL DE DEVELOPPEMENT - POLYCHECK

## 1. Objectif du projet
PolyCheck est un analyseur de code multi-langages qui combine :
- analyse IA (Groq)
- analyse statique (AST/heuristiques Python service)
- persistance des analyses (MySQL)
- exposition des fonctionnalites via API REST, CLI et MCP server

Objectif pedagogique : construire une architecture complete et modulaire, de l'interface utilisateur jusqu'aux integrations "agent-friendly" (MCP), en justifiant chaque choix technique.

---

## 2. Vision produit
Je voulais un outil qui puisse etre utilise de 3 facons :
- Interface web pour une utilisation rapide et visuelle.
- CLI terminal pour une utilisation dev/tooling.
- MCP server pour une utilisation par des assistants IA compatibles Model Context Protocol.

Cette triple entree m'a permis de montrer la meme logique metier sur plusieurs interfaces, sans dupliquer inutilement le coeur de l'analyse.

---

## 3. Choix technologiques et justifications

### Frontend (React + Vite + CodeMirror)
Pourquoi :
- React pour componentiser vite et proprement.
- Vite pour demarrage rapide et build simple.
- CodeMirror 6 pour un editeur de code robuste (syntaxe, lignes, UX de base).

Ce que j'ai cherche :
- une UI qui permet de coller/editer du code facilement
- une visualisation claire des issues et metriques
- un mode clair/sombre

### Backend (Node.js + Express)
Pourquoi :
- centralise l'orchestration des analyses (Groq + Python service)
- API REST simple a exposer au frontend, CLI et MCP
- middleware de securite/validation faciles a appliquer

### Python Service (FastAPI)
Pourquoi :
- FastAPI est tres adapte aux endpoints analytiques (validation Pydantic, performances correctes, code clair)
- Python est naturel pour l'analyse AST et la partie RAG (ecosysteme mature)

### MySQL
Pourquoi MySQL :
- base relationnelle simple et fiable pour stocker reviews/issues/logs
- structure claire (reviews -> issues en relation)
- facile a administrer et a requeter

### phpMyAdmin
Pourquoi :
- visualisation immediate de la base pendant le developpement
- verification rapide des insertions/suppressions sans scripts supplementaires

### MCP Server (PHP + Guzzle)
Pourquoi PHP ici :
- implementation legere d'un endpoint HTTP JSON-RPC
- tres rapide a mettre en place pour exposer les outils MCP
- separation nette entre couche MCP et couche backend metier

### Docker Compose
Pourquoi :
- lancer toute la stack avec une seule commande
- environnement reproductible
- facilite les tests de bout en bout

---

## 4. Pourquoi j'ai choisi Groq
J'ai choisi Groq pour avoir :
- un temps de reponse faible
- un bon rapport qualite/vitesse
- une integration API simple

Dans PolyCheck, Groq est utilise pour 3 analyses en parallele :
- bugs
- securite
- style

Ce design permet d'augmenter la couverture d'analyse sans bloquer tout le flux sur une seule "vision" du code.

### Strategie de robustesse Groq
J'ai implemente :
- un modele principal
- un modele fallback en cas de decommission/erreur
- des timeouts pour eviter les blocages
- une aggregation avec deduplication pour reduire le bruit

Donc Groq apporte l'intelligence semantique, et les autres composants controlent la fiabilite du resultat.

---

## 5. Comment j'ai trouve les technologies
Ma logique de selection a ete la suivante :
- besoin d'un orchestrateur API central -> Node/Express
- besoin d'analyse statique + RAG -> Python/FastAPI
- besoin de stockage structure -> MySQL
- besoin d'administration rapide DB -> phpMyAdmin
- besoin d'interface utilisateur moderne -> React + CodeMirror
- besoin d'integration IA outillee -> MCP server
- besoin d'execution locale reproductible -> Docker Compose

Autrement dit, je n'ai pas choisi une techno "a la mode", mais une techno qui repond a un besoin precis dans l'architecture.

---

## 6. Architecture fonctionnelle resumee
Flux principal d'une analyse :
1. utilisateur soumet du code (frontend ou CLI ou MCP)
2. backend valide la requete
3. backend lance en parallele :
   - analyse AST/Python service
   - analyse IA Groq (3 categories)
4. backend agrege, deduplique, priorise
5. backend persiste les donnees MySQL (non-bloquant)
6. resultat renvoye au client

Ce schema montre clairement la separation des responsabilites.

---

## 7. Outils que j'ai implementes

### 7.1 API Backend
Endpoints principaux :
- POST /api/analyze
- GET /api/reviews
- GET /api/reviews/:id
- DELETE /api/reviews/:id
- GET /api/logs
- GET /api/logs/stats
- DELETE /api/logs
- GET /health

Role :
- point central de toute l'application
- orchestration des services externes
- persistance et restitution des analyses

### 7.2 CLI Terminal (polycheck-cli)
Version CLI : 1.0.0

Commandes :
- polycheck analyze [file] [--stdin] [-l, --language]
- polycheck reviews list [-p, --page] [-n, --limit]
- polycheck reviews show <id>

Interet pedagogique :
- montrer que le backend est consommable sans interface web
- utile pour pipelines, scripts, et tests rapides

### 7.3 MCP Server
Version serveur MCP : 1.0.0
Version protocole MCP : 2025-03-26

Capacites exposees :
- tools/list
- tools/call

Outils MCP exposes (11) :
- analyze_code
- list_reviews
- get_review
- delete_review
- search_patterns
- list_patterns
- get_pattern
- create_pattern
- update_pattern
- delete_pattern
- get_rag_stats

Interet :
- rendre PolyCheck utilisable par des assistants IA (JSON-RPC 2.0)
- transformer le projet en "service outille" et pas seulement en app web

---

## 8. Fonctions et logique metier (comment ca marche)

### 8.1 Aggregation et deduplication
J'ai implemente une logique de reduction du bruit :
- canonicalisation des regles
- dedup exacte (regle + ligne)
- dedup fuzzy sur certains cas (fenetre de lignes)
- tri par severite/categorie/ligne
- cap du nombre d'issues (signal > bruit)

Pourquoi c'est important :
- les LLM peuvent repeter les memes problemes avec formulations differentes
- sans dedup, la qualite percue de l'outil baisse fortement

### 8.2 Persistance resiliente
Le backend tente d'enregistrer review/issues/logs en base, mais l'analyse n'est pas bloquee si la DB tombe.

Pourquoi :
- priorite a la disponibilite de l'analyse
- la persistance est importante, mais ne doit pas casser l'UX principale

### 8.3 Logs
J'ai ajoute des logs d'analyse et une retention (5 dernieres analyses) pour garder une trace exploitable sans saturer.

---

## 9. Protocole MCP et "inscription" des outils
J'ai suivi le schema MCP JSON-RPC :
1. initialize
2. tools/list
3. tools/call

L'"inscription" des outils se fait dans la definition serveur (build des tool definitions) avec :
- nom d'outil
- description
- schema d'entree (inputSchema)

Cela garantit que les clients IA savent exactement :
- quels outils existent
- quels arguments fournir
- quel format de reponse attendre

---

## 10. Interface utilisateur (UI) et parcours
L'interface presente :
- panneau gauche : editeur + selecteur langage + fichier + bouton analyser
- panneau droit : resultats, filtres, metriques
- zone de logs pour suivi runtime
- toggle theme clair/sombre

Objectif UX :
- permettre une boucle courte "coller code -> analyser -> comprendre issues"

---

## 11. Blocages rencontres
Le principal blocage du projet a ete :
- UI/UX frontend

C'est la seule partie qui m'a reellement freine.
Les parties backend, Python service, MCP et CLI ont ete construites de facon incrementale, etape par etape.

Concretement, les difficultes UI/UX ont porte sur :
- organisation lisible des informations (issues, severites, metriques)
- rendu responsive propre
- ergonomie generale de l'ecran de travail
- equilibre entre richesse d'info et simplicite visuelle

---

## 12. Deroulement du developpement (approche incrementale)
J'ai avance en increments, verifies par commits/push successifs.
Exemples visibles dans l'historique :
- base MVP
- dedup/canonicalisation/fuzzy merge
- ajout RAG (service + integration)
- ajout endpoints
- logs temps reel frontend
- persistance logs + retention
- MCP server v0.1
- UI v0.1
- CLI v0.1

Cette approche m'a aide a :
- isoler les problemes
- tester chaque etape
- reduire les regressions

---

## 13. Pourquoi cette architecture est coherente
Cette architecture est coherente car elle separe clairement :
- presentation (frontend)
- orchestration metier (backend)
- analyse specialisee (python-service)
- stockage (MySQL)
- exposition outillee IA (MCP)
- usage terminal/devops (CLI)

Chaque composant a une responsabilite claire, ce qui rend le projet :
- plus lisible
- plus testable
- plus evolutif

---

## 14. Versions et references techniques
- Backend package version : 1.0.0
- Frontend package version : 1.0.0
- CLI version : 1.0.0
- MCP server version : 1.0.0
- MCP protocol version : 2025-03-26
- Node.js cible : >=18
- PHP cible : ^8.1

---

## 15. Auto-evaluation personnelle
Points forts :
- architecture modulaire
- vraie integration multi-interface (Web + CLI + MCP)
- reduction du bruit via dedup intelligente
- progression incrementalement verifiable par commits

Point faible principal :
- maturite UI/UX (zone la plus difficile pour moi)

Plan d'amelioration :
- retravailler la hierarchie visuelle frontend
- renforcer le design responsive
- ameliorer la lisibilite des cartes/issues et des etats de chargement

---

## 16. Conclusion
PolyCheck n'est pas seulement une demo d'appel LLM.
C'est une application complete avec :
- architecture distribuee
- choix techniques justifies
- interfaces multiples
- protocole MCP operationnel
- logique de qualite (dedup, priorisation, resilience)

Le projet a ete mene pas a pas, avec une evolution tracee par commits/push.
Mon principal frein a ete l'UI/UX frontend, mais le coeur technique (backend, analyse, RAG, MCP, CLI, DB) a ete construit de maniere methodique et fonctionnelle.
