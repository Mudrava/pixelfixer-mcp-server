/**
 * PixelFixer API client for MCP server.
 * Communicates with the PixelFixer web API using a Personal API Token.
 */

export class PixelFixerClient {
    private baseUrl: string;
    private token: string;

    constructor(baseUrl: string, token: string) {
        this.baseUrl = baseUrl.replace(/\/+$/, "");
        this.token = token;
    }

    private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
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

        return res.json() as Promise<T>;
    }

    // ─── Teams ───────────────────────────────────────────────
    async listTeams(): Promise<Team[]> {
        return this.request<Team[]>("/api/teams");
    }

    // ─── Members ─────────────────────────────────────────────
    async listMembers(teamId: string): Promise<TeamMember[]> {
        const data = await this.request<{ user: TeamMember }[]>(`/api/teams/${teamId}/members`);
        return data.map((m) => m.user);
    }

    // ─── Projects ────────────────────────────────────────────
    async listProjects(teamId: string): Promise<Project[]> {
        return this.request<Project[]>(`/api/teams/${teamId}/projects`);
    }

    async getProject(teamId: string, projectId: string): Promise<Project> {
        const projects = await this.listProjects(teamId);
        const proj = projects.find((p) => p.id === projectId);
        if (!proj) throw new Error(`Project ${projectId} not found`);
        return proj;
    }

    // ─── Tasks ───────────────────────────────────────────────
    async listTasks(teamId: string, projectId: string): Promise<Task[]> {
        const data = await this.request<{ tasks: Task[] }>(`/api/teams/${teamId}/projects/${projectId}/tasks`);
        return data.tasks;
    }

    async getTask(teamId: string, projectId: string, taskId: string): Promise<Task> {
        return this.request<Task>(`/api/teams/${teamId}/projects/${projectId}/tasks/${taskId}`);
    }

    async createTask(teamId: string, projectId: string, data: CreateTaskInput): Promise<Task> {
        return this.request<Task>(`/api/teams/${teamId}/projects/${projectId}/tasks`, {
            method: "POST",
            body: JSON.stringify(data),
        });
    }

    async updateTask(teamId: string, projectId: string, taskId: string, data: TaskUpdate): Promise<Task> {
        return this.request<Task>(`/api/teams/${teamId}/projects/${projectId}/tasks/${taskId}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        });
    }

    async searchTasks(teamId: string, projectId: string, filters: SearchFilters): Promise<Task[]> {
        const params = new URLSearchParams();
        if (filters.q) params.set("q", filters.q);
        if (filters.status) params.set("status", filters.status);
        if (filters.priority) params.set("priority", filters.priority);
        if (filters.aiStatus) params.set("aiStatus", filters.aiStatus);
        if (filters.assigneeId) params.set("assigneeId", filters.assigneeId);
        if (filters.columnId) params.set("columnId", filters.columnId);
        if (filters.tag) params.set("tag", filters.tag);
        if (filters.limit) params.set("limit", String(filters.limit));
        const data = await this.request<{ tasks: Task[] }>(
            `/api/teams/${teamId}/projects/${projectId}/tasks/search?${params.toString()}`,
        );
        return data.tasks;
    }

    // ─── Comments ────────────────────────────────────────────
    async addComment(teamId: string, projectId: string, taskId: string, content: string): Promise<Comment> {
        return this.request<Comment>(`/api/teams/${teamId}/projects/${projectId}/tasks/${taskId}/comments`, {
            method: "POST",
            body: JSON.stringify({ content }),
        });
    }

    async listComments(teamId: string, projectId: string, taskId: string): Promise<Comment[]> {
        return this.request<Comment[]>(`/api/teams/${teamId}/projects/${projectId}/tasks/${taskId}/comments`);
    }

    // ─── Columns / Board ─────────────────────────────────────
    async listColumns(teamId: string, projectId: string): Promise<Column[]> {
        return this.request<Column[]>(`/api/teams/${teamId}/projects/${projectId}/columns`);
    }

    // ─── GitHub Context ──────────────────────────────────────
    async getGitHubConnection(teamId: string, projectId: string): Promise<GitHubConnection | null> {
        try {
            const data = await this.request<{ configured: boolean; connection: GitHubConnection | null }>(
                `/api/teams/${teamId}/projects/${projectId}/github`,
            );
            return data.connection;
        } catch {
            return null;
        }
    }

    async getRepoTree(teamId: string, projectId: string, path = "", ref?: string): Promise<RepoTreeResult> {
        const params = new URLSearchParams();
        if (path) params.set("path", path);
        if (ref) params.set("ref", ref);
        return this.request<RepoTreeResult>(
            `/api/teams/${teamId}/projects/${projectId}/github/tree?${params.toString()}`,
        );
    }

    async getFileContent(teamId: string, projectId: string, path: string, ref?: string): Promise<FileContentResult> {
        const params = new URLSearchParams({ path, mode: "file" });
        if (ref) params.set("ref", ref);
        return this.request<FileContentResult>(
            `/api/teams/${teamId}/projects/${projectId}/github/tree?${params.toString()}`,
        );
    }

    async createBranchAndPR(
        teamId: string,
        projectId: string,
        data: { branchName: string; baseBranch?: string; title: string; body?: string },
    ): Promise<{ branch: string; pullRequest: { url: string; number: number } }> {
        return this.request(
            `/api/teams/${teamId}/projects/${projectId}/github/pr`,
            { method: "POST", body: JSON.stringify(data) },
        );
    }

    // ─── AI Callback ─────────────────────────────────────────
    async reportAiResult(
        teamId: string,
        projectId: string,
        taskId: string,
        data: AiCallbackData,
    ): Promise<{ success: boolean }> {
        return this.request<{ success: boolean }>(
            `/api/teams/${teamId}/projects/${projectId}/tasks/${taskId}/ai-callback`,
            {
                method: "POST",
                body: JSON.stringify(data),
            },
        );
    }
}

// ─── Types ───────────────────────────────────────────────────

export interface Team {
    id: string;
    name: string;
    slug: string;
}

export interface TeamMember {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
}

export interface Project {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    teamId: string;
    websiteUrl: string | null;
}

export interface Task {
    id: string;
    taskNumber: number | null;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    aiStatus: string;
    aiPrUrl: string | null;
    columnId: string;
    projectId: string;
    source: string;
    pageUrl: string | null;
    selector: string | null;
    screenshotUrl: string | null;
    browserInfo: Record<string, unknown> | null;
    consoleErrors: unknown[] | null;
    networkErrors: unknown[] | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
    tags?: { tag: { id: string; name: string; color: string } }[];
    assignee?: { id: string; name: string | null; email: string } | null;
    column?: { id: string; name: string; color: string };
    comments?: Comment[];
}

export interface CreateTaskInput {
    title: string;
    description?: string;
    priority?: string;
    columnId: string;
    assigneeId?: string;
    tags?: string[];
    isInternal?: boolean;
    dueDate?: string;
    pageUrl?: string;
}

export interface TaskUpdate {
    title?: string;
    description?: string;
    status?: string;
    priority?: string;
    aiStatus?: string;
    aiPrUrl?: string;
    columnId?: string;
    assigneeId?: string | null;
}

export interface SearchFilters {
    q?: string;
    status?: string;
    priority?: string;
    aiStatus?: string;
    assigneeId?: string;
    columnId?: string;
    tag?: string;
    limit?: number;
}

export interface Comment {
    id: string;
    content: string;
    createdAt: string;
    author?: { id: string; name: string | null; email: string };
}

export interface Column {
    id: string;
    name: string;
    position: number;
    color: string;
    isDefault: boolean;
    isInternal: boolean;
    isAiTrigger: boolean;
}

export interface GitHubConnection {
    id: string;
    repoFullName: string;
    defaultBranch: string;
    installationAccount?: string;
}

export interface RepoTreeResult {
    type: "directory" | "file";
    path: string;
    items?: { name: string; path: string; type: string; size: number | null; sha: string }[];
    content?: string;
    sha?: string;
}

export interface FileContentResult {
    type: "file";
    path: string;
    content: string;
    sha: string;
}

export interface AiCallbackData {
    aiStatus: "COMPLETED" | "FAILED";
    comment?: string;
    prUrl?: string;
}
