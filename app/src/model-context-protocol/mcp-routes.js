// The /mcp endpoint (Streamable HTTP, stateless). It is mounted before cookie authentication, so it checks its
// own credentials:
//   POST /mcp/<MCP_SECRET>            claude.ai connector (secret in the path)
//   POST /mcp  Authorization: Bearer  Claude Code / scripts (API_TOKEN)
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';

import { hasValidBearerToken, isSameSecret } from '../authentication/secret-comparison.js';

const MINIMUM_SECRET_LENGTH = 32;
const METHOD_NOT_ALLOWED_BODY = Object.freeze({
  jsonrpc: '2.0',
  error: { code: -32000, message: 'Method not allowed.' },
  id: null,
});
const INTERNAL_ERROR_BODY = Object.freeze({
  jsonrpc: '2.0',
  error: { code: -32603, message: 'Internal server error' },
  id: null,
});

// createMcpServer: returns a fresh MCP server with every tool registered.
export function createMcpRoutes({ createMcpServer, mcpSecret, apiToken, logger = console }) {
  const mcpRouter = express.Router();

  function requireSecretPath(request, response, next) {
    return hasValidSecret(request.params.secret) ? next() : sendUnauthorized(response);
  }

  function requireBearerToken(request, response, next) {
    return hasValidBearerToken(request, apiToken) ? next() : sendUnauthorized(response);
  }

  function hasValidSecret(givenSecret) {
    return mcpSecret.length >= MINIMUM_SECRET_LENGTH && typeof givenSecret === 'string'
      && isSameSecret(givenSecret, mcpSecret);
  }

  // Stateless: a fresh server and transport per POST; nothing is kept between requests.
  async function handleMcpRequest(request, response) {
    const mcpServer = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    response.on('close', () => {
      transport.close();
      mcpServer.close();
    });
    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      logger.error('mcp: request failed:', error);
      if (!response.headersSent) response.status(500).json(INTERNAL_ERROR_BODY);
    }
  }

  mcpRouter.post('/:secret', requireSecretPath, handleMcpRequest);
  mcpRouter.post('/', requireBearerToken, handleMcpRequest);

  mcpRouter.get('/:secret', requireSecretPath, sendMethodNotAllowed);
  mcpRouter.delete('/:secret', requireSecretPath, sendMethodNotAllowed);
  mcpRouter.get('/', requireBearerToken, sendMethodNotAllowed);
  mcpRouter.delete('/', requireBearerToken, sendMethodNotAllowed);

  return mcpRouter;
}

function sendUnauthorized(response) {
  response.status(401).json({ error: 'unauthorized' });
}

function sendMethodNotAllowed(request, response) {
  response.set('Allow', 'POST');
  response.status(405).json(METHOD_NOT_ALLOWED_BODY);
}
