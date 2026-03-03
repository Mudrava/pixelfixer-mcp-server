/**
 * PixelFixer API client for MCP server.
 * Communicates with the PixelFixer web API using a Personal API Token.
 */
export class PixelFixerClient {
    baseUrl;
    token;
    constructor(baseUrl, token) {
        this.baseUrl = baseUrl.replace(/\/+$/, "");
        this.token = token;
    }
    async request(path, options = {}) {
        const url = `${this.baseUrl}${path}`;
        const res = await fetch(url, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.token}`,
                ...options.headers,
            },
        });
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`PixelFixer API error ${res.status}: ${body}`);
        }
        return res.json();
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
            throw new Error(`Project ${projectId} not found`);
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
//# sourceMappingURL=client.js.map