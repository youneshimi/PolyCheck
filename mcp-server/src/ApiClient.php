<?php

namespace PolyCheck\Mcp;

use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;

/**
 * Client HTTP pour communiquer avec les services PolyCheck existants.
 * - Backend Express (Node.js) : analyse, reviews, logs
 * - Python Service (FastAPI)  : AST, RAG, patterns
 */
class ApiClient
{
    private Client $backend;
    private Client $python;

    public function __construct(string $backendUrl, string $pythonUrl)
    {
        $this->backend = new Client([
            'base_uri' => rtrim($backendUrl, '/'),
            'timeout'  => 60,
            'headers'  => ['Content-Type' => 'application/json', 'Accept' => 'application/json'],
        ]);

        $this->python = new Client([
            'base_uri' => rtrim($pythonUrl, '/'),
            'timeout'  => 30,
            'headers'  => ['Content-Type' => 'application/json', 'Accept' => 'application/json'],
        ]);
    }

    // ── Backend (Express :3001) ──────────────────────────────────────────────

    public function backendGet(string $path, array $query = []): array
    {
        $response = $this->backend->get($path, ['query' => $query]);
        return json_decode($response->getBody()->getContents(), true);
    }

    public function backendPost(string $path, array $data): array
    {
        $response = $this->backend->post($path, ['json' => $data]);
        return json_decode($response->getBody()->getContents(), true);
    }

    public function backendDelete(string $path): array
    {
        $response = $this->backend->delete($path);
        return json_decode($response->getBody()->getContents(), true);
    }

    // ── Python Service (FastAPI :8000) ───────────────────────────────────────

    public function pythonGet(string $path, array $query = []): array
    {
        $response = $this->python->get($path, ['query' => $query]);
        return json_decode($response->getBody()->getContents(), true);
    }

    public function pythonPost(string $path, array $data): array
    {
        $response = $this->python->post($path, ['json' => $data]);
        return json_decode($response->getBody()->getContents(), true);
    }

    public function pythonPut(string $path, array $data): array
    {
        $response = $this->python->put($path, ['json' => $data]);
        return json_decode($response->getBody()->getContents(), true);
    }

    public function pythonDelete(string $path): array
    {
        $response = $this->python->delete($path);
        return json_decode($response->getBody()->getContents(), true);
    }
}
