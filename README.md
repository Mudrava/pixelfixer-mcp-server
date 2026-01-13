# @mudravaorg/mcp-server

MCP (Model Context Protocol) server for [PixelFixer](https://pixelfixer.mudrava.com) — a visual bug tracking and kanban board tool. Connects AI agents (Claude, Cursor, VS Code Copilot, Windsurf) to your PixelFixer projects.

## What it does

This MCP server gives AI agents full access to your PixelFixer workspace:

| Category | Tools |
|---|---|
| **Teams & Projects** | `list_teams`, `list_projects`, `get_project`, `list_team_members` |
| **Tasks** | `list_tasks`, `get_task`, `create_task`, `update_task`, `search_tasks` |
| **Comments** | `add_comment`, `list_comments` |
| **Kanban** | `list_columns` |
| **GitHub** | `get_github_context`, `get_repo_tree`, `get_file_content`, `create_pull_request` |
| **AI Pipeline** | `list_ai_queue`, `complete_ai_task`, `get_task_context` |

The `get_task_context` super-tool returns everything an AI needs in a single call: task details, description, screenshot URL, browser info, console/network errors, comments, and the connected GitHub repo file tree.

## Quick Start

### 1. Get an API Token

Go to **PixelFixer → Team Settings → API Tokens** and create a token with `read` + `write` scopes.

### 2. Configure your IDE

**VS Code** (`.vscode/mcp.json`):
```json
{
  "servers": {
    "pixelfixer": {
      "command": "npx",
      "args": ["-y", "@mudravaorg/mcp-server"],
      "env": {
        "PIXELFIXER_API_TOKEN": "pf_your_token_here",
        "PIXELFIXER_API_URL": "https://pixelfixer.mudrava.com"
      }
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`) / **Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "pixelfixer": {
      "command": "npx",
      "args": ["-y", "@mudravaorg/mcp-server"],
      "env": {
        "PIXELFIXER_API_TOKEN": "pf_your_token_here",
        "PIXELFIXER_API_URL": "https://pixelfixer.mudrava.com"
      }
    }
  }
}
```

> **Note:** VS Code uses `"servers"` as the root key, while Cursor and Claude Desktop use `"mcpServers"`.

### 3. Start using it

Ask your AI agent:
- *"List all tasks in my project"*
- *"Get the context for task PF-42 and create a fix"*
- *"Search for high-priority open bugs"*
- *"Create a PR that fixes the button color issue from PF-15"*

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PIXELFIXER_API_TOKEN` | **Yes** | — | Personal API token (starts with `pf_`) |
| `PIXELFIXER_API_URL` | No | `http://localhost:3000` | PixelFixer instance URL |

## Local Development

If you're running PixelFixer from source, you can use the local build instead of the npm package:

```bash
cd packages/mcp-server
pnpm install
pnpm build
```

Then point your IDE to the local file:
```json
{
  "servers": {
    "pixelfixer": {
      "command": "node",
      "args": ["${workspaceFolder}/packages/mcp-server/dist/index.js"],
      "env": {
        "PIXELFIXER_API_TOKEN": "pf_your_token_here",
        "PIXELFIXER_API_URL": "http://localhost:3000"
      }
    }
  }
}
```

## Tool Reference

### get_task_context
The recommended first call when working on a task. Returns in a single response:
- Full task details (title, description, priority, status)
- Screenshot URL, page URL, CSS selector
- Browser info, console errors, network errors
- All comments
- Connected GitHub repo info + root file tree

### search_tasks
Search with multiple filters:
- `q` — text search (title, description, task number)
- `status` — OPEN, IN_PROGRESS, RESOLVED, CLOSED
- `priority` — LOW, MEDIUM, HIGH, CRITICAL
- `aiStatus` — NONE, QUEUED, PROCESSING, COMPLETED, FAILED
- `assigneeId`, `columnId`, `tag`

### create_pull_request
Creates a branch and PR in the connected GitHub repo. Example:
```
branchName: "fix/PF-42-button-color"
title: "Fix button color on dashboard"
body: "Resolves PF-42. Changed primary button color..."
```

## Security

- API tokens are hashed (SHA-256) in the database — even a DB leak won't expose tokens
- Tokens have scoped permissions (read / write / admin)
- The MCP server runs locally on your machine — data goes directly to your PixelFixer instance over HTTPS
- No data is sent to third parties

## License

MIT
