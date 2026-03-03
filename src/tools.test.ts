/**
 * Tests for MCP tool registration and execution.
 *
 * v1.0 — updated for:
 *  - 23 tools (removed get_task_context, added init_session + set_context)
 *  - Session state (init_session auto-sets teamId/projectId)
 *  - Compact responses (list views return summaries)
 *  - taskNumber support in get_task, start_task, etc.
 *  - Minified JSON, simplified workflow strings
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.js";
import type { PixelFixerClient } from "./client.js";

// ─── Mock client ─────────────────────────────────────────────────

function createMockClient(): PixelFixerClient {
    return {
        listTeams: vi.fn().mockResolvedValue([{ id: "t1", name: "Team", slug: "team" }]),
        listProjects: vi.fn().mockResolvedValue([{ id: "p1", name: "Project", slug: "project" }]),
        getProject: vi.fn().mockResolvedValue({ id: "p1", name: "Project", slug: "project" }),
        listMembers: vi.fn().mockResolvedValue([{ id: "u1", name: "Alice", email: "alice@test.com" }]),
        listTasks: vi.fn().mockResolvedValue([
            {
                id: "task1", taskNumber: 42, title: "Fix bug", status: "OPEN",
                priority: "MEDIUM", aiStatus: "NONE",
                column: { id: "col1", name: "Backlog", color: "#ccc" },
                tags: [{ tag: { id: "tag1", name: "frontend", color: "#f00" } }],
                assignee: { id: "u1", name: "Alice", email: "alice@test.com" },
            },
        ]),
        getTask: vi.fn().mockResolvedValue({
            id: "task1", taskNumber: 42, title: "Fix bug", status: "OPEN",
            priority: "MEDIUM", aiStatus: "NONE", comments: [],
        }),
        createTask: vi.fn().mockResolvedValue({
            id: "task2", taskNumber: 43, title: "New task", status: "OPEN",
            priority: "HIGH", aiStatus: "NONE",
        }),
        updateTask: vi.fn().mockResolvedValue({
            id: "task1", taskNumber: 42, title: "Fix bug", status: "CLOSED",
            priority: "LOW", aiStatus: "NONE",
        }),
        moveTask: vi.fn().mockResolvedValue({ success: true }),
        searchTasks: vi.fn().mockResolvedValue([]),
        startTask: vi.fn().mockResolvedValue({
            task: { id: "task1", title: "Fix bug", taskNumber: 42, comments: [] },
            comments: [],
            github: { repoFullName: "org/repo", defaultBranch: "main" },
            columns: [{ id: "col1", name: "Backlog" }],
            reviewColumnId: "col-review",
        }),
        addComment: vi.fn().mockResolvedValue({ id: "c1", content: "Done", createdAt: "2026-01-01T00:00:00Z" }),
        listComments: vi.fn().mockResolvedValue([]),
        listColumns: vi.fn().mockResolvedValue([{ id: "col1", name: "Backlog" }]),
        getGitHubConnection: vi.fn().mockResolvedValue({ repoFullName: "org/repo", defaultBranch: "main" }),
        getRepoTree: vi.fn().mockResolvedValue({ type: "directory", items: [] }),
        getFileContent: vi.fn().mockResolvedValue({ path: "README.md", content: "# Hello" }),
        createBranchAndPR: vi.fn().mockResolvedValue({ branch: "fix/1", pullRequest: { url: "https://url", number: 1 } }),
        commitFiles: vi.fn().mockResolvedValue({ success: true, sha: "abc123", url: "https://url" }),
        reportAiResult: vi.fn().mockResolvedValue({ success: true }),
        resolveTaskByNumber: vi.fn().mockResolvedValue({ id: "task1", taskNumber: 42, title: "Fix bug" }),
    } as unknown as PixelFixerClient;
}

// ─── Capture registered tools ─────────────────────────────────────

interface RegisteredTool {
    name: string;
    description: string;
    handler: (...args: any[]) => any;
}

function captureTools(mockClient: PixelFixerClient): RegisteredTool[] {
    const tools: RegisteredTool[] = [];

    const server = {
        tool: (name: string, description: string, schema: any, handler: any) => {
            tools.push({ name, description, handler });
        },
    } as unknown as McpServer;

    registerTools(server, mockClient);
    return tools;
}

// ─── Tests ────────────────────────────────────────────────────────

const EXPECTED_TOOLS = [
    "init_session",
    "set_context",
    "list_teams",
    "list_projects",
    "get_project",
    "list_team_members",
    "list_tasks",
    "get_task",
    "create_task",
    "update_task",
    "move_task",
    "search_tasks",
    "add_comment",
    "list_comments",
    "list_columns",
    "get_github_context",
    "get_repo_tree",
    "get_file_content",
    "create_pull_request",
    "commit_files",
    "start_task",
    "complete_ai_task",
    "list_ai_queue",
];

describe("tool registration", () => {
    let mockClient: PixelFixerClient;
    let tools: RegisteredTool[];

    beforeEach(() => {
        mockClient = createMockClient();
        tools = captureTools(mockClient);
    });

    it(`registers exactly ${EXPECTED_TOOLS.length} tools`, () => {
        expect(tools).toHaveLength(EXPECTED_TOOLS.length);
    });

    for (const toolName of EXPECTED_TOOLS) {
        it(`registers "${toolName}" tool`, () => {
            const tool = tools.find((t) => t.name === toolName);
            expect(tool).toBeDefined();
            expect(tool!.description).toBeTruthy();
        });
    }

    it("every tool has a non-empty description", () => {
        for (const tool of tools) {
            expect(tool.description.length).toBeGreaterThan(10);
        }
    });
});

describe("tool execution", () => {
    let mockClient: ReturnType<typeof createMockClient>;
    let tools: RegisteredTool[];

    function getTool(name: string) {
        return tools.find((t) => t.name === name)!;
    }

    beforeEach(() => {
        mockClient = createMockClient() as ReturnType<typeof createMockClient>;
        tools = captureTools(mockClient as PixelFixerClient);
    });

    // ─── init_session ────────────────────────────────────────

    it("init_session auto-discovers team+project and returns compact queue", async () => {
        const queueTasks = [
            {
                id: "task1", taskNumber: 42, title: "Fix bug", status: "IN_PROGRESS",
                priority: "HIGH", aiStatus: "PROCESSING",
                column: { id: "col1", name: "In Progress", color: "#0ff" },
                tags: [], assignee: null,
            },
        ];
        (mockClient as any).searchTasks.mockResolvedValueOnce(queueTasks);

        const result = await getTool("init_session").handler({});
        const parsed = JSON.parse(result.content[0].text);

        expect(parsed.session.teamId).toBe("t1");
        expect(parsed.session.projectId).toBe("p1");
        expect(parsed.aiQueue).toHaveLength(1);
        expect(parsed.aiQueue[0].id).toBe("task1");
        expect(parsed.aiQueue[0].taskNumber).toBe(42);
        // Compact: should NOT have description, screenshotUrl, etc.
        expect(parsed.aiQueue[0].description).toBeUndefined();
        expect(parsed.aiQueue[0].screenshotUrl).toBeUndefined();
    });

    // ─── set_context ─────────────────────────────────────────

    it("set_context updates session state", async () => {
        const result = await getTool("set_context").handler({ teamId: "t2", projectId: "p2" });
        const parsed = JSON.parse(result.content[0].text);

        expect(parsed.teamId).toBe("t2");
        expect(parsed.projectId).toBe("p2");
    });

    // ─── list_teams ──────────────────────────────────────────

    it("list_teams returns compact team data", async () => {
        const result = await getTool("list_teams").handler({});
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toEqual([{ id: "t1", name: "Team", slug: "team" }]);
    });

    // ─── list_projects ───────────────────────────────────────

    it("list_projects calls client.listProjects", async () => {
        await getTool("list_projects").handler({ teamId: "t1" });
        expect(mockClient.listProjects).toHaveBeenCalledWith("t1");
    });

    it("list_projects returns compact data", async () => {
        const result = await getTool("list_projects").handler({ teamId: "t1" });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toEqual([{ id: "p1", name: "Project", slug: "project" }]);
    });

    // ─── get_project ─────────────────────────────────────────

    it("get_project includes github info", async () => {
        const result = await getTool("get_project").handler({ teamId: "t1", projectId: "p1" });
        expect(mockClient.getProject).toHaveBeenCalledWith("t1", "p1");
        expect(mockClient.getGitHubConnection).toHaveBeenCalledWith("t1", "p1");
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.github).toBeDefined();
    });

    // ─── list_team_members ───────────────────────────────────

    it("list_team_members returns compact member data", async () => {
        const result = await getTool("list_team_members").handler({ teamId: "t1" });
        expect(mockClient.listMembers).toHaveBeenCalledWith("t1");
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toEqual([{ id: "u1", name: "Alice", email: "alice@test.com" }]);
    });

    // ─── list_tasks (compact) ────────────────────────────────

    it("list_tasks returns compact summaries", async () => {
        const result = await getTool("list_tasks").handler({ teamId: "t1", projectId: "p1" });
        expect(mockClient.listTasks).toHaveBeenCalledWith("t1", "p1");
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toHaveLength(1);
        expect(parsed[0].id).toBe("task1");
        expect(parsed[0].taskNumber).toBe(42);
        expect(parsed[0].column).toBe("Backlog");
        // Compact: should NOT have description, screenshotUrl, etc.
        expect(parsed[0].description).toBeUndefined();
        expect(parsed[0].screenshotUrl).toBeUndefined();
    });

    // ─── get_task (full + taskNumber) ────────────────────────

    it("get_task by taskId", async () => {
        await getTool("get_task").handler({ teamId: "t1", projectId: "p1", taskId: "task1" });
        expect(mockClient.getTask).toHaveBeenCalledWith("t1", "p1", "task1");
    });

    it("get_task by taskNumber resolves to taskId", async () => {
        await getTool("get_task").handler({ teamId: "t1", projectId: "p1", taskNumber: 42 });
        expect(mockClient.resolveTaskByNumber).toHaveBeenCalledWith("t1", "p1", 42);
        expect(mockClient.getTask).toHaveBeenCalledWith("t1", "p1", "task1");
    });

    // ─── create_task ─────────────────────────────────────────

    it("create_task passes all fields and returns compact", async () => {
        const result = await getTool("create_task").handler({
            teamId: "t1",
            projectId: "p1",
            title: "New",
            columnId: "col1",
            priority: "HIGH",
            description: "Desc",
        });
        expect(mockClient.createTask).toHaveBeenCalledWith("t1", "p1", {
            title: "New",
            columnId: "col1",
            priority: "HIGH",
            description: "Desc",
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.id).toBe("task2");
        // Returns compact — no description field in summary
        expect(parsed.description).toBeUndefined();
    });

    // ─── update_task ─────────────────────────────────────────

    it("update_task by taskId", async () => {
        await getTool("update_task").handler({
            teamId: "t1",
            projectId: "p1",
            taskId: "task1",
            status: "CLOSED",
        });
        expect(mockClient.updateTask).toHaveBeenCalledWith("t1", "p1", "task1", { status: "CLOSED" });
    });

    it("update_task by taskNumber", async () => {
        await getTool("update_task").handler({
            teamId: "t1",
            projectId: "p1",
            taskNumber: 42,
            priority: "LOW",
        });
        expect(mockClient.resolveTaskByNumber).toHaveBeenCalledWith("t1", "p1", 42);
        expect(mockClient.updateTask).toHaveBeenCalledWith("t1", "p1", "task1", { priority: "LOW" });
    });

    // ─── move_task ───────────────────────────────────────────

    it("move_task with columnId and position", async () => {
        await getTool("move_task").handler({
            teamId: "t1",
            projectId: "p1",
            taskId: "task1",
            columnId: "col-done",
            position: 2,
        });
        expect(mockClient.moveTask).toHaveBeenCalledWith("t1", "p1", "task1", "col-done", 2);
    });

    it("move_task defaults position to 0", async () => {
        await getTool("move_task").handler({
            teamId: "t1",
            projectId: "p1",
            taskId: "task1",
            columnId: "col-done",
        });
        expect(mockClient.moveTask).toHaveBeenCalledWith("t1", "p1", "task1", "col-done", 0);
    });

    // ─── search_tasks ────────────────────────────────────────

    it("search_tasks passes filters to client", async () => {
        await getTool("search_tasks").handler({
            teamId: "t1",
            projectId: "p1",
            q: "login",
            status: "OPEN",
        });
        expect(mockClient.searchTasks).toHaveBeenCalledWith("t1", "p1", {
            q: "login",
            status: "OPEN",
        });
    });

    it("search_tasks returns 'not found' message for empty results", async () => {
        const result = await getTool("search_tasks").handler({
            teamId: "t1",
            projectId: "p1",
        });
        expect(result.content[0].text).toContain("No tasks found");
    });

    // ─── add_comment (taskNumber) ────────────────────────────

    it("add_comment by taskId", async () => {
        await getTool("add_comment").handler({
            teamId: "t1",
            projectId: "p1",
            taskId: "task1",
            content: "Done!",
        });
        expect(mockClient.addComment).toHaveBeenCalledWith("t1", "p1", "task1", "Done!");
    });

    it("add_comment by taskNumber", async () => {
        await getTool("add_comment").handler({
            teamId: "t1",
            projectId: "p1",
            taskNumber: 42,
            content: "Fixed",
        });
        expect(mockClient.resolveTaskByNumber).toHaveBeenCalledWith("t1", "p1", 42);
        expect(mockClient.addComment).toHaveBeenCalledWith("t1", "p1", "task1", "Fixed");
    });

    it("add_comment returns compact response (id + createdAt)", async () => {
        const result = await getTool("add_comment").handler({
            teamId: "t1",
            projectId: "p1",
            taskId: "task1",
            content: "Done!",
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.id).toBe("c1");
        expect(parsed.createdAt).toBeDefined();
        expect(parsed.content).toBeUndefined(); // compact
    });

    // ─── list_comments ───────────────────────────────────────

    it("list_comments shows 'no comments' message when empty", async () => {
        const result = await getTool("list_comments").handler({
            teamId: "t1",
            projectId: "p1",
            taskId: "task1",
        });
        expect(result.content[0].text).toContain("No comments");
    });

    // ─── list_columns ────────────────────────────────────────

    it("list_columns calls client.listColumns", async () => {
        await getTool("list_columns").handler({ teamId: "t1", projectId: "p1" });
        expect(mockClient.listColumns).toHaveBeenCalledWith("t1", "p1");
    });

    // ─── get_github_context ──────────────────────────────────

    it("get_github_context returns null message when not connected", async () => {
        (mockClient as any).getGitHubConnection.mockResolvedValueOnce(null);
        const result = await getTool("get_github_context").handler({ teamId: "t1", projectId: "p1" });
        expect(result.content[0].text).toContain("No GitHub repository connected");
    });

    // ─── commit_files ────────────────────────────────────────

    it("commit_files calls client and returns success message", async () => {
        const result = await getTool("commit_files").handler({
            teamId: "t1",
            projectId: "p1",
            branch: "fix/1",
            message: "fix: remove link",
            files: [{ path: "src/Footer.tsx", content: "content" }],
        });
        expect(mockClient.commitFiles).toHaveBeenCalledWith("t1", "p1", {
            branch: "fix/1",
            message: "fix: remove link",
            files: [{ path: "src/Footer.tsx", content: "content" }],
        });
        expect(result.content[0].text).toContain("Committed 1 file(s)");
        expect(result.content[0].text).toContain("abc123");
    });

    it("commit_files returns error on failure", async () => {
        (mockClient as any).commitFiles.mockRejectedValueOnce(new Error("Branch not found"));
        const result = await getTool("commit_files").handler({
            teamId: "t1",
            projectId: "p1",
            branch: "nonexistent",
            message: "test",
            files: [{ path: "a.txt", content: "x" }],
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Branch not found");
    });

    // ─── create_pull_request ─────────────────────────────────

    it("create_pull_request returns branch and PR info", async () => {
        const result = await getTool("create_pull_request").handler({
            teamId: "t1",
            projectId: "p1",
            branchName: "fix/1",
            title: "Fix bug",
        });
        expect(result.content[0].text).toContain("Branch: fix/1");
        expect(result.content[0].text).toContain("PR #1");
    });

    // ─── complete_ai_task ────────────────────────────────────

    it("complete_ai_task calls reportAiResult by taskId", async () => {
        await getTool("complete_ai_task").handler({
            teamId: "t1",
            projectId: "p1",
            taskId: "task1",
            status: "COMPLETED",
            message: "Fixed it",
            prUrl: "https://url",
        });
        expect(mockClient.reportAiResult).toHaveBeenCalledWith("t1", "p1", "task1", {
            aiStatus: "COMPLETED",
            comment: "Fixed it",
            prUrl: "https://url",
        });
    });

    it("complete_ai_task by taskNumber", async () => {
        await getTool("complete_ai_task").handler({
            teamId: "t1",
            projectId: "p1",
            taskNumber: 42,
            status: "COMPLETED",
        });
        expect(mockClient.resolveTaskByNumber).toHaveBeenCalledWith("t1", "p1", 42);
        expect(mockClient.reportAiResult).toHaveBeenCalledWith("t1", "p1", "task1", {
            aiStatus: "COMPLETED",
            comment: undefined,
            prUrl: undefined,
        });
    });

    // ─── list_ai_queue ───────────────────────────────────────

    it("list_ai_queue searches for QUEUED,PROCESSING tasks", async () => {
        await getTool("list_ai_queue").handler({ teamId: "t1", projectId: "p1" });
        expect(mockClient.searchTasks).toHaveBeenCalledWith("t1", "p1", {
            aiStatus: "QUEUED,PROCESSING",
        });
    });

    it("list_ai_queue returns 'empty queue' message when no tasks", async () => {
        const result = await getTool("list_ai_queue").handler({ teamId: "t1", projectId: "p1" });
        expect(result.content[0].text).toContain("No tasks in AI queue");
    });

    // ─── start_task ──────────────────────────────────────────

    it("start_task by taskId returns context with workflow", async () => {
        const result = await getTool("start_task").handler({
            teamId: "t1",
            projectId: "p1",
            taskId: "task1",
        });
        expect(mockClient.startTask).toHaveBeenCalledWith("t1", "p1", "task1");
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.task).toBeDefined();
        expect(parsed.task.id).toBe("task1");
        expect(parsed.comments).toEqual([]);
        expect(parsed.github).toBeDefined();
        expect(parsed.columns).toBeDefined();
        expect(parsed.reviewColumnId).toBe("col-review");
        expect(parsed.workflow).toContain("commit_files");
    });

    it("start_task by taskNumber", async () => {
        await getTool("start_task").handler({
            teamId: "t1",
            projectId: "p1",
            taskNumber: 42,
        });
        expect(mockClient.resolveTaskByNumber).toHaveBeenCalledWith("t1", "p1", 42);
        expect(mockClient.startTask).toHaveBeenCalledWith("t1", "p1", "task1");
    });

    it("start_task without github omits commit_files from workflow", async () => {
        (mockClient as any).startTask.mockResolvedValueOnce({
            task: { id: "task1", title: "Fix bug" },
            comments: [],
            github: null,
            columns: [],
            reviewColumnId: null,
        });
        const result = await getTool("start_task").handler({
            teamId: "t1",
            projectId: "p1",
            taskId: "task1",
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.github).toBeNull();
        expect(parsed.workflow).not.toContain("commit_files");
    });

    it("start_task returns error when task is not queued", async () => {
        (mockClient as any).startTask.mockRejectedValueOnce(new Error("Task is not in QUEUED status"));
        const result = await getTool("start_task").handler({
            teamId: "t1",
            projectId: "p1",
            taskId: "task1",
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Task is not in QUEUED status");
    });
});

// ─── Session context fallback ─────────────────────────────────────

describe("session context fallback", () => {
    it("tools use session teamId/projectId when not provided explicitly", async () => {
        const mockClient = createMockClient() as ReturnType<typeof createMockClient>;
        const tools = captureTools(mockClient as PixelFixerClient);
        const getTool = (name: string) => tools.find((t) => t.name === name)!;

        // Initialize session (auto-discovers single team + project)
        (mockClient as any).searchTasks.mockResolvedValueOnce([]);
        await getTool("init_session").handler({});

        // Now call list_tasks WITHOUT teamId/projectId
        await getTool("list_tasks").handler({});
        expect(mockClient.listTasks).toHaveBeenCalledWith("t1", "p1");
    });

    it("explicit teamId/projectId overrides session", async () => {
        const mockClient = createMockClient() as ReturnType<typeof createMockClient>;
        const tools = captureTools(mockClient as PixelFixerClient);
        const getTool = (name: string) => tools.find((t) => t.name === name)!;

        // Initialize session
        (mockClient as any).searchTasks.mockResolvedValueOnce([]);
        await getTool("init_session").handler({});

        // Call with explicit different IDs
        await getTool("list_tasks").handler({ teamId: "t99", projectId: "p99" });
        expect(mockClient.listTasks).toHaveBeenCalledWith("t99", "p99");
    });

    it("throws helpful error when session not initialized and no IDs given", async () => {
        // Fresh tools instance — no session state
        const freshClient = createMockClient();
        const freshTools = captureTools(freshClient);
        const getTool = (name: string) => freshTools.find((t) => t.name === name)!;

        await expect(
            getTool("list_tasks").handler({}),
        ).rejects.toThrow("teamId required");
    });
});
