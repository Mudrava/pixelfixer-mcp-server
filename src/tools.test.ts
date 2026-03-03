/**
 * Tests for MCP tool registration and execution.
 *
 * Verifies:
 *  - All 22 tools are registered with correct names
 *  - Tool handlers call the right client methods
 *  - Tool responses are formatted correctly as MCP content
 *  - Error handling returns isError: true
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.js";
import type { PixelFixerClient } from "./client.js";

// ─── Mock client ─────────────────────────────────────────────────

function createMockClient(): PixelFixerClient {
    return {
        listTeams: vi.fn().mockResolvedValue([{ id: "t1", name: "Team" }]),
        listProjects: vi.fn().mockResolvedValue([{ id: "p1", name: "Project" }]),
        getProject: vi.fn().mockResolvedValue({ id: "p1", name: "Project" }),
        listMembers: vi.fn().mockResolvedValue([{ id: "u1", name: "Alice" }]),
        listTasks: vi.fn().mockResolvedValue([{ id: "task1", title: "Fix bug" }]),
        getTask: vi.fn().mockResolvedValue({ id: "task1", title: "Fix bug", comments: [] }),
        createTask: vi.fn().mockResolvedValue({ id: "task2", title: "New task" }),
        updateTask: vi.fn().mockResolvedValue({ id: "task1", status: "CLOSED" }),
        moveTask: vi.fn().mockResolvedValue({ success: true }),
        searchTasks: vi.fn().mockResolvedValue([]),
        addComment: vi.fn().mockResolvedValue({ id: "c1", content: "Done" }),
        listComments: vi.fn().mockResolvedValue([]),
        listColumns: vi.fn().mockResolvedValue([{ id: "col1", name: "Backlog" }]),
        getGitHubConnection: vi.fn().mockResolvedValue({ repoFullName: "org/repo", defaultBranch: "main" }),
        getRepoTree: vi.fn().mockResolvedValue({ type: "directory", items: [] }),
        getFileContent: vi.fn().mockResolvedValue({ path: "README.md", content: "# Hello" }),
        createBranchAndPR: vi.fn().mockResolvedValue({ branch: "fix/1", pullRequest: { url: "https://url", number: 1 } }),
        commitFiles: vi.fn().mockResolvedValue({ success: true, sha: "abc123", url: "https://url" }),
        reportAiResult: vi.fn().mockResolvedValue({ success: true }),
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
    "complete_ai_task",
    "list_ai_queue",
    "get_task_context",
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

    it("list_teams returns JSON content", async () => {
        const result = await getTool("list_teams").handler({});
        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe("text");
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed).toEqual([{ id: "t1", name: "Team" }]);
    });

    it("list_projects calls client.listProjects with teamId", async () => {
        await getTool("list_projects").handler({ teamId: "t1" });
        expect(mockClient.listProjects).toHaveBeenCalledWith("t1");
    });

    it("get_project calls client.getProject and includes github", async () => {
        const result = await getTool("get_project").handler({ teamId: "t1", projectId: "p1" });
        expect(mockClient.getProject).toHaveBeenCalledWith("t1", "p1");
        expect(mockClient.getGitHubConnection).toHaveBeenCalledWith("t1", "p1");
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.github).toBeDefined();
    });

    it("list_team_members calls client.listMembers", async () => {
        await getTool("list_team_members").handler({ teamId: "t1" });
        expect(mockClient.listMembers).toHaveBeenCalledWith("t1");
    });

    it("list_tasks calls client.listTasks", async () => {
        await getTool("list_tasks").handler({ teamId: "t1", projectId: "p1" });
        expect(mockClient.listTasks).toHaveBeenCalledWith("t1", "p1");
    });

    it("get_task calls client.getTask", async () => {
        await getTool("get_task").handler({ teamId: "t1", projectId: "p1", taskId: "task1" });
        expect(mockClient.getTask).toHaveBeenCalledWith("t1", "p1", "task1");
    });

    it("create_task passes all fields to client", async () => {
        await getTool("create_task").handler({
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
    });

    it("update_task does NOT pass columnId", async () => {
        await getTool("update_task").handler({
            teamId: "t1",
            projectId: "p1",
            taskId: "task1",
            status: "CLOSED",
        });
        expect(mockClient.updateTask).toHaveBeenCalledWith("t1", "p1", "task1", { status: "CLOSED" });
    });

    it("move_task calls client.moveTask with columnId and position", async () => {
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

    it("search_tasks returns 'no results' message for empty array", async () => {
        const result = await getTool("search_tasks").handler({
            teamId: "t1",
            projectId: "p1",
        });
        expect(result.content[0].text).toContain("No tasks found");
    });

    it("add_comment calls client.addComment", async () => {
        await getTool("add_comment").handler({
            teamId: "t1",
            projectId: "p1",
            taskId: "task1",
            content: "Done!",
        });
        expect(mockClient.addComment).toHaveBeenCalledWith("t1", "p1", "task1", "Done!");
    });

    it("list_comments calls client.listComments", async () => {
        const result = await getTool("list_comments").handler({
            teamId: "t1",
            projectId: "p1",
            taskId: "task1",
        });
        expect(mockClient.listComments).toHaveBeenCalledWith("t1", "p1", "task1");
        expect(result.content[0].text).toContain("No comments");
    });

    it("list_columns calls client.listColumns", async () => {
        await getTool("list_columns").handler({ teamId: "t1", projectId: "p1" });
        expect(mockClient.listColumns).toHaveBeenCalledWith("t1", "p1");
    });

    it("get_github_context returns null message when not connected", async () => {
        (mockClient as any).getGitHubConnection.mockResolvedValueOnce(null);
        const result = await getTool("get_github_context").handler({ teamId: "t1", projectId: "p1" });
        expect(result.content[0].text).toContain("No GitHub repository connected");
    });

    it("commit_files calls client.commitFiles with correct args", async () => {
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
        expect(result.content[0].text).toContain("Commit successful");
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

    it("create_pull_request returns branch and PR info", async () => {
        const result = await getTool("create_pull_request").handler({
            teamId: "t1",
            projectId: "p1",
            branchName: "fix/1",
            title: "Fix bug",
        });
        expect(result.content[0].text).toContain("Branch created: fix/1");
        expect(result.content[0].text).toContain("PR #1");
    });

    it("complete_ai_task calls reportAiResult", async () => {
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

    it("list_ai_queue searches for QUEUED,PROCESSING tasks", async () => {
        await getTool("list_ai_queue").handler({ teamId: "t1", projectId: "p1" });
        expect(mockClient.searchTasks).toHaveBeenCalledWith("t1", "p1", {
            aiStatus: "QUEUED,PROCESSING",
        });
    });

    it("get_task_context aggregates task, comments, and github", async () => {
        const result = await getTool("get_task_context").handler({
            teamId: "t1",
            projectId: "p1",
            taskId: "task1",
        });
        expect(mockClient.getTask).toHaveBeenCalledWith("t1", "p1", "task1");
        expect(mockClient.getGitHubConnection).toHaveBeenCalledWith("t1", "p1");

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.task).toBeDefined();
        expect(parsed.task.id).toBe("task1");
        expect(parsed.comments).toEqual([]);
        expect(parsed.github).toBeDefined();
        expect(parsed.github.repoFullName).toBe("org/repo");
    });

    it("get_task_context works without github connection", async () => {
        (mockClient as any).getGitHubConnection.mockResolvedValueOnce(null);
        const result = await getTool("get_task_context").handler({
            teamId: "t1",
            projectId: "p1",
            taskId: "task1",
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.github).toBeNull();
    });
});
