/**
 * ClawVault Plugin Constants
 * Default colors, view type IDs, and configuration values
 */

// View type identifier for the status panel
export const STATUS_VIEW_TYPE = "clawvault-status-view";
export const TASK_BOARD_VIEW_TYPE = "clawvault-task-board";

// Default category colors for graph nodes
export const DEFAULT_CATEGORY_COLORS: Record<string, string> = {
	tasks: "#e8a430",      // gold/orange
	decisions: "#e85d4a",  // red
	people: "#4a90e8",     // blue
	projects: "#4ae85d",   // green
	lessons: "#9b59b6",    // purple
	blocked: "#e74c3c",    // bright red
	backlog: "#95a5a6",    // gray
	inbox: "#f39c12",      // amber
	default: "#7f8c8d",    // default gray
};

// Task status values
export const TASK_STATUS = {
	OPEN: "open",
	IN_PROGRESS: "in-progress",
	BLOCKED: "blocked",
	DONE: "done",
} as const;

export type TaskStatus = typeof TASK_STATUS[keyof typeof TASK_STATUS];

// Task priority values
export const TASK_PRIORITY = {
	CRITICAL: "critical",
	HIGH: "high",
	MEDIUM: "medium",
	LOW: "low",
} as const;

export type TaskPriority = typeof TASK_PRIORITY[keyof typeof TASK_PRIORITY];

// Status icons for display
export const STATUS_ICONS: Record<TaskStatus, string> = {
	[TASK_STATUS.OPEN]: "○",
	[TASK_STATUS.IN_PROGRESS]: "●",
	[TASK_STATUS.BLOCKED]: "⊘",
	[TASK_STATUS.DONE]: "✓",
};

// Default refresh interval in milliseconds (60 seconds)
export const DEFAULT_REFRESH_INTERVAL = 60000;

// ClawVault file paths
export const CLAWVAULT_CONFIG_FILE = ".clawvault.json";
export const CLAWVAULT_GRAPH_INDEX = ".clawvault/graph-index.json";

// Default folders
export const DEFAULT_FOLDERS = {
	INBOX: "inbox",
	TASKS: "tasks",
	BACKLOG: "backlog",
} as const;

// Command IDs
export const COMMAND_IDS = {
	GENERATE_DASHBOARD: "clawvault-generate-dashboard",
	QUICK_CAPTURE: "clawvault-quick-capture",
	ADD_TASK: "clawvault-add-task",
	VIEW_BLOCKED: "clawvault-view-blocked",
	OPEN_STATUS_PANEL: "clawvault-open-status-panel",
	OPEN_TASK_BOARD: "clawvault-open-task-board",
	GENERATE_CANVAS_FROM_TEMPLATE: "clawvault-generate-canvas-from-template",
	REFRESH_STATS: "clawvault-refresh-stats",
	SHOW_OPEN_LOOPS: "clawvault-show-open-loops",
} as const;

export const CANVAS_TEMPLATE_IDS = {
	PROJECT_BOARD: "project-board",
	BRAIN_OVERVIEW: "brain-overview",
	SPRINT_DASHBOARD: "sprint-dashboard",
} as const;

export type CanvasTemplateId =
	typeof CANVAS_TEMPLATE_IDS[keyof typeof CANVAS_TEMPLATE_IDS];
