/**
 * Shared sync types for the ClawVault plugin.
 */

export type ConflictStrategy =
	| "remote-wins"
	| "local-wins"
	| "newest-wins"
	| "keep-both"
	| "ask";

export type SyncMode = "full" | "pull" | "push";

export interface SyncStatsSummary {
	pulled: number;
	pushed: number;
	conflicts: number;
}

export interface SyncSettings {
	// Connection
	serverUrl: string;
	authUsername: string;
	authPassword: string;

	// Behavior
	autoSyncEnabled: boolean;
	autoSyncInterval: number; // Minutes
	syncOnOpen: boolean;
	syncOnClose: boolean;

	// Filtering
	syncCategories: string[]; // Empty = all categories
	excludePatterns: string[];

	// Conflict resolution
	conflictStrategy: ConflictStrategy;

	// State
	lastSyncTimestamp: number;
	lastSyncStats: SyncStatsSummary | null;
}

export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
	serverUrl: "",
	authUsername: "",
	authPassword: "",
	autoSyncEnabled: false,
	autoSyncInterval: 15,
	syncOnOpen: true,
	syncOnClose: false,
	syncCategories: [],
	excludePatterns: [],
	conflictStrategy: "newest-wins",
	lastSyncTimestamp: 0,
	lastSyncStats: null,
};

export interface ManifestFileRecord {
	path: string;
	size: number;
	checksum: string;
	modified: string;
	category?: string;
}

export interface VaultManifest {
	generatedAt: string;
	files: ManifestFileRecord[];
}

export interface SyncFileAction {
	path: string;
	direction: "pull" | "push" | "delete";
	reason: string;
	localModified?: number;
	remoteModified?: string;
	size?: number;
}

export interface SyncConflict {
	path: string;
	localModified: number;
	remoteModified: string;
	localSize: number;
	remoteSize: number;
}

export interface SyncPlan {
	toPull: SyncFileAction[];
	toPush: SyncFileAction[];
	conflicts: SyncConflict[];
	toDelete: SyncFileAction[];
	unchanged: string[];
}

export interface SyncProgress {
	stage: "planning" | "pulling" | "pushing" | "conflicts" | "complete";
	current: number;
	total: number;
	path?: string;
	message?: string;
}

export interface SyncError {
	path?: string;
	message: string;
}

export interface SyncResult {
	pulled: number;
	pushed: number;
	conflicts: number;
	deleted: number;
	unchanged: number;
	planned: SyncPlan;
	errors: SyncError[];
	startedAt: number;
	endedAt: number;
}

export interface SyncRuntimeState {
	status: "disconnected" | "idle" | "syncing" | "error";
	serverUrl: string;
	message: string;
	lastSyncTimestamp: number;
	lastSyncStats: SyncStatsSummary | null;
	progress: SyncProgress | null;
}

