/**
 * Comprehensive tests for the PixelFixer MCP client.
 *
 * v1.0 tests cover:
 *  - Correct URL construction
 *  - Correct HTTP method and headers
 *  - Correct body serialization and response parsing
 *  - Friendly error messages (401, 403, 404, 422, generic)
 *  - resolveTaskByNumber helper
 *  - compactTask helper
 *  - Retry behaviour for transient errors (429, 5xx)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { PixelFixerClient, compactTask } from "./client.js";
import type { Task } from "./client.js";

// ─── Mocked fetch ────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockResponse(data: unknown, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(data),
        text: () => Promise.resolve(JSON.stringify(data)),
    };
}

// ─── Setup ───────────────────────────────────────────────────────

const BASE_URL = "https://app.pixelfixer.io";
const TOKEN = "pf_test_token_12345";
let client: PixelFixerClient;

beforeEach(() => {
    mockFetch.mockReset();
    client = new PixelFixerClient(BASE_URL, TOKEN);
});

function expectAuthHeaders() {
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(options.headers["Content-Type"]).toBe("application/json");
}

// ─── Teams ───────────────────────────────────────────────────────

describe("listTeams", () => {
    it("calls GET /api/teams with auth header", async () => {
        const teams = [{ id: "t1", name: "Team A", slug: "team-a" }];
        mockFetch.mockResolvedValueOnce(mockResponse(teams));

        const result = await client.listTeams();

        expect(mockFetch).toHaveBeenCalledOnce();
        expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/teams`);
        expectAuthHeaders();
        expect(result).toEqual(teams);
    });

    it("throws friendly error on 401", async () => {
        mockFetch.mockResolvedValueOnce(mockResponse({ error: "Unauthorized" }, 401));
        await expect(client.listTeams()).rejects.toThrow("Authentication failed (401)");
    });
});

// ─── Members ─────────────────────────────────────────────────────

describe("listMembers", () => {
    it("calls GET /api/teams/:teamId/members and unwraps user objects", async () => {
        const data = [
            { user: { id: "u1", name: "Alice", email: "alice@test.com", avatarUrl: null } },
            { user: { id: "u2", name: "Bob", email: "bob@test.com", avatarUrl: null } },
        ];
        mockFetch.mockResolvedValueOnce(mockResponse(data));

        const result = await client.listMembers("t1");

        expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/teams/t1/members`);
        expect(result).toEqual([data[0]!.user, data[1]!.user]);
    });
});

// ─── Projects ────────────────────────────────────────────────────

describe("listProjects", () => {
    it("calls GET /api/teams/:teamId/projects", async () => {
        const projects = [{ id: "p1", name: "My Project", slug: "my-project" }];
        mockFetch.mockResolvedValueOnce(mockResponse(projects));

        const result = await client.listProjects("t1");

        expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/teams/t1/projects`);
        expect(result).toEqual(projects);
    });
});

describe("getProject", () => {
    it("finds project from listProjects by ID", async () => {
        const projects = [
            { id: "p1", name: "Project 1" },
            { id: "p2", name: "Project 2" },
        ];
        mockFetch.mockResolvedValueOnce(mockResponse(projects));

        const result = await client.getProject("t1", "p2");
        expect(result).toEqual({ id: "p2", name: "Project 2" });
    });

    it("throws if project not found", async () => {
        mockFetch.mockResolvedValueOnce(mockResponse([]));
        await expect(client.getProject("t1", "missing")).rejects.toThrow("Project missing not found");
    });
});

// ─── Tasks ───────────────────────────────────────────────────────

describe("listTasks", () => {
    it("calls GET and unwraps .tasks array", async () => {
        const tasks = [{ id: "task1", title: "Fix bug" }];
        mockFetch.mockResolvedValueOnce(mockResponse({ tasks }));

        const result = await client.listTasks("t1", "p1");

        expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/teams/t1/projects/p1/tasks`);
        expect(result).toEqual(tasks);
    });
});

describe("getTask", () => {
    it("calls GET /tasks/:taskId", async () => {
        const task = { id: "task1", title: "Fix bug", status: "OPEN" };
        mockFetch.mockResolvedValueOnce(mockResponse(task));

        const result = await client.getTask("t1", "p1", "task1");

        expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/teams/t1/projects/p1/tasks/task1`);
        expect(result).toEqual(task);
    });
});

describe("createTask", () => {
    it("sends POST with task data", async () => {
        const input = { title: "New task", columnId: "col1", priority: "HIGH" };
        const created = { id: "task2", ...input };
        mockFetch.mockResolvedValueOnce(mockResponse(created));

        const result = await client.createTask("t1", "p1", input as any);

        expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/teams/t1/projects/p1/tasks`);
        const [, options] = mockFetch.mock.calls[0];
        expect(options.method).toBe("POST");
        expect(JSON.parse(options.body)).toEqual(input);
        expect(result).toEqual(created);
    });
});

describe("updateTask", () => {
    it("sends PATCH with update data", async () => {
        const update = { status: "CLOSED", priority: "LOW" };
        const updated = { id: "task1", ...update };
        mockFetch.mockResolvedValueOnce(mockResponse(updated));

        const result = await client.updateTask("t1", "p1", "task1", update);

        expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/teams/t1/projects/p1/tasks/task1`);
        const [, options] = mockFetch.mock.calls[0];
        expect(options.method).toBe("PATCH");
        expect(JSON.parse(options.body)).toEqual(update);
        expect(result).toEqual(updated);
    });
});

describe("moveTask", () => {
    it("sends POST to /tasks/:taskId/move with columnId and position", async () => {
        mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));

        const result = await client.moveTask("t1", "p1", "task1", "col-done", 0);

        expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/teams/t1/projects/p1/tasks/task1/move`);
        const [, options] = mockFetch.mock.calls[0];
        expect(options.method).toBe("POST");
        expect(JSON.parse(options.body)).toEqual({ columnId: "col-done", position: 0 });
        expect(result).toEqual({ success: true });
    });
});

describe("searchTasks", () => {
    it("builds query params from filters", async () => {
        mockFetch.mockResolvedValueOnce(mockResponse({ tasks: [] }));

        await client.searchTasks("t1", "p1", {
            q: "login",
            status: "OPEN",
            priority: "HIGH",
            assigneeId: "u1",
            columnId: "col1",
            tag: "frontend",
            limit: 10,
        });

        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain("/tasks/search?");
        expect(url).toContain("q=login");
        expect(url).toContain("status=OPEN");
        expect(url).toContain("priority=HIGH");
        expect(url).toContain("assigneeId=u1");
        expect(url).toContain("columnId=col1");
        expect(url).toContain("tag=frontend");
        expect(url).toContain("limit=10");
    });

    it("omits undefined filters", async () => {
        mockFetch.mockResolvedValueOnce(mockResponse({ tasks: [] }));

        await client.searchTasks("t1", "p1", { q: "bug" });

        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain("q=bug");
        expect(url).not.toContain("status=");
        expect(url).not.toContain("priority=");
    });
});

// ─── resolveTaskByNumber ─────────────────────────────────────────

describe("resolveTaskByNumber", () => {
    it("finds task by exact taskNumber match", async () => {
        const tasks = [
            { id: "task1", taskNumber: 42, title: "Fix login" },
            { id: "task2", taskNumber: 43, title: "Fix logout" },
        ];
        mockFetch.mockResolvedValueOnce(mockResponse({ tasks }));

        const result = await client.resolveTaskByNumber("t1", "p1", 43);

        expect(result).toEqual(tasks[1]);
        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain("q=43");
    });

    it("throws if task number not found", async () => {
        mockFetch.mockResolvedValueOnce(mockResponse({ tasks: [] }));

        await expect(client.resolveTaskByNumber("t1", "p1", 999)).rejects.toThrow("Task #999 not found");
    });
});

// ─── Comments ────────────────────────────────────────────────────

describe("addComment", () => {
    it("sends POST with content", async () => {
        const comment = { id: "c1", content: "Done!", createdAt: "2026-01-12T00:00:00Z" };
        mockFetch.mockResolvedValueOnce(mockResponse(comment));

        const result = await client.addComment("t1", "p1", "task1", "Done!");

        expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/teams/t1/projects/p1/tasks/task1/comments`);
        const [, options] = mockFetch.mock.calls[0];
        expect(options.method).toBe("POST");
        expect(JSON.parse(options.body)).toEqual({ content: "Done!" });
        expect(result).toEqual(comment);
    });
});

describe("listComments", () => {
    it("calls GET /comments", async () => {
        const comments = [{ id: "c1", content: "Test" }];
        mockFetch.mockResolvedValueOnce(mockResponse(comments));

        const result = await client.listComments("t1", "p1", "task1");

        expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/teams/t1/projects/p1/tasks/task1/comments`);
        expect(result).toEqual(comments);
    });
});

// ─── Columns ─────────────────────────────────────────────────────

describe("listColumns", () => {
    it("calls GET /columns", async () => {
        const columns = [
            { id: "col1", name: "Backlog", position: 0, color: "#ccc", isDefault: true, isInternal: false, isAiTrigger: false },
            { id: "col2", name: "Done", position: 3, color: "#0f0", isDefault: false, isInternal: false, isAiTrigger: false },
        ];
        mockFetch.mockResolvedValueOnce(mockResponse(columns));

        const result = await client.listColumns("t1", "p1");

        expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/teams/t1/projects/p1/columns`);
        expect(result).toEqual(columns);
    });
});

// ─── GitHub ──────────────────────────────────────────────────────

describe("getGitHubConnection", () => {
    it("returns connection data on success", async () => {
        const data = {
            configured: true,
            connection: { id: "gh1", repoFullName: "org/repo", defaultBranch: "main" },
        };
        mockFetch.mockResolvedValueOnce(mockResponse(data));

        const result = await client.getGitHubConnection("t1", "p1");
        expect(result).toEqual(data.connection);
    });

    it("returns null on error", async () => {
        mockFetch.mockResolvedValueOnce(mockResponse({ error: "Not found" }, 404));

        const result = await client.getGitHubConnection("t1", "p1");
        expect(result).toBeNull();
    });
});

describe("getRepoTree", () => {
    it("calls GET /github/tree with path and ref", async () => {
        const tree = { type: "directory", path: "src", items: [] };
        mockFetch.mockResolvedValueOnce(mockResponse(tree));

        const result = await client.getRepoTree("t1", "p1", "src", "develop");

        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain("/github/tree?");
        expect(url).toContain("path=src");
        expect(url).toContain("ref=develop");
        expect(result).toEqual(tree);
    });
});

describe("getFileContent", () => {
    it("calls GET /github/tree with mode=file", async () => {
        const file = { type: "file", path: "README.md", content: "# Hello", sha: "abc" };
        mockFetch.mockResolvedValueOnce(mockResponse(file));

        const result = await client.getFileContent("t1", "p1", "README.md");

        const url: string = mockFetch.mock.calls[0][0];
        expect(url).toContain("mode=file");
        expect(url).toContain("path=README.md");
        expect(result).toEqual(file);
    });
});

describe("createBranchAndPR", () => {
    it("sends POST to /github/pr", async () => {
        const prResult = {
            branch: "fix/issue-1",
            pullRequest: { url: "https://github.com/org/repo/pull/1", number: 1 },
        };
        mockFetch.mockResolvedValueOnce(mockResponse(prResult));

        const result = await client.createBranchAndPR("t1", "p1", {
            branchName: "fix/issue-1",
            title: "Fix issue #1",
            body: "Closes #1",
        });

        const [, options] = mockFetch.mock.calls[0];
        expect(options.method).toBe("POST");
        const body = JSON.parse(options.body);
        expect(body.branchName).toBe("fix/issue-1");
        expect(body.title).toBe("Fix issue #1");
        expect(result).toEqual(prResult);
    });
});

describe("commitFiles", () => {
    it("sends POST to /github/commit with branch, message, files", async () => {
        const commitResult = { success: true, sha: "abc123", url: "https://github.com/commit/abc123" };
        mockFetch.mockResolvedValueOnce(mockResponse(commitResult));

        const result = await client.commitFiles("t1", "p1", {
            branch: "fix/issue-1",
            message: "fix: remove duplicate link",
            files: [
                { path: "src/Footer.tsx", content: "export default function Footer() {}" },
            ],
        });

        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toBe(`${BASE_URL}/api/teams/t1/projects/p1/github/commit`);
        expect(options.method).toBe("POST");
        const body = JSON.parse(options.body);
        expect(body.branch).toBe("fix/issue-1");
        expect(body.message).toBe("fix: remove duplicate link");
        expect(body.files).toHaveLength(1);
        expect(body.files[0].path).toBe("src/Footer.tsx");
        expect(result).toEqual(commitResult);
    });
});

describe("reportAiResult", () => {
    it("sends POST to /ai-callback", async () => {
        mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));

        const result = await client.reportAiResult("t1", "p1", "task1", {
            aiStatus: "COMPLETED",
            comment: "Fixed the bug",
            prUrl: "https://github.com/org/repo/pull/1",
        });

        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toBe(`${BASE_URL}/api/teams/t1/projects/p1/tasks/task1/ai-callback`);
        expect(options.method).toBe("POST");
        expect(result).toEqual({ success: true });
    });
});

// ─── Start Task ──────────────────────────────────────────────────

describe("startTask", () => {
    it("sends POST to /start and returns context", async () => {
        const startResult = {
            task: { id: "task1", title: "Fix bug", taskNumber: 42 },
            comments: [],
            github: { repoFullName: "org/repo", defaultBranch: "main" },
            columns: [{ id: "col1", name: "In Progress" }],
            reviewColumnId: "col-review",
        };
        mockFetch.mockResolvedValueOnce(mockResponse(startResult));

        const result = await client.startTask("t1", "p1", "task1");

        const [url, options] = mockFetch.mock.calls[0];
        expect(url).toBe(`${BASE_URL}/api/teams/t1/projects/p1/tasks/task1/start`);
        expect(options.method).toBe("POST");
        expectAuthHeaders();
        expect(result).toEqual(startResult);
    });

    it("throws on 400 when task is not queued", async () => {
        mockFetch.mockResolvedValueOnce(mockResponse({ error: "Task is not in QUEUED status" }, 400));
        await expect(client.startTask("t1", "p1", "task1")).rejects.toThrow("API error 400");
    });
});

// ─── compactTask helper ──────────────────────────────────────────

describe("compactTask", () => {
    it("returns only summary fields", () => {
        const fullTask: Task = {
            id: "task1",
            taskNumber: 42,
            title: "Fix login page",
            description: "Long description here...",
            status: "IN_PROGRESS",
            priority: "HIGH",
            aiStatus: "PROCESSING",
            aiPrUrl: null,
            columnId: "col1",
            projectId: "p1",
            source: "EXTENSION",
            pageUrl: "https://example.com/login",
            selector: ".btn-login",
            screenshotUrl: "https://cdn.example.com/shot.png",
            browserInfo: { browser: "Chrome" },
            consoleErrors: [{ message: "TypeError" }],
            networkErrors: [],
            metadata: {},
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-02T00:00:00Z",
            tags: [{ tag: { id: "tag1", name: "frontend", color: "#f00" } }],
            assignee: { id: "u1", name: "Alice", email: "alice@test.com" },
            column: { id: "col1", name: "In Progress", color: "#0ff" },
        };

        const summary = compactTask(fullTask);

        expect(summary).toEqual({
            id: "task1",
            taskNumber: 42,
            title: "Fix login page",
            status: "IN_PROGRESS",
            priority: "HIGH",
            aiStatus: "PROCESSING",
            column: "In Progress",
            tags: ["frontend"],
            assignee: "Alice",
        });
    });

    it("handles missing optional fields", () => {
        const minTask: Task = {
            id: "task2",
            taskNumber: null,
            title: "Bare task",
            description: null,
            status: "OPEN",
            priority: "LOW",
            aiStatus: "NONE",
            aiPrUrl: null,
            columnId: "col1",
            projectId: "p1",
            source: "WEB",
            pageUrl: null,
            selector: null,
            screenshotUrl: null,
            browserInfo: null,
            consoleErrors: null,
            networkErrors: null,
            metadata: null,
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
        };

        const summary = compactTask(minTask);

        expect(summary.column).toBeNull();
        expect(summary.tags).toEqual([]);
        expect(summary.assignee).toBeNull();
    });
});

// ─── Error handling ──────────────────────────────────────────────

describe("error handling", () => {
    it("returns friendly message with body for 403", async () => {
        mockFetch.mockResolvedValueOnce(mockResponse({ error: "Forbidden" }, 403));
        await expect(client.listTeams()).rejects.toThrow("Access denied (403)");
    });

    it("returns friendly message for 404", async () => {
        mockFetch.mockResolvedValueOnce(mockResponse({ error: "Not found" }, 404));
        await expect(client.getTask("t1", "p1", "missing")).rejects.toThrow("Not found (404)");
    });

    it("returns validation error for 422", async () => {
        mockFetch.mockResolvedValueOnce(mockResponse({ error: "Invalid input" }, 422));
        await expect(client.createTask("t1", "p1", {} as any)).rejects.toThrow("Validation error (422)");
    });

    it("handles empty error body gracefully", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 400,
            text: () => Promise.resolve(""),
        });
        await expect(client.listTeams()).rejects.toThrow("API error 400");
    });

    it("strips trailing slash from base URL", () => {
        const c = new PixelFixerClient("https://app.test.com///", "token");
        mockFetch.mockResolvedValueOnce(mockResponse([]));
        c.listTeams();
        expect(mockFetch.mock.calls[0][0]).toBe("https://app.test.com/api/teams");
    });
});

// ─── Retry behaviour ────────────────────────────────────────────

describe("retry", () => {
    let retryClient: PixelFixerClient;

    beforeEach(() => {
        retryClient = new PixelFixerClient(BASE_URL, TOKEN, { retryBaseMs: 0, timeoutMs: 60_000 });
    });

    it("retries on 429 and succeeds", async () => {
        const teams = [{ id: "t1", name: "Team" }];
        mockFetch
            .mockResolvedValueOnce(mockResponse({}, 429))
            .mockResolvedValueOnce(mockResponse(teams));

        const result = await retryClient.listTeams();

        expect(result).toEqual(teams);
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("retries on 500 and succeeds on second attempt", async () => {
        const teams = [{ id: "t1", name: "Team" }];
        mockFetch
            .mockResolvedValueOnce(mockResponse({}, 500))
            .mockResolvedValueOnce(mockResponse(teams));

        const result = await retryClient.listTeams();

        expect(result).toEqual(teams);
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("throws after exhausting retries on 500", async () => {
        for (let i = 0; i < 4; i++) {
            mockFetch.mockResolvedValueOnce(mockResponse({ error: "Server Error" }, 500));
        }

        await expect(retryClient.listTeams()).rejects.toThrow("API error 500");
        expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it("does NOT retry on 401", async () => {
        mockFetch.mockResolvedValueOnce(mockResponse({}, 401));

        await expect(retryClient.listTeams()).rejects.toThrow("Authentication failed (401)");
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });
});
