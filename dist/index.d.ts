#!/usr/bin/env node
/**
 * PixelFixer MCP Server
 *
 * Exposes kanban tasks, project context, and AI actions to MCP-compatible clients
 * (Claude Desktop, Cursor, Windsurf, etc.) via the Model Context Protocol.
 *
 * Configuration via environment variables:
 *   PIXELFIXER_API_URL   – Base URL of the PixelFixer instance (default: http://localhost:3000)
 *   PIXELFIXER_API_TOKEN – Personal API Token for authentication (required)
 *
 * Install: npx -y @mudravaorg/mcp-server
 *
 * Usage with VS Code (.vscode/mcp.json):
 *   {
 *     "servers": {
 *       "pixelfixer": {
 *         "command": "npx",
 *         "args": ["-y", "@mudravaorg/mcp-server"],
 *         "env": {
 *           "PIXELFIXER_API_URL": "https://pixelfixer.mudrava.com",
 *           "PIXELFIXER_API_TOKEN": "pf_your_token_here"
 *         }
 *       }
 *     }
 *   }
 *
 * Usage with Cursor / Claude Desktop:
 *   {
 *     "mcpServers": {
 *       "pixelfixer": {
 *         "command": "npx",
 *         "args": ["-y", "@mudravaorg/mcp-server"],
 *         "env": {
 *           "PIXELFIXER_API_URL": "https://pixelfixer.mudrava.com",
 *           "PIXELFIXER_API_TOKEN": "pf_your_token_here"
 *         }
 *       }
 *     }
 *   }
 */
export {};
