/**
 * ClawVault Plugin Constants
 * Default colors, view type IDs, and configuration values
 */

// View type identifier for the status panel
export const STATUS_VIEW_TYPE = "clawvault-status-view";

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

// Default refresh interval in milliseconds (60 seconds)
export const DEFAULT_REFRESH_INTERVAL = 60000;

// ClawVault file paths
export const CLAWVAULT_CONFIG_FILE = ".clawvault.json";
export const CLAWVAULT_GRAPH_INDEX = ".clawvault/graph-index.json";

// Default folders
export const DEFAULT_FOLDERS = {
	INBOX: "inbox",
} as const;

// Command IDs
export const COMMAND_IDS = {
	QUICK_CAPTURE: "clawvault-quick-capture",
	OPEN_STATUS_PANEL: "clawvault-open-status-panel",
	OPEN_KANBAN_BOARD: "clawvault-open-kanban",
	REFRESH_STATS: "clawvault-refresh-stats",
	SETUP_GRAPH_COLORS: "clawvault-setup-graph-colors",
} as const;

export const CANVAS_TEMPLATE_IDS = {
	PROJECT_BOARD: "project-board",
	BRAIN_OVERVIEW: "brain-overview",
	SPRINT_DASHBOARD: "sprint-dashboard",
} as const;

export type CanvasTemplateId =
	typeof CANVAS_TEMPLATE_IDS[keyof typeof CANVAS_TEMPLATE_IDS];
