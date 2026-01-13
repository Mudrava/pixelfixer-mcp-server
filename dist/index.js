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
 * One-time setup (from PixelFixer repo root):
 *   cd packages/mcp-server && npm run build && npm link
 *
 * Usage with VS Code (.vscode/mcp.json):
 *   {
 *     "servers": {
 *       "pixelfixer": {
 *         "command": "pixelfixer-mcp",
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
 *         "command": "pixelfixer-mcp",
 *         "env": {
 *           "PIXELFIXER_API_URL": "https://pixelfixer.mudrava.com",
 *           "PIXELFIXER_API_TOKEN": "pf_your_token_here"
 *         }
 *       }
 *     }
 *   }
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PixelFixerClient } from "./client.js";
import { registerTools } from "./tools.js";
const API_URL = process.env["PIXELFIXER_API_URL"] ?? "http://localhost:3000";
const API_TOKEN = process.env["PIXELFIXER_API_TOKEN"];
if (!API_TOKEN) {
    console.error("Error: PIXELFIXER_API_TOKEN environment variable is required.\n" +
        "Create a Personal API Token in PixelFixer Settings > API Tokens.");
    process.exit(1);
}
// Create PixelFixer API client
const client = new PixelFixerClient(API_URL, API_TOKEN);
// Create MCP server
const server = new McpServer({
    name: "pixelfixer",
    version: "0.1.0",
});
// Register all tools
registerTools(server, client);
// Connect via stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
//# sourceMappingURL=index.js.map