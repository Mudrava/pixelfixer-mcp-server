/**
 * PixelFixer API client for MCP server.
 *
 * Communicates with the PixelFixer web API using a Personal API Token.
 * Features:
 *   - Automatic retry with exponential backoff for 429/5xx errors
 *   - Request timeout (30 s)
 *   - Human-readable error messages
 *   - Helper to resolve task by human-readable number
 */
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_BASE_MS = 1_000;
export class PixelFixerClient {
    baseUrl;
    token;
    maxRetries;
    retryBaseMs;
    timeoutMs;
    constructor(baseUrl, token, options) {
        this.baseUrl = baseUrl.replace(/\/+$/, "");
        this.token = token;
        this.maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
        this.retryBaseMs = options?.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
        this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    }
    // ─── Core request with retry + timeout ───────────────────
    async request(path, options = {}) {
        const url = `${this.baseUrl}${path}`;
        let lastError = null;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), this.timeoutMs);
                const res = await fetch(url, {
                    ...options,
                    signal: controller.signal,
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${this.token}`,
                        ...options.headers,
                    },
                });
                clearTimeout(timer);
                // Retry on 429 (rate-limit) or 5xx (server error)
                if ((res.status === 429 || res.status >= 500) && attempt < this.maxRetries) {
                    const delay = this.retryBaseMs * Math.pow(2, attempt);
                    await new Promise((r) => setTimeout(r, delay));
                    continue;
                }
                if (!res.ok) {
                    const body = await res.text().catch(() => "");
                    throw new Error(friendlyError(res.status, body, path));
                }
                return res.json();
            }
            catch (err) {
                if (err instanceof DOMException && err.name === "AbortError") {
                    lastError = new Error(`Request timed out after ${this.timeoutMs / 1000}s: ${path}`);
                    if (attempt < this.maxRetries) {
                        await new Promise((r) => setTimeout(r, this.retryBaseMs * Math.pow(2, attempt)));
                        continue;
                    }
                }
                else if (err instanceof TypeError && attempt < this.maxRetries) {
                    // Network error — retry
                    lastError = err;
                    await new Promise((r) => setTimeout(r, this.retryBaseMs * Math.pow(2, attempt)));
                    continue;
                }
                else {
                    throw err;
                }
            }
        }
        throw lastError ?? new Error(`Request failed after ${this.maxRetries} retries: ${path}`);
    }
    // ─── Teams ───────────────────────────────────────────────
    async listTeams() {
        return this.request("/api/teams");
    }
    // ─── Members ─────────────────────────────────────────────
    async listMembers(teamId) {
        const data = await this.request(`/api/teams/${teamId}/members`);
        return data.map((m) => m.user);
    }
    // ─── Projects ────────────────────────────────────────────
    async listProjects(teamId) {
        return this.request(`/api/teams/${teamId}/projects`);
    }
    async getProject(teamId, projectId) {
        const projects = await this.listProjects(teamId);
        const proj = projects.find((p) => p.id === projectId);
        if (!proj)
            throw new Error(`Project ${projectId} not found in team ${teamId}. Use list_projects to see available projects.`);
        return proj;
    }
    // ─── Tasks ───────────────────────────────────────────────
    async listTasks(teamId, projectId) {
        const data = await this.request(`/api/teams/${teamId}/projects/${projectId}/tasks`);
        return data.tasks;
    }
    async getTask(teamId, projectId, taskId) {
        return this.request(`/api/teams/${teamId}/projects/${projectId}/tasks/${taskId}`);
    }
    /**
     * Resolve a human-readable task number (e.g. 43) to a task ID.
     * Searches tasks and returns the one with an exact taskNumber match.
     */
    async resolveTaskByNumber(teamId, projectId, taskNumber) {
        const tasks = await this.searchTasks(teamId, projectId, { q: String(taskNumber), limit: 20 });
        const match = tasks.find((t) => t.taskNumber === taskNumber);
        if (!match) {
            throw new Error(`Task #${taskNumber} not found. Check that the task number is correct.`);
        }
        return match;
    }
    async createTask(teamId, projectId, data) {
        return this.request(`/api/teams/${teamId}/projects/${projectId}/tasks`, {
            method: "POST",
            body: JSON.stringify(data),
        });
    }
    async updateTask(teamId, projectId, taskId, data) {
        return this.request(`/api/teams/${teamId}/projects/${projectId}/tasks/${taskId}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        });
    }
    async searchTasks(teamId, projectId, filters) {
        const params = new URLSearchParams();
        if (filters.q)
            params.set("q", filters.q);
        if (filters.status)
            params.set("status", filters.status);
        if (filters.priority)
            params.set("priority", filters.priority);
        if (filters.aiStatus)
            params.set("aiStatus", filters.aiStatus);
        if (filters.assigneeId)
            params.set("assigneeId", filters.assigneeId);
        if (filters.columnId)
            params.set("columnId", filters.columnId);
        if (filters.tag)
            params.set("tag", filters.tag);
        if (filters.limit)
            params.set("limit", String(filters.limit));
        const data = await this.request(`/api/teams/${teamId}/projects/${projectId}/tasks/search?${params.toString()}`);
        return data.tasks;
    }
    async moveTask(teamId, projectId, taskId, columnId, position = 0) {
        return this.request(`/api/teams/${teamId}/projects/${projectId}/tasks/${taskId}/move`, {
            method: "POST",
            body: JSON.stringify({ columnId, position }),
        });
    }
    async startTask(teamId, projectId, taskId) {
        return this.request(`/api/teams/${teamId}/projects/${projectId}/tasks/${taskId}/start`, {
            method: "POST",
            body: JSON.stringify({}),
        });
    }
    // ─── Comments ────────────────────────────────────────────
    async addComment(teamId, projectId, taskId, content) {
        return this.request(`/api/teams/${teamId}/projects/${projectId}/tasks/${taskId}/comments`, {
            method: "POST",
            body: JSON.stringify({ content }),
        });
    }
    async listComments(teamId, projectId, taskId) {
        return this.request(`/api/teams/${teamId}/projects/${projectId}/tasks/${taskId}/comments`);
    }
    // ─── Columns / Board ─────────────────────────────────────
    async listColumns(teamId, projectId) {
        return this.request(`/api/teams/${teamId}/projects/${projectId}/columns`);
    }
    // ─── GitHub Context ──────────────────────────────────────
    async getGitHubConnection(teamId, projectId) {
        try {
            const data = await this.request(`/api/teams/${teamId}/projects/${projectId}/github`);
            return data.connection;
        }
        catch {
            return null;
        }
    }
    async getRepoTree(teamId, projectId, path = "", ref) {
        const params = new URLSearchParams();
        if (path)
            params.set("path", path);
        if (ref)
            params.set("ref", ref);
        return this.request(`/api/teams/${teamId}/projects/${projectId}/github/tree?${params.toString()}`);
    }
    async getFileContent(teamId, projectId, path, ref) {
        const params = new URLSearchParams({ path, mode: "file" });
        if (ref)
            params.set("ref", ref);
        return this.request(`/api/teams/${teamId}/projects/${projectId}/github/tree?${params.toString()}`);
    }
    async createBranchAndPR(teamId, projectId, data) {
        return this.request(`/api/teams/${teamId}/projects/${projectId}/github/pr`, { method: "POST", body: JSON.stringify(data) });
    }
    async commitFiles(teamId, projectId, data) {
        return this.request(`/api/teams/${teamId}/projects/${projectId}/github/commit`, { method: "POST", body: JSON.stringify(data) });
    }
    // ─── AI Callback ─────────────────────────────────────────
    async reportAiResult(teamId, projectId, taskId, data) {
        return this.request(`/api/teams/${teamId}/projects/${projectId}/tasks/${taskId}/ai-callback`, {
            method: "POST",
            body: JSON.stringify(data),
        });
    }
}
// ─── Helpers ─────────────────────────────────────────────────
function friendlyError(status, body, path) {
    const detail = body ? `: ${body.slice(0, 200)}` : "";
    switch (status) {
        case 401: return `Authentication failed (401). Check your PIXELFIXER_API_TOKEN.${detail}`;
        case 403: return `Access denied (403). Your token may lack the required scope.${detail}`;
        case 404: return `Not found (404) — ${path}. Check that the ID is correct.${detail}`;
        case 422: return `Validation error (422)${detail}`;
        case 429: return `Rate limited (429). Try again later.${detail}`;
        default: return `API error ${status} — ${path}${detail}`;
    }
}
export function compactTask(t) {
    return {
        id: t.id,
        taskNumber: t.taskNumber,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        aiStatus: t.aiStatus,
        column: t.column?.name ?? null,
        tags: t.tags?.map((tt) => tt.tag.name) ?? [],
        assignee: t.assignee?.name ?? t.assignee?.email ?? null,
    };
}
//# sourceMappingURL=client.js.map