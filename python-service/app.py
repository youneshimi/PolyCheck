"""
PolyCheck - Service d'analyse AST Python
Fournit une analyse statique minimale du code source.
Supporte nativement Python (AST built-in) et des heuristiques pour les autres langages.
"""

import ast
import os
import re
import tokenize
import io
from typing import Optional, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

# ─── Configuration ────────────────────────────────────────────────────────────
MAX_FILE_SIZE_BYTES = int(os.getenv("MAX_FILE_SIZE_BYTES", "51200"))
SUPPORTED_LANGUAGES = os.getenv(
    "SUPPORTED_LANGUAGES",
    "python,javascript,typescript,java,go,rust,c,cpp"
).split(",")

# ─── App FastAPI ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="PolyCheck AST Service",
    version="1.0.0",
    description="Service d'analyse statique de code source",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ─── Modèles Pydantic ─────────────────────────────────────────────────────────
class AnalyzeRequest(BaseModel):
    language: str
    code: str

    @field_validator("language")
    @classmethod
    def validate_language(cls, v: str) -> str:
        lang = v.strip().lower()
        if lang not in SUPPORTED_LANGUAGES:
            raise ValueError(f"Langage non supporté : '{v}'. Langages : {', '.join(SUPPORTED_LANGUAGES)}")
        return lang

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Le code est vide.")
        byte_size = len(v.encode("utf-8"))
        if byte_size > MAX_FILE_SIZE_BYTES:
            raise ValueError(f"Code trop volumineux : {byte_size} octets (max : {MAX_FILE_SIZE_BYTES}).")
        return v


class Issue(BaseModel):
    category:   str
    severity:   str
    line:       Optional[int] = None
    column:     Optional[int] = None
    rule:       str
    message:    str
    suggestion: Optional[str] = None
    source:     str = "ast"


class Metrics(BaseModel):
    lines_of_code:     int = 0
    blank_lines:       int = 0
    comment_lines:     int = 0
    num_functions:     int = 0
    num_classes:       int = 0
    avg_function_length: float = 0.0


class AnalyzeResponse(BaseModel):
    language: str
    issues:   List[Issue]
    metrics:  Metrics


# ─── Analyseur Python (AST natif) ────────────────────────────────────────────

class PythonASTAnalyzer(ast.NodeVisitor):
    """Analyse statique Python via le module ast standard."""

    def __init__(self):
        self.issues: List[dict] = []
        self.function_lengths: List[int] = []
        self.num_classes = 0
        self.num_functions = 0

    def visit_FunctionDef(self, node: ast.FunctionDef):
        self.num_functions += 1
        length = (node.end_lineno or node.lineno) - node.lineno + 1
        self.function_lengths.append(length)

        # Fonction trop longue
        if length > 50:
            self.issues.append({
                "category":   "style",
                "severity":   "medium",
                "line":       node.lineno,
                "rule":       "function-too-long",
                "message":    f"La fonction '{node.name}' est trop longue ({length} lignes). Limite recommandée : 50.",
                "suggestion": "Décomposez cette fonction en fonctions plus petites.",
            })

        # Trop d'arguments
        arg_count = len(node.args.args)
        if arg_count > 7:
            self.issues.append({
                "category":   "style",
                "severity":   "medium",
                "line":       node.lineno,
                "rule":       "too-many-arguments",
                "message":    f"La fonction '{node.name}' a {arg_count} paramètres (max recommandé : 7).",
                "suggestion": "Regroupez les paramètres dans un objet/dataclass.",
            })

        # Docstring manquante
        if not (node.body and isinstance(node.body[0], ast.Expr) and isinstance(node.body[0].value, ast.Constant)):
            if length > 10:
                self.issues.append({
                    "category":   "style",
                    "severity":   "low",
                    "line":       node.lineno,
                    "rule":       "missing-docstring",
                    "message":    f"La fonction '{node.name}' n'a pas de docstring.",
                    "suggestion": "Ajoutez une docstring décrivant le but, les paramètres et les valeurs de retour.",
                })

        self.generic_visit(node)

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_ClassDef(self, node: ast.ClassDef):
        self.num_classes += 1
        self.generic_visit(node)

    def visit_Try(self, node: ast.Try):
        for handler in node.handlers:
            # bare except
            if handler.type is None:
                self.issues.append({
                    "category":   "bug",
                    "severity":   "high",
                    "line":       handler.lineno,
                    "rule":       "bare-except",
                    "message":    "Clause 'except:' sans type d'exception (bare except). Masque toutes les erreurs.",
                    "suggestion": "Spécifiez le type d'exception : `except ValueError:` ou `except Exception as e:`.",
                })
            # except Exception trop générique
            elif isinstance(handler.type, ast.Name) and handler.type.id == "Exception":
                if not handler.name:
                    self.issues.append({
                        "category":   "bug",
                        "severity":   "medium",
                        "line":       handler.lineno,
                        "rule":       "broad-exception",
                        "message":    "Capture de 'Exception' trop générique sans liaison ('as e').",
                        "suggestion": "Utilisez `except Exception as e:` et loguez l'erreur.",
                    })
        self.generic_visit(node)

    def visit_Import(self, node: ast.Import):
        for alias in node.names:
            if alias.name == "*":
                self.issues.append({
                    "category":   "style",
                    "severity":   "medium",
                    "line":       node.lineno,
                    "rule":       "wildcard-import",
                    "message":    f"Import wildcard '*' depuis '{alias.name}' : pollue l'espace de noms.",
                    "suggestion": "Importez uniquement les symboles nécessaires.",
                })
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom):
        for alias in node.names:
            if alias.name == "*":
                self.issues.append({
                    "category":   "style",
                    "severity":   "medium",
                    "line":       node.lineno,
                    "rule":       "wildcard-import",
                    "message":    f"Import wildcard '*' depuis '{node.module}' : pollue l'espace de noms.",
                    "suggestion": "Importez uniquement les symboles nécessaires.",
                })
        self.generic_visit(node)

    def visit_Compare(self, node: ast.Compare):
        # Détecte: if x == True / if x == None
        for op, comparator in zip(node.ops, node.comparators):
            if isinstance(op, ast.Eq) and isinstance(comparator, ast.Constant):
                if comparator.value is True:
                    self.issues.append({
                        "category":   "style",
                        "severity":   "low",
                        "line":       node.lineno,
                        "rule":       "comparison-to-true",
                        "message":    "Comparaison explicite à 'True'. Utilisez la valeur directement.",
                        "suggestion": "Remplacez `if x == True:` par `if x:`.",
                    })
                elif comparator.value is None:
                    self.issues.append({
                        "category":   "style",
                        "severity":   "low",
                        "line":       node.lineno,
                        "rule":       "comparison-to-none",
                        "message":    "Comparaison avec 'None' via '=='. Utilisez 'is None'.",
                        "suggestion": "Remplacez `x == None` par `x is None`.",
                    })
        self.generic_visit(node)


def analyze_python(code: str) -> tuple[List[dict], Metrics]:
    """Analyse Python via AST natif."""
    issues: List[dict] = []
    metrics = Metrics()

    # ── Métriques textuelles ────────────────────────────────────────────────
    lines = code.splitlines()
    metrics.lines_of_code = len(lines)
    metrics.blank_lines   = sum(1 for l in lines if not l.strip())
    metrics.comment_lines = sum(1 for l in lines if l.strip().startswith("#"))

    # ── Secrets hardcodés (heuristique) ────────────────────────────────────
    secret_patterns = [
        (r'(?i)(password|passwd|pwd)\s*=\s*["\'][^"\']{4,}["\']',     "hardcoded-password",   "Mot de passe hardcodé détecté."),
        (r'(?i)(api_key|apikey|secret_key|token)\s*=\s*["\'][^"\']{8,}["\']', "hardcoded-secret", "Clé API ou secret hardcodé."),
    ]
    for i, line in enumerate(lines, start=1):
        for pattern, rule, msg in secret_patterns:
            if re.search(pattern, line):
                issues.append({
                    "category":   "security",
                    "severity":   "critical",
                    "line":       i,
                    "rule":       rule,
                    "message":    msg,
                    "suggestion": "Utilisez des variables d'environnement ou un gestionnaire de secrets.",
                })

    # ── Analyse AST ─────────────────────────────────────────────────────────
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        issues.append({
            "category":   "bug",
            "severity":   "critical",
            "line":       e.lineno,
            "rule":       "syntax-error",
            "message":    f"Erreur de syntaxe Python : {e.msg}",
            "suggestion": "Corrigez la syntaxe avant de soumettre le code.",
        })
        return issues, metrics

    visitor = PythonASTAnalyzer()
    visitor.visit(tree)
    issues.extend(visitor.issues)

    metrics.num_functions = visitor.num_functions
    metrics.num_classes   = visitor.num_classes
    if visitor.function_lengths:
        metrics.avg_function_length = round(
            sum(visitor.function_lengths) / len(visitor.function_lengths), 1
        )

    return issues, metrics


# ─── Analyseur générique (heuristiques) ──────────────────────────────────────

def analyze_generic(language: str, code: str) -> tuple[List[dict], Metrics]:
    """Analyse heuristique pour les langages non-Python."""
    issues: List[dict] = []
    lines = code.splitlines()

    metrics = Metrics(
        lines_of_code=len(lines),
        blank_lines=sum(1 for l in lines if not l.strip()),
    )

    secret_patterns = [
        (r'(?i)(password|passwd|pwd)\s*[=:]\s*["\'][^"\']{4,}["\']', "hardcoded-password", "critical"),
        (r'(?i)(api_key|apikey|secret|token)\s*[=:]\s*["\'][^"\']{8,}["\']', "hardcoded-secret", "critical"),
    ]

    # Détection de secrets
    for i, line in enumerate(lines, start=1):
        for pattern, rule, severity in secret_patterns:
            if re.search(pattern, line):
                issues.append({
                    "category":   "security",
                    "severity":   severity,
                    "line":       i,
                    "rule":       rule,
                    "message":    f"Secret ou credential potentiellement hardcodé à la ligne {i}.",
                    "suggestion": "Utilisez des variables d'environnement.",
                })

    # Lignes trop longues (> 120 caractères)
    for i, line in enumerate(lines, start=1):
        if len(line) > 120:
            issues.append({
                "category": "style",
                "severity": "low",
                "line":     i,
                "rule":     "line-too-long",
                "message":  f"Ligne {i} trop longue ({len(line)} caractères, max recommandé : 120).",
                "suggestion": "Découpez la ligne en plusieurs lignes plus courtes.",
            })

    # TODO/FIXME
    for i, line in enumerate(lines, start=1):
        if re.search(r'\b(TODO|FIXME|HACK|XXX)\b', line, re.IGNORECASE):
            issues.append({
                "category": "style",
                "severity": "low",
                "line":     i,
                "rule":     "todo-comment",
                "message":  f"Commentaire TODO/FIXME à la ligne {i} : code non terminé.",
                "suggestion": "Résolvez ce problème ou créez un ticket de suivi.",
            })

    return issues, metrics


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "polycheck-python-ast"}


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest):
    language = request.language
    code     = request.code

    if language == "python":
        issues_raw, metrics = analyze_python(code)
    else:
        issues_raw, metrics = analyze_generic(language, code)

    # Construire les objets Issue
    issues = [
        Issue(
            category   = i.get("category",   "style"),
            severity   = i.get("severity",   "low"),
            line       = i.get("line"),
            column     = i.get("column"),
            rule       = i.get("rule",       "unknown"),
            message    = i.get("message",    ""),
            suggestion = i.get("suggestion"),
            source     = "ast",
        )
        for i in issues_raw
    ]

    return AnalyzeResponse(language=language, issues=issues, metrics=metrics)
