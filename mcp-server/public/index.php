<?php

/**
 * PolyCheck MCP Server - Point d'entree HTTP
 *
 * Implémente le transport MCP Streamable HTTP :
 *   POST /mcp   → Requêtes JSON-RPC 2.0 (initialize, tools/list, tools/call)
 *   GET  /mcp   → SSE pour messages serveur (non utilisé ici)
 *   DELETE /mcp  → Fin de session
 *   GET /health  → Health check
 *
 * @see https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http
 */

require_once __DIR__ . '/../vendor/autoload.php';

use PolyCheck\Mcp\McpServer;
use PolyCheck\Mcp\ApiClient;

// ── Configuration ────────────────────────────────────────────────────────────
$backendUrl = getenv('BACKEND_URL') ?: 'http://backend:3001';
$pythonUrl  = getenv('PYTHON_SERVICE_URL') ?: 'http://python-service:8000';

// ── Headers CORS ─────────────────────────────────────────────────────────────
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Mcp-Session-Id');

// Preflight CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Routing ──────────────────────────────────────────────────────────────────
$path   = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];

// Servir les fichiers statiques (dashboard, etc.)
if ($method === 'GET' && $path !== '/') {
    $staticFile = __DIR__ . $path;
    if (file_exists($staticFile) && is_file($staticFile)) {
        return false; // Laisser le serveur PHP built-in servir le fichier
    }
}

// Dashboard (page d'accueil)
if ($path === '/' && $method === 'GET') {
    $dashboard = __DIR__ . '/dashboard.html';
    if (file_exists($dashboard)) {
        header('Content-Type: text/html; charset=UTF-8');
        readfile($dashboard);
        exit;
    }
}

// Health check
if ($path === '/health' && $method === 'GET') {
    header('Content-Type: application/json');
    echo json_encode([
        'status'  => 'ok',
        'service' => 'polycheck-mcp-server',
        'version' => '1.0.0',
    ]);
    exit;
}

// ── MCP Endpoint : POST /mcp ─────────────────────────────────────────────────
if ($path === '/mcp' && $method === 'POST') {
    $body = file_get_contents('php://input');

    if (empty($body)) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Corps de requete vide']);
        exit;
    }

    $client = new ApiClient($backendUrl, $pythonUrl);
    $server = new McpServer($client);

    $response = $server->handleRequest($body);

    if ($response !== null) {
        header('Content-Type: application/json');
        echo $response;
    } else {
        // Notification reçue (pas de réponse attendue)
        http_response_code(202);
    }
    exit;
}

// ── MCP Endpoint : GET /mcp (SSE) ────────────────────────────────────────────
if ($path === '/mcp' && $method === 'GET') {
    // SSE pour les messages initiés par le serveur
    // Non utilisé dans cette implémentation basique
    header('Content-Type: text/event-stream');
    header('Cache-Control: no-cache');
    header('Connection: keep-alive');
    http_response_code(200);
    exit;
}

// ── MCP Endpoint : DELETE /mcp (fin de session) ──────────────────────────────
if ($path === '/mcp' && $method === 'DELETE') {
    http_response_code(200);
    header('Content-Type: application/json');
    echo json_encode(['status' => 'session terminee']);
    exit;
}

// ── 404 ──────────────────────────────────────────────────────────────────────
http_response_code(404);
header('Content-Type: application/json');
echo json_encode([
    'error'            => 'Not found',
    'available_routes' => [
        'POST /mcp'    => 'MCP JSON-RPC endpoint',
        'GET /mcp'     => 'MCP SSE endpoint',
        'DELETE /mcp'  => 'Terminer la session MCP',
        'GET /health'  => 'Health check',
    ],
]);
