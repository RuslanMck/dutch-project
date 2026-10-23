# model-context-protocol

The remote MCP server (Streamable HTTP, stateless) that lets Claude read and write the data. The tools themselves live with their domains (`domains/*/…-tools.js`) and call the same services as the REST routes.

## Files

| File | What it does |
|---|---|
| `create-mcp-server.js` | Builds an MCP server named `dutch` with the instructions and asks each domain to register its tools. |
| `mcp-routes.js` | The `/mcp` endpoint: `POST /mcp/<MCP_SECRET>` (claude.ai connector) and `POST /mcp` with the bearer token; other methods get 405. A fresh server per request. |
| `mcp-instructions.js` | The server instructions: what the database holds and the lesson workflows. |
| `mcp-tool-registration.js` | `registerJsonTool`: sends a tool's result as JSON text and turns errors into `isError` results; shared annotations. |

## How to add a tool

1. Add or derive its argument schema in `contracts/<domain>-contracts.js`, with a `.describe()` on every field.
2. Register it in `domains/<domain>/<domain>-tools.js` with `registerJsonTool`, calling the domain service.
3. Mention it in `mcp-instructions.js` if Claude should use it in a workflow, and update `test/mcp.test.js` (its tool list) and the app README.
