/**
 * PixelFixer API client for MCP server.
 * Communicates with the PixelFixer web API using a Personal API Token.
 */
export declare class PixelFixerClient {
    private baseUrl;
    private token;
    constructor(baseUrl: string, token: string);
    private request;
    listTeams(): Promise<Team[]>;
    listMembers(teamId: string): Promise<TeamMember[]>;
    listProjects(teamId: string): Promise<Project[]>;
    getProject(teamId: string, projectId: string): Promise<Project>;
    listTasks(teamId: string, projectId: string): Promise<Task[]>;
    getTask(teamId: string, projectId: string, taskId: string): Promise<Task>;
    createTask(teamId: string, projectId: string, data: CreateTaskInput): Promise<Task>;
    updateTask(teamId: string, projectId: string, taskId: string, data: TaskUpdate): Promise<Task>;
    searchTasks(teamId: string, projectId: string, filters: SearchFilters): Promise<Task[]>;
    moveTask(teamId: string, projectId: string, taskId: string, columnId: string, position?: number): Promise<{
        success: boolean;
    }>;
    startTask(teamId: string, projectId: string, taskId: string): Promise<StartTaskResult>;
    addComment(teamId: string, projectId: string, taskId: string, content: string): Promise<Comment>;
    listComments(teamId: string, projectId: string, taskId: string): Promise<Comment[]>;
    listColumns(teamId: string, projectId: string): Promise<Column[]>;
    getGitHubConnection(teamId: string, projectId: string): Promise<GitHubConnection | null>;
    getRepoTree(teamId: string, projectId: string, path?: string, ref?: string): Promise<RepoTreeResult>;
    getFileContent(teamId: string, projectId: string, path: string, ref?: string): Promise<FileContentResult>;
    createBranchAndPR(teamId: string, projectId: string, data: {
        branchName: string;
        baseBranch?: string;
        title: string;
        body?: string;
    }): Promise<{
        branch: string;
        pullRequest: {
            url: string;
            number: number;
        };
    }>;
    commitFiles(teamId: string, projectId: string, data: {
        branch: string;
        message: string;
        files: {
            path: string;
            content: string;
        }[];
    }): Promise<{
        success: boolean;
        sha: string;
        url: string;
    }>;
    reportAiResult(teamId: string, projectId: string, taskId: string, data: AiCallbackData): Promise<{
        success: boolean;
    }>;
}
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
    tags?: {
        tag: {
            id: string;
            name: string;
            color: string;
        };
    }[];
    assignee?: {
        id: string;
        name: string | null;
        email: string;
    } | null;
    column?: {
        id: string;
        name: string;
        color: string;
    };
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
    author?: {
        id: string;
        name: string | null;
        email: string;
    };
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
    items?: {
        name: string;
        path: string;
        type: string;
        size: number | null;
        sha: string;
    }[];
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
