/**
 * MCP Tool definitions for PixelFixer.
 *
 * Each tool is registered with the MCP server and delegates to the PixelFixer API client.
 *
 * Tools:
 *  - list_teams, list_projects, get_project
 *  - list_tasks, get_task, create_task, update_task, move_task, search_tasks
 *  - add_comment, list_comments
 *  - list_columns, list_team_members
 *  - get_github_context, get_repo_tree, get_file_content, create_pull_request, commit_files
 *  - complete_ai_task, list_ai_queue, get_task_context
 */
import { z } from "zod";
export function registerTools(server, client) {
    // ─── list_teams ──────────────────────────────────────────
    server.tool("list_teams", "List all teams the authenticated user belongs to", {}, async () => {
        const teams = await client.listTeams();
        return {
            content: [{ type: "text", text: JSON.stringify(teams, null, 2) }],
        };
    });
    // ─── list_projects ───────────────────────────────────────
    server.tool("list_projects", "List all projects in a team", { teamId: z.string().describe("Team ID") }, async ({ teamId }) => {
        const projects = await client.listProjects(teamId);
        return {
            content: [{ type: "text", text: JSON.stringify(projects, null, 2) }],
        };
    });
    // ─── get_project ─────────────────────────────────────────
    server.tool("get_project", "Get details of a specific project including its GitHub connection", {
        teamId: z.string().describe("Team ID"),
        projectId: z.string().describe("Project ID"),
    }, async ({ teamId, projectId }) => {
        const [project, github] = await Promise.all([
            client.getProject(teamId, projectId),
            client.getGitHubConnection(teamId, projectId),
        ]);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ ...project, github }, null, 2),
                },
            ],
        };
    });
    // ─── list_team_members ───────────────────────────────────
    server.tool("list_team_members", "List all members of a team. Returns name, email, and avatar for each member.", { teamId: z.string().describe("Team ID") }, async ({ teamId }) => {
        const members = await client.listMembers(teamId);
        return {
            content: [{ type: "text", text: JSON.stringify(members, null, 2) }],
        };
    });
    // ─── list_tasks ──────────────────────────────────────────
    server.tool("list_tasks", "List all tasks in a project. Includes title, status, priority, AI status, tags, and assignee.", {
        teamId: z.string().describe("Team ID"),
        projectId: z.string().describe("Project ID"),
    }, async ({ teamId, projectId }) => {
        const tasks = await client.listTasks(teamId, projectId);
        return {
            content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }],
        };
    });
    // ─── get_task ────────────────────────────────────────────
    server.tool("get_task", "Get full details of a specific task including description, metadata, screenshot URL, page URL, CSS selector, browser info, console errors, network errors, comments, and AI status", {
        teamId: z.string().describe("Team ID"),
        projectId: z.string().describe("Project ID"),
        taskId: z.string().describe("Task ID"),
    }, async ({ teamId, projectId, taskId }) => {
        const task = await client.getTask(teamId, projectId, taskId);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(task, null, 2),
                },
            ],
        };
    });
    // ─── create_task ─────────────────────────────────────────
    server.tool("create_task", "Create a new task in a project. Requires at least a title and columnId. Can optionally set description, priority, assignee, tags, and more. IMPORTANT: title and description MUST be written in English regardless of the user's language.", {
        teamId: z.string().describe("Team ID"),
        projectId: z.string().describe("Project ID"),
        title: z.string().describe("Task title"),
        columnId: z.string().describe("Column ID to place the task in"),
        description: z.string().optional().describe("Task description (supports markdown/HTML)"),
        priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional().describe("Task priority"),
        assigneeId: z.string().optional().describe("User ID to assign the task to"),
        tags: z.array(z.string()).optional().describe("Array of tag IDs to attach"),
        isInternal: z.boolean().optional().describe("Mark as internal (hidden from clients)"),
    }, async ({ teamId, projectId, title, columnId, ...opts }) => {
        const data = { title, columnId };
        for (const [k, v] of Object.entries(opts)) {
            if (v !== undefined)
                data[k] = v;
        }
        const task = await client.createTask(teamId, projectId, data);
        return {
            content: [{ type: "text", text: JSON.stringify(task, null, 2) }],
        };
    });
    // ─── update_task ─────────────────────────────────────────
    server.tool("update_task", "Update a task's properties: title, description, status, priority, assignee, or AI status. NOTE: To move a task to another column, use the move_task tool instead. IMPORTANT: title and description MUST be written in English regardless of the user's language.", {
        teamId: z.string().describe("Team ID"),
        projectId: z.string().describe("Project ID"),
        taskId: z.string().describe("Task ID"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
        status: z.string().optional().describe("New status (OPEN, IN_PROGRESS, RESOLVED, CLOSED)"),
        priority: z.string().optional().describe("New priority (LOW, MEDIUM, HIGH, CRITICAL)"),
        assigneeId: z.string().optional().describe("Assign to this user ID (empty string to unassign)"),
        aiStatus: z.string().optional().describe("Set AI status (NONE, QUEUED, PROCESSING)"),
    }, async ({ teamId, projectId, taskId, ...updates }) => {
        const data = {};
        for (const [k, v] of Object.entries(updates)) {
            if (v !== undefined)
                data[k] = v;
        }
        const task = await client.updateTask(teamId, projectId, taskId, data);
        return {
            content: [{ type: "text", text: JSON.stringify(task, null, 2) }],
        };
    });
    // ─── move_task ────────────────────────────────────────────
    server.tool("move_task", "Move a task to a different kanban column. Use list_columns to get available column IDs. Position 0 = top of column.", {
        teamId: z.string().describe("Team ID"),
        projectId: z.string().describe("Project ID"),
        taskId: z.string().describe("Task ID"),
        columnId: z.string().describe("Target column ID to move the task to"),
        position: z.number().optional().describe("Position within the column (0 = top, default: 0)"),
    }, async ({ teamId, projectId, taskId, columnId, position }) => {
        const result = await client.moveTask(teamId, projectId, taskId, columnId, position ?? 0);
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
    });
    // ─── search_tasks ────────────────────────────────────────
    server.tool("search_tasks", "Search tasks with filters: text query, status, priority, AI status, assignee, column, or tag. Returns matching tasks.", {
        teamId: z.string().describe("Team ID"),
        projectId: z.string().describe("Project ID"),
        q: z.string().optional().describe("Text search query (searches title, description, task number)"),
        status: z.string().optional().describe("Comma-separated statuses: OPEN,IN_PROGRESS,RESOLVED,CLOSED"),
        priority: z.string().optional().describe("Comma-separated priorities: LOW,MEDIUM,HIGH,CRITICAL"),
        aiStatus: z.string().optional().describe("Comma-separated AI statuses: NONE,QUEUED,PROCESSING,COMPLETED,FAILED"),
        assigneeId: z.string().optional().describe("Filter by assignee user ID"),
        columnId: z.string().optional().describe("Filter by column ID"),
        tag: z.string().optional().describe("Comma-separated tag names"),
        limit: z.number().optional().describe("Max results (default 50, max 200)"),
    }, async ({ teamId, projectId, ...filters }) => {
        const tasks = await client.searchTasks(teamId, projectId, filters);
        return {
            content: [
                {
                    type: "text",
                    text: tasks.length > 0
                        ? JSON.stringify(tasks, null, 2)
                        : "No tasks found matching the search criteria.",
                },
            ],
        };
    });
    // ─── add_comment ─────────────────────────────────────────
    server.tool("add_comment", "Add a comment to a task. Use this to leave progress notes, ask questions, or report findings. IMPORTANT: comment content MUST be written in English regardless of the user's language.", {
        teamId: z.string().describe("Team ID"),
        projectId: z.string().describe("Project ID"),
        taskId: z.string().describe("Task ID"),
        content: z.string().describe("Comment text (supports markdown)"),
    }, async ({ teamId, projectId, taskId, content }) => {
        const comment = await client.addComment(teamId, projectId, taskId, content);
        return {
            content: [{ type: "text", text: JSON.stringify(comment, null, 2) }],
        };
    });
    // ─── list_comments ───────────────────────────────────────
    server.tool("list_comments", "List all comments on a task. Returns comment content, author, and timestamps.", {
        teamId: z.string().describe("Team ID"),
        projectId: z.string().describe("Project ID"),
        taskId: z.string().describe("Task ID"),
    }, async ({ teamId, projectId, taskId }) => {
        const comments = await client.listComments(teamId, projectId, taskId);
        return {
            content: [
                {
                    type: "text",
                    text: comments.length > 0
                        ? JSON.stringify(comments, null, 2)
                        : "No comments on this task.",
                },
            ],
        };
    });
    // ─── list_columns ────────────────────────────────────────
    server.tool("list_columns", "List all kanban columns in a project. Shows column names, order, color, and whether they trigger AI automation.", {
        teamId: z.string().describe("Team ID"),
        projectId: z.string().describe("Project ID"),
    }, async ({ teamId, projectId }) => {
        const columns = await client.listColumns(teamId, projectId);
        return {
            content: [{ type: "text", text: JSON.stringify(columns, null, 2) }],
        };
    });
    // ─── get_github_context ──────────────────────────────────
    server.tool("get_github_context", "Get the GitHub repository connection for a project. Returns repo name, default branch, etc. Returns null if no repo is connected.", {
        teamId: z.string().describe("Team ID"),
        projectId: z.string().describe("Project ID"),
    }, async ({ teamId, projectId }) => {
        const conn = await client.getGitHubConnection(teamId, projectId);
        return {
            content: [
                {
                    type: "text",
                    text: conn
                        ? JSON.stringify(conn, null, 2)
                        : "No GitHub repository connected to this project.",
                },
            ],
        };
    });
    // ─── get_repo_tree ───────────────────────────────────────
    server.tool("get_repo_tree", "Browse the file tree of the connected GitHub repository. Returns directory listing with file names, types, and sizes. Use path to navigate into subdirectories.", {
        teamId: z.string().describe("Team ID"),
        projectId: z.string().describe("Project ID"),
        path: z.string().optional().describe("Directory path (empty for root)"),
        ref: z.string().optional().describe("Branch, tag, or commit SHA (default: repo default branch)"),
    }, async ({ teamId, projectId, path, ref }) => {
        try {
            const result = await client.getRepoTree(teamId, projectId, path ?? "", ref);
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
        }
        catch (err) {
            return {
                content: [{ type: "text", text: `Error: ${err.message}` }],
                isError: true,
            };
        }
    });
    // ─── get_file_content ────────────────────────────────────
    server.tool("get_file_content", "Read the content of a file from the connected GitHub repository. Returns the full file content as text.", {
        teamId: z.string().describe("Team ID"),
        projectId: z.string().describe("Project ID"),
        path: z.string().describe("File path in the repository"),
        ref: z.string().optional().describe("Branch, tag, or commit SHA"),
    }, async ({ teamId, projectId, path, ref }) => {
        try {
            const result = await client.getFileContent(teamId, projectId, path, ref);
            return {
                content: [{ type: "text", text: `File: ${result.path}\n\n${result.content}` }],
            };
        }
        catch (err) {
            return {
                content: [{ type: "text", text: `Error: ${err.message}` }],
                isError: true,
            };
        }
    });
    // ─── create_pull_request ─────────────────────────────────
    server.tool("create_pull_request", "Create a new branch and pull request in the connected GitHub repository. The branch is created from the base branch (default: repo default branch). IMPORTANT: PR title, description, and branch name MUST be in English regardless of the user's language.", {
        teamId: z.string().describe("Team ID"),
        projectId: z.string().describe("Project ID"),
        branchName: z.string().describe("Name for the new branch (e.g., 'fix/PF-42-button-color')"),
        title: z.string().describe("Pull request title"),
        body: z.string().optional().describe("Pull request description (supports markdown)"),
        baseBranch: z.string().optional().describe("Base branch to create from (default: repo default branch)"),
    }, async ({ teamId, projectId, branchName, title, body, baseBranch }) => {
        try {
            const result = await client.createBranchAndPR(teamId, projectId, {
                branchName,
                title,
                body: body ?? "",
                baseBranch,
            });
            return {
                content: [
                    {
                        type: "text",
                        text: `Branch created: ${result.branch}\nPR #${result.pullRequest.number}: ${result.pullRequest.url}`,
                    },
                ],
            };
        }
        catch (err) {
            return {
                content: [{ type: "text", text: `Error: ${err.message}` }],
                isError: true,
            };
        }
    });
    // ─── commit_files ──────────────────────────────────────────
    server.tool("commit_files", "Commit one or more file changes to a branch in the connected GitHub repository. Use this after creating a branch (via create_pull_request) to push code changes. Maximum 50 files per commit. IMPORTANT: commit message MUST be in English regardless of the user's language.", {
        teamId: z.string().describe("Team ID"),
        projectId: z.string().describe("Project ID"),
        branch: z.string().describe("Branch name to commit to (e.g., 'fix/PF-42-button-color')"),
        message: z.string().describe("Commit message"),
        files: z.array(z.object({
            path: z.string().describe("File path in the repo (e.g., 'src/components/Footer.tsx')"),
            content: z.string().describe("Full file content after changes"),
        })).describe("Array of files to create or update"),
    }, async ({ teamId, projectId, branch, message, files }) => {
        try {
            const result = await client.commitFiles(teamId, projectId, {
                branch,
                message,
                files,
            });
            return {
                content: [
                    {
                        type: "text",
                        text: `Commit successful!\nSHA: ${result.sha}\nURL: ${result.url}`,
                    },
                ],
            };
        }
        catch (err) {
            return {
                content: [{ type: "text", text: `Error: ${err.message}` }],
                isError: true,
            };
        }
    });
    // ─── complete_ai_task ────────────────────────────────────
    server.tool("complete_ai_task", "Report the result of AI work on a task. Call this when you have finished working on a task to update its AI status and optionally attach a PR URL and summary comment. IMPORTANT: message/summary MUST be in English regardless of the user's language.", {
        teamId: z.string().describe("Team ID"),
        projectId: z.string().describe("Project ID"),
        taskId: z.string().describe("Task ID"),
        status: z.enum(["COMPLETED", "FAILED"]).describe("AI result status"),
        message: z.string().optional().describe("Summary of what was done or why it failed"),
        prUrl: z.string().optional().describe("URL of the pull request created (if any)"),
    }, async ({ teamId, projectId, taskId, status, message, prUrl }) => {
        const result = await client.reportAiResult(teamId, projectId, taskId, {
            aiStatus: status,
            comment: message,
            prUrl,
        });
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
    });
    // ─── list_ai_queue ───────────────────────────────────────
    server.tool("list_ai_queue", "List tasks that are queued or in-progress for AI processing. Useful to find work that needs to be done.", {
        teamId: z.string().describe("Team ID"),
        projectId: z.string().describe("Project ID"),
    }, async ({ teamId, projectId }) => {
        const tasks = await client.searchTasks(teamId, projectId, {
            aiStatus: "QUEUED,PROCESSING",
        });
        return {
            content: [
                {
                    type: "text",
                    text: tasks.length > 0
                        ? JSON.stringify(tasks, null, 2)
                        : "No tasks in AI queue.",
                },
            ],
        };
    });
    // ─── get_task_context ────────────────────────────────────
    server.tool("get_task_context", "Get comprehensive context for an AI task in a single call. Returns: full task details (description, screenshot, page URL, browser info, console errors, network errors), all comments, GitHub repo info, and the project file tree. This is the recommended first call when starting work on a task.", {
        teamId: z.string().describe("Team ID"),
        projectId: z.string().describe("Project ID"),
        taskId: z.string().describe("Task ID"),
    }, async ({ teamId, projectId, taskId }) => {
        const [task, github] = await Promise.all([
            client.getTask(teamId, projectId, taskId),
            client.getGitHubConnection(teamId, projectId),
        ]);
        // Try to get repo tree if GitHub is connected
        let repoTree = null;
        if (github) {
            try {
                repoTree = await client.getRepoTree(teamId, projectId);
            }
            catch { /* repo tree optional */ }
        }
        const context = {
            task: {
                id: task.id,
                taskNumber: task.taskNumber,
                title: task.title,
                description: task.description,
                status: task.status,
                priority: task.priority,
                aiStatus: task.aiStatus,
                source: task.source,
                pageUrl: task.pageUrl,
                selector: task.selector,
                screenshotUrl: task.screenshotUrl,
                browserInfo: task.browserInfo,
                consoleErrors: task.consoleErrors,
                networkErrors: task.networkErrors,
                metadata: task.metadata,
                tags: task.tags,
                assignee: task.assignee,
                column: task.column,
                createdAt: task.createdAt,
            },
            comments: task.comments ?? [],
            github: github
                ? {
                    repoFullName: github.repoFullName,
                    defaultBranch: github.defaultBranch,
                    fileTree: repoTree?.items ?? null,
                }
                : null,
        };
        return {
            content: [{ type: "text", text: JSON.stringify(context, null, 2) }],
        };
    });
}
//# sourceMappingURL=tools.js.map