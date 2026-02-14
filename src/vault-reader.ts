/**
 * ClawVault Vault Reader
 * Reads .clawvault.json, graph-index.json, and task files
 */

import { App, TFile, TFolder, parseYaml } from "obsidian";
import {
	CLAWVAULT_CONFIG_FILE,
	CLAWVAULT_GRAPH_INDEX,
	DEFAULT_FOLDERS,
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
	priority?: string;
	project?: string;
	owner?: string;
	blocked_by?: string | string[];
	due?: string;
	title?: string;
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
	 * Read and parse .clawvault.json
	 */
	async readConfig(): Promise<ClawVaultConfig | null> {
		if (this.cachedConfig && this.isCacheValid()) {
			return this.cachedConfig;
		}

		try {
			const file = this.app.vault.getAbstractFileByPath(CLAWVAULT_CONFIG_FILE);
			if (file instanceof TFile) {
				const content = await this.app.vault.read(file);
				this.cachedConfig = JSON.parse(content) as ClawVaultConfig;
				this.lastCacheTime = Date.now();
				return this.cachedConfig;
			}
		} catch (error) {
			console.warn("ClawVault: Could not read config file:", error);
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

		try {
			const file = this.app.vault.getAbstractFileByPath(CLAWVAULT_GRAPH_INDEX);
			if (file instanceof TFile) {
				const content = await this.app.vault.read(file);
				this.cachedGraphIndex = JSON.parse(content) as GraphIndex;
				this.lastCacheTime = Date.now();
				return this.cachedGraphIndex;
			}
		} catch (error) {
			console.warn("ClawVault: Could not read graph index:", error);
		}
		return null;
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

		const taskFiles = this.getFilesInFolder(DEFAULT_FOLDERS.TASKS);
		
		for (const file of taskFiles) {
			const frontmatter = await this.parseFrontmatter(file);
			stats.total++;
			
			if (frontmatter?.status) {
				switch (frontmatter.status) {
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
			} else {
				// Default to open if no status
				stats.open++;
			}
		}

		return stats;
	}

	/**
	 * Get all blocked tasks with their details
	 */
	async getBlockedTasks(): Promise<Array<{ file: TFile; frontmatter: TaskFrontmatter }>> {
		const blockedTasks: Array<{ file: TFile; frontmatter: TaskFrontmatter }> = [];
		const taskFiles = this.getFilesInFolder(DEFAULT_FOLDERS.TASKS);

		for (const file of taskFiles) {
			const frontmatter = await this.parseFrontmatter(file);
			if (frontmatter?.status === TASK_STATUS.BLOCKED) {
				blockedTasks.push({ file, frontmatter });
			}
		}

		return blockedTasks;
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
