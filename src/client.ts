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

export interface ClientOptions {
    maxRetries?: number;
    retryBaseMs?: number;
    timeoutMs?: number;
}

export class PixelFixerClient {
    private baseUrl: string;
    private token: string;
    private maxRetries: number;
    private retryBaseMs: number;
    private timeoutMs: number;

    constructor(baseUrl: string, token: string, options?: ClientOptions) {
        this.baseUrl = baseUrl.replace(/\/+$/, "");
        this.token = token;
        this.maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
        this.retryBaseMs = options?.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
        this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    }

    // ─── Core request with retry + timeout ───────────────────

    private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
        const url = `${this.baseUrl}${path}`;
        let lastError: Error | null = null;

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

                return res.json() as Promise<T>;
            } catch (err) {
                if (err instanceof DOMException && err.name === "AbortError") {
                    lastError = new Error(`Request timed out after ${this.timeoutMs / 1000}s: ${path}`);
                    if (attempt < this.maxRetries) {
                        await new Promise((r) => setTimeout(r, this.retryBaseMs * Math.pow(2, attempt)));
                        continue;
                    }
                } else if (err instanceof TypeError && attempt < this.maxRetries) {
                    // Network error — retry
                    lastError = err as Error;
                    await new Promise((r) => setTimeout(r, this.retryBaseMs * Math.pow(2, attempt)));
                    continue;
                } else {
                    throw err;
                }
            }
        }

        throw lastError ?? new Error(`Request failed after ${this.maxRetries} retries: ${path}`);
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
        if (!proj) throw new Error(`Project ${projectId} not found in team ${teamId}. Use list_projects to see available projects.`);
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

    /**
     * Resolve a human-readable task number (e.g. 43) to a task ID.
     * Searches tasks and returns the one with an exact taskNumber match.
     */
    async resolveTaskByNumber(teamId: string, projectId: string, taskNumber: number): Promise<Task> {
        const tasks = await this.searchTasks(teamId, projectId, { q: String(taskNumber), limit: 20 });
        const match = tasks.find((t) => t.taskNumber === taskNumber);
        if (!match) {
            throw new Error(`Task #${taskNumber} not found. Check that the task number is correct.`);
        }
        return match;
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

    async moveTask(teamId: string, projectId: string, taskId: string, columnId: string, position = 0): Promise<{ success: boolean }> {
        return this.request<{ success: boolean }>(`/api/teams/${teamId}/projects/${projectId}/tasks/${taskId}/move`, {
            method: "POST",
            body: JSON.stringify({ columnId, position }),
        });
    }

    async startTask(teamId: string, projectId: string, taskId: string): Promise<StartTaskResult> {
        return this.request<StartTaskResult>(`/api/teams/${teamId}/projects/${projectId}/tasks/${taskId}/start`, {
            method: "POST",
            body: JSON.stringify({}),
        });
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

    async commitFiles(
        teamId: string,
        projectId: string,
        data: { branch: string; message: string; files: { path: string; content: string }[] },
    ): Promise<{ success: boolean; sha: string; url: string }> {
        return this.request(
            `/api/teams/${teamId}/projects/${projectId}/github/commit`,
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

// ─── Helpers ─────────────────────────────────────────────────

function friendlyError(status: number, body: string, path: string): string {
    const detail = body ? `: ${body.slice(0, 200)}` : "";
    switch (status) {
        case 401: return `Authentication failed (401). Check your PIXELFIXER_API_TOKEN.${detail}`;
        case 403: return `Access denied (403). Your token may lack the required scope.${detail}`;
        case 404: return `Not found (404) — ${path}. Check that the ID is correct.${detail}`;
        case 422: return `Validation error (422)${detail}`;
        case 429: return `Rate limited (429). Try again later.${detail}`;
        default:  return `API error ${status} — ${path}${detail}`;
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

/** Compact task summary for list views — saves ~90% tokens vs full Task */
export interface TaskSummary {
    id: string;
    taskNumber: number | null;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    aiStatus: string;
    column: string | null;
    tags: string[];
    assignee: string | null;
}

export function compactTask(t: Task): TaskSummary {
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
    isAiReview: boolean;
}

export interface StartTaskResult {
    task: Task;
    comments: Comment[];
    github: GitHubConnection | null;
    columns: Column[];
    reviewColumnId: string | null;
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
