/**
 * MCP Tool definitions for PixelFixer.
 *
 * v1.0 improvements over v0.2:
 *   - Session state: init_session / set_context eliminate repetitive teamId/projectId
 *   - Compact responses: list views return summaries (~90% fewer tokens)
 *   - Task numbers: get_task, start_task, etc. accept human-readable #taskNumber
 *   - Simplified workflow: no hardcoded step lists, concise guidance
 *   - Removed: get_task_context (use start_task or get_task instead)
 *   - Minified JSON: no pretty-print (saves ~30% tokens)
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PixelFixerClient, compactTask } from "./client.js";
import type { Task } from "./client.js";

// в”Ђв”Ђв”Ђ Helpers в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

function text(data: unknown): { content: { type: "text"; text: string }[] } {
    return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function textMsg(msg: string): { content: { type: "text"; text: string }[] } {
    return { content: [{ type: "text" as const, text: msg }] };
}

function errorMsg(err: unknown): { content: { type: "text"; text: string }[]; isError: true } {
    return { content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }], isError: true };
}

// Reusable schema fragments
const optTeamId = z.string().optional().describe("Team ID (auto from session if omitted)");
const optProjectId = z.string().optional().describe("Project ID (auto from session if omitted)");
const optTaskId = z.string().optional().describe("Task ID (provide this OR taskNumber)");
const optTaskNumber = z.number().optional().describe("Human-readable task number, e.g. 43");

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// TOOL REGISTRATION
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ

export function registerTools(server: McpServer, client: PixelFixerClient): void {

    // в”Ђв”Ђв”Ђ Session State (scoped per registerTools call) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    let sessionTeamId: string | null = null;
    let sessionProjectId: string | null = null;

    function resolveTeam(teamId?: string): string {
        const id = teamId || sessionTeamId;
        if (!id) throw new Error("teamId required вЂ” call init_session or set_context first, or pass teamId.");
        return id;
    }

    function resolveProject(projectId?: string): string {
        const id = projectId || sessionProjectId;
        if (!id) throw new Error("projectId required вЂ” call init_session or set_context first, or pass projectId.");
        return id;
    }

    async function resolveTaskId(
        teamId: string,
        projectId: string,
        taskId?: string,
        taskNumber?: number,
    ): Promise<string> {
        if (taskId) return taskId;
        if (taskNumber !== undefined) {
            const task = await client.resolveTaskByNumber(teamId, projectId, taskNumber);
            return task.id;
        }
        throw new Error("Provide either taskId or taskNumber.");
    }

    // в”Ђв”Ђв”Ђ init_session в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    server.tool(
        "init_session",
        "Initialize the MCP session вЂ” auto-discovers your team/project and returns the AI task queue. Call this FIRST in every session. If you have multiple teams/projects, use set_context afterward.",
        {},
        async () => {
            const teams = await client.listTeams();
            if (teams.length === 0) return textMsg("No teams found for this API token.");

            // Auto-select if only one team
            const team = teams.length === 1 ? teams[0]! : null;
            if (team) sessionTeamId = team.id;

            let project = null;
            let queue: Task[] = [];
            if (team) {
                const projects = await client.listProjects(team.id);
                if (projects.length === 1) {
                    project = projects[0]!;
                    sessionProjectId = project.id;
                    queue = await client.searchTasks(team.id, project.id, { aiStatus: "QUEUED,PROCESSING" });
                }
            }

            return text({
                session: {
                    teamId: sessionTeamId,
                    teamName: team?.name ?? null,
                    projectId: sessionProjectId,
                    projectName: project?.name ?? null,
                },
                teams: teams.map((t) => ({ id: t.id, name: t.name })),
                aiQueue: queue.map(compactTask),
                hint: sessionProjectId
                    ? `Session ready. ${queue.length} task(s) in AI queue. Use start_task to begin.`
                    : teams.length > 1
                      ? "Multiple teams found вЂ” call set_context with your teamId and projectId."
                      : "Multiple projects found вЂ” call set_context with your projectId.",
            });
        },
    );

    // в”Ђв”Ђв”Ђ set_context в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    server.tool(
        "set_context",
        "Set or change the active team and/or project for this session. All subsequent tool calls will use these IDs by default.",
        {
            teamId: z.string().optional().describe("Team ID to set as active"),
            projectId: z.string().optional().describe("Project ID to set as active"),
        },
        async ({ teamId, projectId }) => {
            if (teamId) sessionTeamId = teamId;
            if (projectId) sessionProjectId = projectId;
            return text({
                teamId: sessionTeamId,
                projectId: sessionProjectId,
                message: "Session context updated.",
            });
        },
    );

    // в”Ђв”Ђв”Ђ list_teams в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    server.tool(
        "list_teams",
        "List all teams the authenticated user belongs to.",
        {},
        async () => {
            const teams = await client.listTeams();
            return text(teams.map((t) => ({ id: t.id, name: t.name, slug: t.slug })));
        },
    );

    // в”Ђв”Ђв”Ђ list_projects в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    server.tool(
        "list_projects",
        "List all projects in a team.",
        { teamId: optTeamId },
        async ({ teamId }) => {
            const tid = resolveTeam(teamId);
            const projects = await client.listProjects(tid);
            return text(projects.map((p) => ({ id: p.id, name: p.name, slug: p.slug })));
        },
    );

    // в”Ђв”Ђв”Ђ get_project в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    server.tool(
        "get_project",
        "Get details of a specific project including its GitHub connection.",
        { teamId: optTeamId, projectId: optProjectId },
        async ({ teamId, projectId }) => {
            const tid = resolveTeam(teamId);
            const pid = resolveProject(projectId);
            const [project, github] = await Promise.all([
                client.getProject(tid, pid),
                client.getGitHubConnection(tid, pid),
            ]);
            return text({ ...project, github });
        },
    );

    // в”Ђв”Ђв”Ђ list_team_members в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    server.tool(
        "list_team_members",
        "List all members of a team.",
        { teamId: optTeamId },
        async ({ teamId }) => {
            const tid = resolveTeam(teamId);
            const members = await client.listMembers(tid);
            return text(members.map((m) => ({ id: m.id, name: m.name, email: m.email })));
        },
    );

    // в”Ђв”Ђв”Ђ list_tasks в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    server.tool(
        "list_tasks",
        "List all tasks in a project (compact summaries). Use get_task for full details of a specific task.",
        { teamId: optTeamId, projectId: optProjectId },
        async ({ teamId, projectId }) => {
            const tid = resolveTeam(teamId);
            const pid = resolveProject(projectId);
            const tasks = await client.listTasks(tid, pid);
            return text(tasks.map(compactTask));
        },
    );

    // в”Ђв”Ђв”Ђ get_task в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    server.tool(
        "get_task",
        "Get full details of a task: description, metadata, screenshot, page URL, CSS selector, browser info, console/network errors, comments, AI status. Accepts taskId OR taskNumber.",
        {
            teamId: optTeamId,
            projectId: optProjectId,
            taskId: optTaskId,
            taskNumber: optTaskNumber,
        },
        async ({ teamId, projectId, taskId, taskNumber }) => {
            const tid = resolveTeam(teamId);
            const pid = resolveProject(projectId);
            const id = await resolveTaskId(tid, pid, taskId, taskNumber);
            const task = await client.getTask(tid, pid, id);
            return text(task);
        },
    );

    // в”Ђв”Ђв”Ђ create_task в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    server.tool(
        "create_task",
        "Create a new task. Requires title and columnId. IMPORTANT: title and description MUST be in English.",
        {
            teamId: optTeamId,
            projectId: optProjectId,
            title: z.string().describe("Task title (English)"),
            columnId: z.string().describe("Column ID to place the task in"),
            description: z.string().optional().describe("Task description (markdown/HTML, English)"),
            priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional().describe("Task priority"),
            assigneeId: z.string().optional().describe("User ID to assign"),
            tags: z.array(z.string()).optional().describe("Array of tag IDs"),
            isInternal: z.boolean().optional().describe("Mark as internal (hidden from clients)"),
        },
        async ({ teamId, projectId, title, columnId, ...opts }) => {
            const tid = resolveTeam(teamId);
            const pid = resolveProject(projectId);
            const data: Record<string, unknown> = { title, columnId };
            for (const [k, v] of Object.entries(opts)) {
                if (v !== undefined) data[k] = v;
            }
            const task = await client.createTask(tid, pid, data as any);
            return text(compactTask(task));
        },
    );

    // в”Ђв”Ђв”Ђ update_task в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    server.tool(
        "update_task",
        "Update task properties. Do NOT use this to move columns вЂ” use start_task/complete_ai_task instead. Accepts taskId OR taskNumber. IMPORTANT: title/description in English.",
        {
            teamId: optTeamId,
            projectId: optProjectId,
            taskId: optTaskId,
            taskNumber: optTaskNumber,
            title: z.string().optional().describe("New title"),
            description: z.string().optional().describe("New description"),
            status: z.string().optional().describe("OPEN | IN_PROGRESS | RESOLVED | CLOSED"),
            priority: z.string().optional().describe("LOW | MEDIUM | HIGH | CRITICAL"),
            assigneeId: z.string().optional().describe("User ID (empty string to unassign)"),
            aiStatus: z.string().optional().describe("NONE | QUEUED | PROCESSING"),
        },
        async ({ teamId, projectId, taskId, taskNumber, ...updates }) => {
            const tid = resolveTeam(teamId);
            const pid = resolveProject(projectId);
            const id = await resolveTaskId(tid, pid, taskId, taskNumber);
            const data: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(updates)) {
                if (v !== undefined) data[k] = v;
            }
            const task = await client.updateTask(tid, pid, id, data);
            return text(compactTask(task));
        },
    );

    // в”Ђв”Ђв”Ђ move_task в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    server.tool(
        "move_task",
        "Move a task to a different kanban column. Only use when explicitly asked вЂ” start_task and complete_ai_task handle column moves automatically.",
        {
            teamId: optTeamId,
            projectId: optProjectId,
            taskId: optTaskId,
            taskNumber: optTaskNumber,
            columnId: z.string().describe("Target column ID"),
            position: z.number().optional().describe("Position in column (0 = top)"),
        },
        async ({ teamId, projectId, taskId, taskNumber, columnId, position }) => {
            const tid = resolveTeam(teamId);
            const pid = resolveProject(projectId);
            const id = await resolveTaskId(tid, pid, taskId, taskNumber);
            const result = await client.moveTask(tid, pid, id, columnId, position ?? 0);
            return text(result);
        },
    );

    // в”Ђв”Ђв”Ђ search_tasks в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    server.tool(
        "search_tasks",
        "Search tasks with filters. Returns compact summaries. Use get_task for full details.",
        {
            teamId: optTeamId,
            projectId: optProjectId,
            q: z.string().optional().describe("Text search (title, description, task number)"),
            status: z.string().optional().describe("Comma-separated: OPEN,IN_PROGRESS,RESOLVED,CLOSED"),
            priority: z.string().optional().describe("Comma-separated: LOW,MEDIUM,HIGH,CRITICAL"),
            aiStatus: z.string().optional().describe("Comma-separated: NONE,QUEUED,PROCESSING,COMPLETED,FAILED"),
            assigneeId: z.string().optional().describe("Filter by assignee"),
            columnId: z.string().optional().describe("Filter by column ID"),
            tag: z.string().optional().describe("Comma-separated tag names"),
            limit: z.number().optional().describe("Max results (default 50, max 200)"),
        },
        async ({ teamId, projectId, ...filters }) => {
            const tid = resolveTeam(teamId);
            const pid = resolveProject(projectId);
            const tasks = await client.searchTasks(tid, pid, filters);
            return tasks.length > 0
                ? text(tasks.map(compactTask))
                : textMsg("No tasks found matching the search criteria.");
        },
    );

    // в”Ђв”Ђв”Ђ add_comment в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    server.tool(
        "add_comment",
        "Add a comment to a task. Call AFTER making changes and BEFORE complete_ai_task. IMPORTANT: content in English.",
        {
            teamId: optTeamId,
            projectId: optProjectId,
            taskId: optTaskId,
            taskNumber: optTaskNumber,
            content: z.string().describe("Comment text (markdown)"),
        },
        async ({ teamId, projectId, taskId, taskNumber, content }) => {
            const tid = resolveTeam(teamId);
            const pid = resolveProject(projectId);
            const id = await resolveTaskId(tid, pid, taskId, taskNumber);
            const comment = await client.addComment(tid, pid, id, content);
            return text({ id: comment.id, createdAt: comment.createdAt });
        },
    );

    // в”Ђв”Ђв”Ђ list_comments в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    server.tool(
        "list_comments",
        "List all comments on a task.",
        {
            teamId: optTeamId,
            projectId: optProjectId,
            taskId: optTaskId,
            taskNumber: optTaskNumber,
        },
        async ({ teamId, projectId, taskId, taskNumber }) => {
            const tid = resolveTeam(teamId);
            const pid = resolveProject(projectId);
            const id = await resolveTaskId(tid, pid, taskId, taskNumber);
            const comments = await client.listComments(tid, pid, id);
            return comments.length > 0
                ? text(comments)
                : textMsg("No comments on this task.");
        },
    );

    // в”Ђв”Ђв”Ђ list_columns в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    server.tool(
        "list_columns",
        "List all kanban columns in a project.",
        { teamId: optTeamId, projectId: optProjectId },
        async ({ teamId, projectId }) => {
            const tid = resolveTeam(teamId);
            const pid = resolveProject(projectId);
            const columns = await client.listColumns(tid, pid);
            return text(columns);
        },
    );

    // в”Ђв”Ђв”Ђ get_github_context в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    server.tool(
        "get_github_context",
        "Get the GitHub repository connection for a project. Returns null if no repo is connected.",
        { teamId: optTeamId, projectId: optProjectId },
        async ({ teamId, projectId }) => {
            const tid = resolveTeam(teamId);
            const pid = resolveProject(projectId);
            const conn = await client.getGitHubConnection(tid, pid);
            return conn ? text(conn) : textMsg("No GitHub repository connected.");
        },
    );

    // в”Ђв”Ђв”Ђ get_repo_tree в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    server.tool(
        "get_repo_tree",
        "Browse the file tree of the connected GitHub repository.",
        {
            teamId: optTeamId,
            projectId: optProjectId,
            path: z.string().optional().describe("Directory path (empty for root)"),
            ref: z.string().optional().describe("Branch, tag, or commit SHA"),
        },
        async ({ teamId, projectId, path, ref }) => {
            const tid = resolveTeam(teamId);
            const pid = resolveProject(projectId);
            try {
                const result = await client.getRepoTree(tid, pid, path ?? "", ref);
                return text(result);
            } catch (err) {
                return errorMsg(err);
            }
        },
    );

    // в”Ђв”Ђв”Ђ get_file_content в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    server.tool(
        "get_file_content",
        "Read a file from the connected GitHub repository.",
        {
            teamId: optTeamId,
            projectId: optProjectId,
            path: z.string().describe("File path in the repository"),
            ref: z.string().optional().describe("Branch, tag, or commit SHA"),
        },
        async ({ teamId, projectId, path, ref }) => {
            const tid = resolveTeam(teamId);
            const pid = resolveProject(projectId);
            try {
                const result = await client.getFileContent(tid, pid, path, ref);
                return textMsg(`File: ${result.path}\n\n${result.content}`);
            } catch (err) {
                return errorMsg(err);
            }
        },
    );

    // в”Ђв”Ђв”Ђ create_pull_request в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    server.tool(
        "create_pull_request",
        "Create a branch and pull request. Call BEFORE commit_files. IMPORTANT: all text in English.",
        {
            teamId: optTeamId,
            projectId: optProjectId,
            branchName: z.string().describe("Branch name (e.g. 'fix/PF-42-button-color')"),
            title: z.string().describe("PR title"),
            body: z.string().optional().describe("PR description (markdown)"),
            baseBranch: z.string().optional().describe("Base branch (default: repo default)"),
        },
        async ({ teamId, projectId, branchName, title, body, baseBranch }) => {
            const tid = resolveTeam(teamId);
            const pid = resolveProject(projectId);
            try {
                const result = await client.createBranchAndPR(tid, pid, {
                    branchName,
                    title,
                    body: body ?? "",
                    baseBranch,
                });
                return textMsg(`Branch: ${result.branch}\nPR #${result.pullRequest.number}: ${result.pullRequest.url}`);
            } catch (err) {
                return errorMsg(err);
            }
        },
    );

    // в”Ђв”Ђв”Ђ commit_files в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    server.tool(
        "commit_files",
        "Commit files to a branch. Call AFTER create_pull_request. Max 50 files. IMPORTANT: commit message in English.",
        {
            teamId: optTeamId,
            projectId: optProjectId,
            branch: z.string().describe("Branch name"),
            message: z.string().describe("Commit message"),
            files: z.array(
                z.object({
                    path: z.string().describe("File path in repo"),
                    content: z.string().describe("Full file content"),
                }),
            ).describe("Files to create or update"),
        },
        async ({ teamId, projectId, branch, message, files }) => {
            const tid = resolveTeam(teamId);
            const pid = resolveProject(projectId);
            try {
                const result = await client.commitFiles(tid, pid, { branch, message, files });
                return textMsg(`Committed ${files.length} file(s). SHA: ${result.sha}\n${result.url}`);
            } catch (err) {
                return errorMsg(err);
            }
        },
    );

    // в”Ђв”Ђв”Ђ start_task в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    server.tool(
        "start_task",
        "Start working on an AI task. Moves task to In Progress, sets AI status to PROCESSING, returns full context (task, comments, GitHub info, columns). Accepts taskId OR taskNumber. Call this FIRST for every AI task.",
        {
            teamId: optTeamId,
            projectId: optProjectId,
            taskId: optTaskId,
            taskNumber: optTaskNumber,
        },
        async ({ teamId, projectId, taskId, taskNumber }) => {
            const tid = resolveTeam(teamId);
            const pid = resolveProject(projectId);
            const id = await resolveTaskId(tid, pid, taskId, taskNumber);
            try {
                const result = await client.startTask(tid, pid, id);

                const hasGitHub = !!result.github;
                const workflow = hasGitHub
                    ? "Workflow: analyze task в†’ explore repo (get_repo_tree/get_file_content) в†’ create_pull_request в†’ commit_files в†’ add_comment в†’ complete_ai_task. All text in English."
                    : "Workflow: analyze task в†’ make local changes в†’ add_comment в†’ complete_ai_task. All text in English.";

                return text({
                    task: result.task,
                    comments: result.comments,
                    github: result.github,
                    columns: result.columns,
                    reviewColumnId: result.reviewColumnId,
                    workflow,
                });
            } catch (err) {
                return errorMsg(err);
            }
        },
    );

    // в”Ђв”Ђв”Ђ complete_ai_task в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    server.tool(
        "complete_ai_task",
        "Report the result of AI work. Auto-moves task to Review column. Call AFTER add_comment. IMPORTANT: message in English.",
        {
            teamId: optTeamId,
            projectId: optProjectId,
            taskId: optTaskId,
            taskNumber: optTaskNumber,
            status: z.enum(["COMPLETED", "FAILED"]).describe("AI result status"),
            message: z.string().optional().describe("Summary of work done or failure reason"),
            prUrl: z.string().optional().describe("Pull request URL (if any)"),
        },
        async ({ teamId, projectId, taskId, taskNumber, status, message, prUrl }) => {
            const tid = resolveTeam(teamId);
            const pid = resolveProject(projectId);
            const id = await resolveTaskId(tid, pid, taskId, taskNumber);
            const result = await client.reportAiResult(tid, pid, id, {
                aiStatus: status,
                comment: message,
                prUrl,
            });
            return text(result);
        },
    );

    // в”Ђв”Ђв”Ђ list_ai_queue в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
    server.tool(
        "list_ai_queue",
        "List tasks queued for AI processing (compact summaries). Use start_task on each to begin work.",
        { teamId: optTeamId, projectId: optProjectId },
        async ({ teamId, projectId }) => {
            const tid = resolveTeam(teamId);
            const pid = resolveProject(projectId);
            const tasks = await client.searchTasks(tid, pid, { aiStatus: "QUEUED,PROCESSING" });
            return tasks.length > 0
                ? text(tasks.map(compactTask))
                : textMsg("No tasks in AI queue.");
        },
    );
}
