/**
 * ClawVault Vault Reader
 * Reads .clawvault.json, graph-index.json, and task files
 */

import { App, TFile, TFolder, parseYaml } from "obsidian";
import {
	CLAWVAULT_CONFIG_FILE,
	CLAWVAULT_GRAPH_INDEX,
	DEFAULT_FOLDERS,
	TaskPriority,
	TaskStatus,
	TASK_STATUS,
} from "./constants";

// Graph node structure from graph-index.json
export interface GraphNode {
	id: string;
	label: string;
	type?: string;
	category?: string;
}

// Graph edge structure from graph-index.json
export interface GraphEdge {
	source: string;
	target: string;
	type?: string;
}

// Graph index structure
export interface GraphIndex {
	nodes: GraphNode[];
	edges: GraphEdge[];
}

// ClawVault config structure
export interface ClawVaultConfig {
	name?: string;
	categories?: string[];
	version?: string;
}

// Task frontmatter structure
export interface TaskFrontmatter {
	status?: TaskStatus;
	priority?: TaskPriority | string;
	project?: string;
	owner?: string;
	blocked_by?: string | string[];
	due?: string;
	title?: string;
	tags?: string[] | string;
	created?: string;
	completed?: string | null;
	source?: string;
}

export interface ParsedTask {
	file: TFile;
	frontmatter: TaskFrontmatter;
	status: TaskStatus;
	createdAt: Date | null;
}

export interface ObservationSession {
	file: TFile;
	timestamp: Date;
}

// Vault statistics
export interface VaultStats {
	vaultName: string;
	fileCount: number;
	nodeCount: number;
	edgeCount: number;
	tasks: {
		active: number;
		open: number;
		blocked: number;
		completed: number;
		total: number;
	};
	inboxCount: number;
	lastObservation?: Date;
	lastReflection?: string;
	categories: string[];
}

/**
 * Reads and parses ClawVault vault data
 */
export class VaultReader {
	private app: App;
	private cachedConfig: ClawVaultConfig | null = null;
	private cachedGraphIndex: GraphIndex | null = null;
	private lastCacheTime = 0;
	private cacheTimeout = 5000; // 5 second cache

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Clear the cache to force fresh reads
	 */
	clearCache(): void {
		this.cachedConfig = null;
		this.cachedGraphIndex = null;
		this.lastCacheTime = 0;
	}

	/**
	 * Check if cache is still valid
	 */
	private isCacheValid(): boolean {
		return Date.now() - this.lastCacheTime < this.cacheTimeout;
	}

	/**
	 * Read a file using the adapter (bypasses Obsidian's dotfile filter)
	 */
	private async readFileByAdapter(path: string): Promise<string | null> {
		try {
			if (await this.app.vault.adapter.exists(path)) {
				return await this.app.vault.adapter.read(path);
			}
		} catch (error) {
			console.warn(`ClawVault: Could not read ${path}:`, error);
		}
		return null;
	}

	/**
	 * Read and parse .clawvault.json
	 */
	async readConfig(): Promise<ClawVaultConfig | null> {
		if (this.cachedConfig && this.isCacheValid()) {
			return this.cachedConfig;
		}

		const content = await this.readFileByAdapter(CLAWVAULT_CONFIG_FILE);
		if (content) {
			try {
				this.cachedConfig = JSON.parse(content) as ClawVaultConfig;
				this.lastCacheTime = Date.now();
				return this.cachedConfig;
			} catch (error) {
				console.warn("ClawVault: Could not parse config:", error);
			}
		}
		return null;
	}

	/**
	 * Read and parse .clawvault/graph-index.json
	 */
	async readGraphIndex(): Promise<GraphIndex | null> {
		if (this.cachedGraphIndex && this.isCacheValid()) {
			return this.cachedGraphIndex;
		}

		const content = await this.readFileByAdapter(CLAWVAULT_GRAPH_INDEX);
		if (content) {
			try {
				this.cachedGraphIndex = JSON.parse(content) as GraphIndex;
				this.lastCacheTime = Date.now();
				return this.cachedGraphIndex;
			} catch (error) {
				console.warn("ClawVault: Could not parse graph index:", error);
			}
		}
		return null;
	}

	/**
	 * Read today's observation files
	 */
	async getTodayObservations(): Promise<{ count: number; categories: string[] }> {
		const todayStr = new Date().toISOString().split("T")[0] ?? "";
		if (!todayStr) return { count: 0, categories: [] };

		const categories = new Set<string>();
		let count = 0;
		const todayStart = new Date(todayStr).getTime();

		// Check ledger/observations for today's files
		const ledgerPath = "ledger/observations";
		try {
			const folder = this.app.vault.getAbstractFileByPath(ledgerPath);
			if (folder instanceof TFolder) {
				for (const child of folder.children) {
					if (child instanceof TFile && child.basename.startsWith(todayStr)) {
						count++;
					}
				}
			}
		} catch { /* no ledger dir */ }

		// Check observations folder for today's files
		const obsFiles = this.getFilesInFolder("observations");
		for (const f of obsFiles) {
			if (f.basename.startsWith(todayStr) || f.stat.mtime >= todayStart) {
				count++;
				const parts = f.path.split("/");
				if (parts.length > 2 && parts[1]) categories.add(parts[1]);
			}
		}

		return { count, categories: Array.from(categories) };
	}

	/**
	 * Get graph stats summary by node type
	 */
	async getGraphTypeSummary(): Promise<Record<string, number>> {
		const graph = await this.readGraphIndex();
		if (!graph) return {};

		const typeCounts: Record<string, number> = {};
		for (const node of graph.nodes) {
			const type = node.type ?? "unknown";
			typeCounts[type] = (typeCounts[type] ?? 0) + 1;
		}
		return typeCounts;
	}

	/**
	 * Get all markdown files in a folder
	 */
	getFilesInFolder(folderPath: string): TFile[] {
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!(folder instanceof TFolder)) {
			return [];
		}

		const files: TFile[] = [];
		const collectFiles = (folder: TFolder) => {
			for (const child of folder.children) {
				if (child instanceof TFile && child.extension === "md") {
					files.push(child);
				} else if (child instanceof TFolder) {
					collectFiles(child);
				}
			}
		};

		collectFiles(folder);
		return files;
	}

	/**
	 * Parse frontmatter from a file
	 */
	async parseFrontmatter(file: TFile): Promise<TaskFrontmatter | null> {
		try {
			const content = await this.app.vault.read(file);
			const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
			if (frontmatterMatch?.[1]) {
				return parseYaml(frontmatterMatch[1]) as TaskFrontmatter;
			}
		} catch (error) {
			console.warn(`ClawVault: Could not parse frontmatter for ${file.path}:`, error);
		}
		return null;
	}

	/**
	 * Parse a frontmatter date field into a Date value
	 */
	private parseDate(value: unknown): Date | null {
		if (value instanceof Date) {
			return Number.isNaN(value.getTime()) ? null : value;
		}
		if (typeof value === "number") {
			const date = new Date(value);
			return Number.isNaN(date.getTime()) ? null : date;
		}
		if (typeof value === "string" && value.trim().length > 0) {
			const date = new Date(value);
			return Number.isNaN(date.getTime()) ? null : date;
		}
		return null;
	}

	/**
	 * Get all tasks from the tasks folder
	 */
	async getAllTasks(): Promise<ParsedTask[]> {
		const taskFiles = this.getFilesInFolder(DEFAULT_FOLDERS.TASKS);
		const tasks: ParsedTask[] = [];

		for (const file of taskFiles) {
			const frontmatter = (await this.parseFrontmatter(file)) ?? {};
			const status = frontmatter.status ?? TASK_STATUS.OPEN;
			const createdAt = this.parseDate(frontmatter.created) ?? new Date(file.stat.ctime);
			tasks.push({
				file,
				frontmatter,
				status,
				createdAt,
			});
		}

		return tasks;
	}

	/**
	 * Get task statistics from task files
	 */
	async getTaskStats(): Promise<VaultStats["tasks"]> {
		const stats = {
			active: 0,
			open: 0,
			blocked: 0,
			completed: 0,
			total: 0,
		};

		const tasks = await this.getAllTasks();

		for (const task of tasks) {
			stats.total++;

			switch (task.status) {
				case TASK_STATUS.IN_PROGRESS:
					stats.active++;
					break;
				case TASK_STATUS.OPEN:
					stats.open++;
					break;
				case TASK_STATUS.BLOCKED:
					stats.blocked++;
					break;
				case TASK_STATUS.DONE:
					stats.completed++;
					break;
			}
		}

		return stats;
	}

	/**
	 * Get all blocked tasks with their details
	 */
	async getBlockedTasks(): Promise<Array<{ file: TFile; frontmatter: TaskFrontmatter }>> {
		const blockedTasks: Array<{ file: TFile; frontmatter: TaskFrontmatter }> = [];

		for (const task of await this.getAllTasks()) {
			if (task.status === TASK_STATUS.BLOCKED) {
				blockedTasks.push({ file: task.file, frontmatter: task.frontmatter });
			}
		}

		return blockedTasks;
	}

	/**
	 * Get backlog tasks (open status), newest first
	 */
	async getBacklogTasks(limit = 5): Promise<ParsedTask[]> {
		const openTasks = (await this.getAllTasks())
			.filter((task) => task.status === TASK_STATUS.OPEN)
			.sort((a, b) => b.file.stat.mtime - a.file.stat.mtime);

		return openTasks.slice(0, limit);
	}

	/**
	 * Get open loops: non-completed tasks older than a threshold
	 */
	async getOpenLoops(daysOpen = 7): Promise<ParsedTask[]> {
		const ageThreshold = Date.now() - daysOpen * 24 * 60 * 60 * 1000;
		const tasks = await this.getAllTasks();
		return tasks
			.filter((task) => {
				if (task.status === TASK_STATUS.DONE) {
					return false;
				}
				const createdAt = task.createdAt ?? new Date(task.file.stat.ctime);
				return createdAt.getTime() < ageThreshold;
			})
			.sort((a, b) => {
				const aTime = a.createdAt?.getTime() ?? a.file.stat.ctime;
				const bTime = b.createdAt?.getTime() ?? b.file.stat.ctime;
				return aTime - bTime;
			});
	}

	/**
	 * Get recent observation sessions by file modified time
	 */
	async getRecentObservationSessions(limit = 5): Promise<ObservationSession[]> {
		const observationFiles = this.getFilesInFolder("observations")
			.sort((a, b) => b.stat.mtime - a.stat.mtime)
			.slice(0, limit);

		return observationFiles.map((file) => ({
			file,
			timestamp: new Date(file.stat.mtime),
		}));
	}

	/**
	 * Get recent decisions updated within a date window
	 */
	getRecentDecisionFiles(days = 7, limit = 10): TFile[] {
		const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
		return this.getFilesInFolder("decisions")
			.filter((file) => file.stat.mtime >= cutoff)
			.sort((a, b) => b.stat.mtime - a.stat.mtime)
			.slice(0, limit);
	}

	/**
	 * Get complete vault statistics
	 */
	async getVaultStats(): Promise<VaultStats> {
		const config = await this.readConfig();
		const graphIndex = await this.readGraphIndex();
		const taskStats = await this.getTaskStats();
		const inboxFiles = this.getFilesInFolder(DEFAULT_FOLDERS.INBOX);
		const allFiles = this.app.vault.getMarkdownFiles();

		// Try to find last observation and reflection
		let lastObservation: Date | undefined;
		let lastReflection: string | undefined;

		// Look for observations folder
		const observationFiles = this.getFilesInFolder("observations");
		if (observationFiles.length > 0) {
			const sorted = observationFiles.sort((a, b) => b.stat.mtime - a.stat.mtime);
			if (sorted[0]) {
				lastObservation = new Date(sorted[0].stat.mtime);
			}
		}

		// Look for reflections folder
		const reflectionFiles = this.getFilesInFolder("reflections");
		if (reflectionFiles.length > 0) {
			const sorted = reflectionFiles.sort((a, b) => b.stat.mtime - a.stat.mtime);
			if (sorted[0]) {
				// Extract week number from filename if possible
				const weekMatch = sorted[0].basename.match(/week[_-]?(\d+)/i);
				lastReflection = weekMatch ? `Week ${weekMatch[1]}` : sorted[0].basename;
			}
		}

		return {
			vaultName: config?.name ?? this.app.vault.getName(),
			fileCount: allFiles.length,
			nodeCount: graphIndex?.nodes.length ?? 0,
			edgeCount: graphIndex?.edges.length ?? 0,
			tasks: taskStats,
			inboxCount: inboxFiles.length,
			lastObservation,
			lastReflection,
			categories: config?.categories ?? [],
		};
	}

	/**
	 * Get the vault name
	 */
	async getVaultName(): Promise<string> {
		const config = await this.readConfig();
		return config?.name ?? this.app.vault.getName();
	}

	/**
	 * Check if a file is in a specific folder
	 */
	isFileInFolder(file: TFile, folderPath: string): boolean {
		return file.path.startsWith(folderPath + "/") || file.parent?.path === folderPath;
	}

	/**
	 * Get task status for a file
	 */
	async getTaskStatus(file: TFile): Promise<TaskStatus | null> {
		if (!this.isFileInFolder(file, DEFAULT_FOLDERS.TASKS)) {
			return null;
		}
		const frontmatter = await this.parseFrontmatter(file);
		return frontmatter?.status ?? TASK_STATUS.OPEN;
	}
}
