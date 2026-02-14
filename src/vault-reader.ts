/**
 * ClawVault Vault Reader
 * Reads .clawvault.json and graph-index.json for vault health metrics
 */

import { App, TFile, TFolder } from "obsidian";
import { CLAWVAULT_CONFIG_FILE, CLAWVAULT_GRAPH_INDEX, DEFAULT_FOLDERS } from "./constants";

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

// Graph index structure (supports both flat and nested formats)
export interface GraphIndex {
	nodes: GraphNode[];
	edges: GraphEdge[];
}

interface RawGraphIndex {
	nodes?: GraphNode[];
	edges?: GraphEdge[];
	graph?: {
		nodes?: GraphNode[];
		edges?: GraphEdge[];
		stats?: Record<string, unknown>;
	};
}

// ClawVault config structure
export interface ClawVaultConfig {
	name?: string;
	categories?: string[];
	version?: string;
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
	inboxCount: number;
	lastObservation?: Date;
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
				const raw = JSON.parse(content) as RawGraphIndex;
				// Support both flat {nodes, edges} and nested {graph: {nodes, edges}}
				const nodes = raw.graph?.nodes ?? raw.nodes ?? [];
				const edges = raw.graph?.edges ?? raw.edges ?? [];
				this.cachedGraphIndex = { nodes, edges };
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
		if (!todayStr) {
			return { count: 0, categories: [] };
		}

		const seenPaths = new Set<string>();
		const categories = new Set<string>();
		const todayStart = new Date(todayStr).getTime();

		// Check ledger/observations for today's files
		const ledgerPath = "ledger/observations";
		try {
			const folder = this.app.vault.getAbstractFileByPath(ledgerPath);
			if (folder instanceof TFolder) {
				for (const child of folder.children) {
					if (child instanceof TFile && child.basename.startsWith(todayStr)) {
						seenPaths.add(child.path);
					}
				}
			}
		} catch {
			// Folder does not exist in every vault layout.
		}

		// Check observations folder for today's files
		const observationFiles = this.getFilesInFolder("observations");
		for (const file of observationFiles) {
			if (file.basename.startsWith(todayStr) || file.stat.mtime >= todayStart) {
				seenPaths.add(file.path);
				const parts = file.path.split("/");
				if (parts.length > 2 && parts[1]) {
					categories.add(parts[1]);
				} else if (parts[0]) {
					categories.add(parts[0]);
				}
			}
		}

		return { count: seenPaths.size, categories: Array.from(categories) };
	}

	/**
	 * Get graph stats summary by node type
	 */
	async getGraphTypeSummary(): Promise<Record<string, number>> {
		const graph = await this.readGraphIndex();
		if (!graph) {
			return {};
		}

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
		const collectFiles = (currentFolder: TFolder) => {
			for (const child of currentFolder.children) {
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
	 * Get complete vault statistics
	 */
	async getVaultStats(): Promise<VaultStats> {
		const config = await this.readConfig();
		const graphIndex = await this.readGraphIndex();
		const inboxFiles = this.getFilesInFolder(DEFAULT_FOLDERS.INBOX);
		const allFiles = this.app.vault.getMarkdownFiles();

		let lastObservation: Date | undefined;
		const observationFiles = this.getFilesInFolder("observations")
			.sort((a, b) => b.stat.mtime - a.stat.mtime);
		if (observationFiles[0]) {
			lastObservation = new Date(observationFiles[0].stat.mtime);
		}

		return {
			vaultName: config?.name ?? this.app.vault.getName(),
			fileCount: allFiles.length,
			nodeCount: graphIndex?.nodes.length ?? 0,
			edgeCount: graphIndex?.edges.length ?? 0,
			inboxCount: inboxFiles.length,
			lastObservation,
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
}
