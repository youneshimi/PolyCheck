<?php

namespace PolyCheck\Mcp;

use GuzzleHttp\Exception\GuzzleException;

/**
 * Serveur MCP (Model Context Protocol) pour PolyCheck.
 *
 * Implémente le protocole MCP (JSON-RPC 2.0) avec transport HTTP Streamable.
 * Expose les fonctionnalités de PolyCheck comme des outils MCP :
 *   - Analyse de code (LLM + AST + RAG)
 *   - Gestion des reviews
 *   - Gestion de la base de connaissances RAG
 *
 * @see https://modelcontextprotocol.io/specification
 */
class McpServer
{
    private const PROTOCOL_VERSION = '2025-03-26';
    private const SERVER_NAME     = 'PolyCheck MCP Server';
    private const SERVER_VERSION  = '1.0.0';

    private ApiClient $client;
    private array $tools;

    public function __construct(ApiClient $client)
    {
        $this->client = $client;
        $this->tools  = $this->buildToolDefinitions();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  Protocole JSON-RPC 2.0
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Point d'entrée principal : reçoit un body JSON-RPC, retourne la réponse.
     */
    public function handleRequest(string $body): ?string
    {
        $decoded = json_decode($body, true);

        if ($decoded === null) {
            return json_encode($this->errorResponse(null, -32700, 'Parse error: JSON invalide'));
        }

        // Batch de requêtes
        if (isset($decoded[0])) {
            $responses = [];
            foreach ($decoded as $request) {
                $response = $this->dispatch($request);
                if ($response !== null) {
                    $responses[] = $response;
                }
            }
            return empty($responses) ? null : json_encode($responses);
        }

        // Requête unique
        $response = $this->dispatch($decoded);
        return $response !== null ? json_encode($response) : null;
    }

    /**
     * Dispatche une requête JSON-RPC vers le bon handler.
     */
    private function dispatch(array $request): ?array
    {
        $method = $request['method'] ?? '';
        $id     = $request['id'] ?? null;
        $params = $request['params'] ?? [];

        // Notifications (pas d'id) : pas de réponse
        if ($id === null) {
            return null;
        }

        return match ($method) {
            'initialize'   => $this->handleInitialize($id, $params),
            'ping'         => $this->successResponse($id, []),
            'tools/list'   => $this->handleToolsList($id),
            'tools/call'   => $this->handleToolsCall($id, $params),
            default        => $this->errorResponse($id, -32601, "Méthode inconnue : {$method}"),
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  Handlers MCP
    // ═══════════════════════════════════════════════════════════════════════════

    private function handleInitialize(int|string $id, array $params): array
    {
        return $this->successResponse($id, [
            'protocolVersion' => self::PROTOCOL_VERSION,
            'capabilities'    => [
                'tools' => ['listChanged' => false],
            ],
            'serverInfo' => [
                'name'    => self::SERVER_NAME,
                'version' => self::SERVER_VERSION,
            ],
        ]);
    }

    private function handleToolsList(int|string $id): array
    {
        return $this->successResponse($id, ['tools' => $this->tools]);
    }

    private function handleToolsCall(int|string $id, array $params): array
    {
        $toolName  = $params['name'] ?? '';
        $arguments = $params['arguments'] ?? [];

        try {
            $result = match ($toolName) {
                // ── Analyse ──────────────────────────────────────────────
                'analyze_code'    => $this->toolAnalyzeCode($arguments),

                // ── Reviews ──────────────────────────────────────────────
                'list_reviews'    => $this->toolListReviews($arguments),
                'get_review'      => $this->toolGetReview($arguments),
                'delete_review'   => $this->toolDeleteReview($arguments),

                // ── RAG / Patterns ───────────────────────────────────────
                'search_patterns' => $this->toolSearchPatterns($arguments),
                'list_patterns'   => $this->toolListPatterns(),
                'get_pattern'     => $this->toolGetPattern($arguments),
                'create_pattern'  => $this->toolCreatePattern($arguments),
                'update_pattern'  => $this->toolUpdatePattern($arguments),
                'delete_pattern'  => $this->toolDeletePattern($arguments),
                'get_rag_stats'   => $this->toolGetRagStats(),

                default => throw new \RuntimeException("Outil inconnu : {$toolName}"),
            };

            $text = is_string($result)
                ? $result
                : json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

            return $this->successResponse($id, [
                'content' => [
                    ['type' => 'text', 'text' => $text],
                ],
            ]);
        } catch (GuzzleException $e) {
            $message = "Erreur API PolyCheck : " . $e->getMessage();
            return $this->successResponse($id, [
                'content' => [['type' => 'text', 'text' => $message]],
                'isError' => true,
            ]);
        } catch (\Exception $e) {
            return $this->successResponse($id, [
                'content' => [['type' => 'text', 'text' => "Erreur : " . $e->getMessage()]],
                'isError' => true,
            ]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  Implémentation des Tools
    // ═══════════════════════════════════════════════════════════════════════════

    // ── Analyse de code ──────────────────────────────────────────────────────

    private function toolAnalyzeCode(array $args): array
    {
        $payload = [
            'code'     => $args['code'] ?? '',
            'language' => $args['language'] ?? 'python',
        ];
        if (!empty($args['filename'])) {
            $payload['filename'] = $args['filename'];
        }

        return $this->client->backendPost('/api/analyze', $payload);
    }

    // ── Reviews ──────────────────────────────────────────────────────────────

    private function toolListReviews(array $args): array
    {
        $query = [];
        if (isset($args['page']))  $query['page']  = (int) $args['page'];
        if (isset($args['limit'])) $query['limit'] = (int) $args['limit'];

        return $this->client->backendGet('/api/reviews', $query);
    }

    private function toolGetReview(array $args): array
    {
        $id = $args['review_id'] ?? '';
        if (empty($id)) {
            throw new \InvalidArgumentException('review_id est requis');
        }

        return $this->client->backendGet("/api/reviews/{$id}");
    }

    private function toolDeleteReview(array $args): array
    {
        $id = $args['review_id'] ?? '';
        if (empty($id)) {
            throw new \InvalidArgumentException('review_id est requis');
        }

        return $this->client->backendDelete("/api/reviews/{$id}");
    }

    // ── RAG : Recherche de patterns ──────────────────────────────────────────

    private function toolSearchPatterns(array $args): array
    {
        return $this->client->pythonPost('/rag/retrieve', [
            'code'     => $args['code'] ?? '',
            'language' => $args['language'] ?? 'python',
            'category' => $args['category'] ?? 'bug',
        ]);
    }

    // ── RAG : CRUD Patterns ──────────────────────────────────────────────────

    private function toolListPatterns(): array
    {
        return $this->client->pythonGet('/rag/patterns');
    }

    private function toolGetPattern(array $args): array
    {
        $id = $args['pattern_id'] ?? '';
        if (empty($id)) {
            throw new \InvalidArgumentException('pattern_id est requis');
        }

        return $this->client->pythonGet("/rag/patterns/{$id}");
    }

    private function toolCreatePattern(array $args): array
    {
        $required = ['id', 'language', 'pattern', 'category', 'severity', 'rule'];
        foreach ($required as $field) {
            if (empty($args[$field])) {
                throw new \InvalidArgumentException("Le champ '{$field}' est requis");
            }
        }

        return $this->client->pythonPost('/rag/patterns', $args);
    }

    private function toolUpdatePattern(array $args): array
    {
        $id = $args['pattern_id'] ?? '';
        if (empty($id)) {
            throw new \InvalidArgumentException('pattern_id est requis');
        }

        $data = array_filter($args, fn($key) => $key !== 'pattern_id', ARRAY_FILTER_USE_KEY);

        return $this->client->pythonPut("/rag/patterns/{$id}", $data);
    }

    private function toolDeletePattern(array $args): array
    {
        $id = $args['pattern_id'] ?? '';
        if (empty($id)) {
            throw new \InvalidArgumentException('pattern_id est requis');
        }

        return $this->client->pythonDelete("/rag/patterns/{$id}");
    }

    // ── RAG : Statistiques ───────────────────────────────────────────────────

    private function toolGetRagStats(): array
    {
        return $this->client->pythonGet('/rag/stats');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  Définitions des Tools MCP
    // ═══════════════════════════════════════════════════════════════════════════

    private function buildToolDefinitions(): array
    {
        return [
            // ── 1. Analyse de code ───────────────────────────────────────
            [
                'name'        => 'analyze_code',
                'description' => "Analyser du code source pour detecter bugs, failles de securite et problemes de style. Utilise l'IA (Groq LLM llama-3.3-70b) et l'analyse statique AST en parallele, enrichi par le RAG (Retrieval Augmented Generation).",
                'inputSchema' => [
                    'type'       => 'object',
                    'properties' => [
                        'code' => [
                            'type'        => 'string',
                            'description' => 'Le code source a analyser',
                        ],
                        'language' => [
                            'type'        => 'string',
                            'description' => 'Langage de programmation',
                            'enum'        => ['python', 'javascript', 'typescript', 'java', 'go', 'rust', 'c', 'cpp'],
                        ],
                        'filename' => [
                            'type'        => 'string',
                            'description' => 'Nom du fichier (optionnel)',
                        ],
                    ],
                    'required' => ['code', 'language'],
                ],
            ],

            // ── 2. Lister les reviews ────────────────────────────────────
            [
                'name'        => 'list_reviews',
                'description' => "Lister les analyses de code precedentes avec pagination. Retourne un resume de chaque analyse (langage, nombre d'issues, date).",
                'inputSchema' => [
                    'type'       => 'object',
                    'properties' => [
                        'page' => [
                            'type'        => 'integer',
                            'description' => 'Numero de page (defaut: 1)',
                            'default'     => 1,
                        ],
                        'limit' => [
                            'type'        => 'integer',
                            'description' => 'Nombre de resultats par page (defaut: 20, max: 100)',
                            'default'     => 20,
                        ],
                    ],
                    'required' => [],
                ],
            ],

            // ── 3. Detail d'une review ───────────────────────────────────
            [
                'name'        => 'get_review',
                'description' => "Obtenir le detail complet d'une analyse de code : toutes les issues detectees (bugs, securite, style), triees par severite.",
                'inputSchema' => [
                    'type'       => 'object',
                    'properties' => [
                        'review_id' => [
                            'type'        => 'string',
                            'description' => "L'identifiant UUID de la review",
                        ],
                    ],
                    'required' => ['review_id'],
                ],
            ],

            // ── 4. Supprimer une review ──────────────────────────────────
            [
                'name'        => 'delete_review',
                'description' => "Supprimer une analyse de code et toutes ses issues associees (suppression en cascade).",
                'inputSchema' => [
                    'type'       => 'object',
                    'properties' => [
                        'review_id' => [
                            'type'        => 'string',
                            'description' => "L'identifiant UUID de la review a supprimer",
                        ],
                    ],
                    'required' => ['review_id'],
                ],
            ],

            // ── 5. Rechercher des patterns RAG ───────────────────────────
            [
                'name'        => 'search_patterns',
                'description' => "Rechercher les patterns de bonnes pratiques les plus pertinents dans la base de connaissances RAG (ChromaDB) par similarite vectorielle. Retourne les 3 patterns les plus proches avec leur score de similarite.",
                'inputSchema' => [
                    'type'       => 'object',
                    'properties' => [
                        'code' => [
                            'type'        => 'string',
                            'description' => 'Le code source pour lequel chercher des patterns',
                        ],
                        'language' => [
                            'type'        => 'string',
                            'description' => 'Langage de programmation',
                            'enum'        => ['python', 'javascript', 'typescript', 'java', 'go', 'rust', 'c', 'cpp'],
                        ],
                        'category' => [
                            'type'        => 'string',
                            'description' => "Categorie d'analyse",
                            'enum'        => ['bug', 'security', 'style'],
                        ],
                    ],
                    'required' => ['code', 'language', 'category'],
                ],
            ],

            // ── 6. Lister tous les patterns ──────────────────────────────
            [
                'name'        => 'list_patterns',
                'description' => "Lister tous les patterns de bonnes pratiques stockes dans la base de connaissances RAG (ChromaDB). Inclut les patterns par defaut et les patterns personnalises.",
                'inputSchema' => [
                    'type'       => 'object',
                    'properties' => (object) [],
                    'required'   => [],
                ],
            ],

            // ── 7. Detail d'un pattern ───────────────────────────────────
            [
                'name'        => 'get_pattern',
                'description' => "Obtenir les details d'un pattern specifique : description, exemples (bon/mauvais), severite, regle.",
                'inputSchema' => [
                    'type'       => 'object',
                    'properties' => [
                        'pattern_id' => [
                            'type'        => 'string',
                            'description' => "L'identifiant du pattern (ex: py_001, js_001)",
                        ],
                    ],
                    'required' => ['pattern_id'],
                ],
            ],

            // ── 8. Creer un pattern ──────────────────────────────────────
            [
                'name'        => 'create_pattern',
                'description' => "Ajouter un nouveau pattern de bonnes pratiques a la base de connaissances RAG. Le pattern sera vectorise et utilise pour enrichir les futures analyses via le RAG.",
                'inputSchema' => [
                    'type'       => 'object',
                    'properties' => [
                        'id' => [
                            'type'        => 'string',
                            'description' => "Identifiant unique du pattern (ex: custom_001)",
                        ],
                        'language' => [
                            'type'        => 'string',
                            'description' => "Langage cible (ou 'all' pour tous)",
                        ],
                        'pattern' => [
                            'type'        => 'string',
                            'description' => 'Description de la bonne pratique',
                        ],
                        'category' => [
                            'type'        => 'string',
                            'description' => 'Categorie',
                            'enum'        => ['bug', 'security', 'style'],
                        ],
                        'severity' => [
                            'type'        => 'string',
                            'description' => 'Severite',
                            'enum'        => ['critical', 'high', 'medium', 'low'],
                        ],
                        'rule' => [
                            'type'        => 'string',
                            'description' => 'Nom court de la regle (ex: NO_EVAL)',
                        ],
                        'bad_example' => [
                            'type'        => 'string',
                            'description' => 'Exemple de mauvaise pratique (optionnel)',
                        ],
                        'good_example' => [
                            'type'        => 'string',
                            'description' => 'Exemple de bonne pratique (optionnel)',
                        ],
                    ],
                    'required' => ['id', 'language', 'pattern', 'category', 'severity', 'rule'],
                ],
            ],

            // ── 9. Modifier un pattern ───────────────────────────────────
            [
                'name'        => 'update_pattern',
                'description' => "Mettre a jour un pattern existant dans la base de connaissances RAG. Seuls les champs fournis seront modifies.",
                'inputSchema' => [
                    'type'       => 'object',
                    'properties' => [
                        'pattern_id' => [
                            'type'        => 'string',
                            'description' => "L'identifiant du pattern a modifier",
                        ],
                        'language' => [
                            'type'        => 'string',
                            'description' => 'Nouveau langage cible',
                        ],
                        'pattern' => [
                            'type'        => 'string',
                            'description' => 'Nouvelle description',
                        ],
                        'category' => [
                            'type'        => 'string',
                            'description' => 'Nouvelle categorie',
                            'enum'        => ['bug', 'security', 'style'],
                        ],
                        'severity' => [
                            'type'        => 'string',
                            'description' => 'Nouvelle severite',
                            'enum'        => ['critical', 'high', 'medium', 'low'],
                        ],
                        'rule' => [
                            'type'        => 'string',
                            'description' => 'Nouveau nom de regle',
                        ],
                    ],
                    'required' => ['pattern_id'],
                ],
            ],

            // ── 10. Supprimer un pattern ─────────────────────────────────
            [
                'name'        => 'delete_pattern',
                'description' => "Supprimer un pattern de la base de connaissances RAG.",
                'inputSchema' => [
                    'type'       => 'object',
                    'properties' => [
                        'pattern_id' => [
                            'type'        => 'string',
                            'description' => "L'identifiant du pattern a supprimer",
                        ],
                    ],
                    'required' => ['pattern_id'],
                ],
            ],

            // ── 11. Statistiques RAG ─────────────────────────────────────
            [
                'name'        => 'get_rag_stats',
                'description' => "Obtenir les statistiques de la base de connaissances RAG : nombre total de patterns, etat du service.",
                'inputSchema' => [
                    'type'       => 'object',
                    'properties' => (object) [],
                    'required'   => [],
                ],
            ],
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  Helpers JSON-RPC 2.0
    // ═══════════════════════════════════════════════════════════════════════════

    private function successResponse(int|string $id, mixed $result): array
    {
        return [
            'jsonrpc' => '2.0',
            'id'      => $id,
            'result'  => $result,
        ];
    }

    private function errorResponse(int|string|null $id, int $code, string $message): array
    {
        return [
            'jsonrpc' => '2.0',
            'id'      => $id,
            'error'   => [
                'code'    => $code,
                'message' => $message,
            ],
        ];
    }
}
