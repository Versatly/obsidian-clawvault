/**
 * Core sync orchestrator.
 */

import { App, Platform } from "obsidian";
import { SyncClient } from "./sync-client";
import { ResolvedConflictAction, SyncResolver } from "./sync-resolver";
import type {
	ManifestFileRecord,
	SyncConflict,
	SyncFileAction,
	SyncMode,
	SyncPlan,
	SyncProgress,
	SyncResult,
	SyncSettings,
	VaultManifest,
} from "./sync-types";

interface SyncExecutionOptions {
	mode: SyncMode;
	onProgress?: (progress: SyncProgress) => void;
}

interface LocalManifestCacheEntry {
	expiresAt: number;
	manifest: VaultManifest;
}

type VaultAdapter = App["vault"]["adapter"];
type AdapterWithBinary = VaultAdapter & {
	readBinary?: (normalizedPath: string) => Promise<ArrayBuffer>;
	writeBinary?: (normalizedPath: string, data: ArrayBuffer, options?: DataWriteOptions) => Promise<void>;
};

interface DataWriteOptions {
	ctime?: number;
	mtime?: number;
}

export class SyncEngine {
	private app: App;
	private client: SyncClient;
	private settings: SyncSettings;
	private resolver: SyncResolver;
	private localManifestCache: LocalManifestCacheEntry | null = null;
	private readonly localManifestCacheTtlMs = 10000;
	private excludeRegexCache = new Map<string, RegExp>();

	constructor(app: App, client: SyncClient, settings: SyncSettings) {
		this.app = app;
		this.client = client;
		this.settings = settings;
		this.resolver = new SyncResolver(Platform.isMobile);
	}

	updateSettings(settings: SyncSettings): void {
		this.settings = settings;
		this.localManifestCache = null;
		this.excludeRegexCache.clear();
	}

	async planSync(mode: SyncMode = "full", onProgress?: (progress: SyncProgress) => void): Promise<SyncPlan> {
		onProgress?.({
			stage: "planning",
			current: 0,
			total: 1,
			message: "Loading manifests...",
		});

		const [remoteManifest, localManifest] = await Promise.all([
			this.client.fetchManifest(),
			this.buildLocalManifest(),
		]);

		return this.diffManifests(localManifest, remoteManifest, mode);
	}

	async executeSync(
		plan: SyncPlan,
		options: SyncExecutionOptions
	): Promise<SyncResult> {
		const startedAt = Date.now();
		const result: SyncResult = {
			pulled: 0,
			pushed: 0,
			conflicts: 0,
			deleted: 0,
			unchanged: plan.unchanged.length,
			planned: plan,
			errors: [],
			startedAt,
			endedAt: startedAt,
		};

		if (options.mode !== "push") {
			await this.applyActions(
				plan.toPull,
				"pulling",
				(path) => this.pullFile(path),
				() => {
					result.pulled++;
				},
				result,
				options.onProgress
			);
		}

		if (options.mode !== "pull") {
			await this.applyActions(
				plan.toPush,
				"pushing",
				(path) => this.pushFile(path),
				() => {
					result.pushed++;
				},
				result,
				options.onProgress
			);
		}

		if (options.mode === "full" && plan.conflicts.length > 0) {
			for (let index = 0; index < plan.conflicts.length; index++) {
				const conflict = plan.conflicts[index];
				if (!conflict) continue;

				options.onProgress?.({
					stage: "conflicts",
					current: index + 1,
					total: plan.conflicts.length,
					path: conflict.path,
					message: `Resolving conflict ${index + 1}/${plan.conflicts.length}`,
				});

				try {
					await this.resolveConflict(conflict);
					result.conflicts++;
				} catch (error) {
					result.errors.push({
						path: conflict.path,
						message: error instanceof Error ? error.message : "Unknown conflict error",
					});
				}
			}
		}

		if (options.mode === "full" && plan.toDelete.length > 0) {
			await this.applyActions(
				plan.toDelete,
				"pushing",
				(path) => this.client.deleteFile(path),
				() => {
					result.deleted++;
				},
				result,
				options.onProgress
			);
		}

		result.endedAt = Date.now();
		this.localManifestCache = null;
		options.onProgress?.({
			stage: "complete",
			current: 1,
			total: 1,
			message: "Sync completed",
		});
		return result;
	}

	async sync(
		mode: SyncMode = "full",
		onProgress?: (progress: SyncProgress) => void
	): Promise<SyncResult> {
		const plan = await this.planSync(mode, onProgress);
		return this.executeSync(plan, { mode, onProgress });
	}

	async buildLocalManifest(): Promise<VaultManifest> {
		if (
			this.localManifestCache &&
			this.localManifestCache.expiresAt > Date.now()
		) {
			return this.localManifestCache.manifest;
		}

		const adapter = this.getAdapter();
		const files = await this.walkAllFiles(adapter);
		const records: ManifestFileRecord[] = [];
		for (const rawPath of files) {
			const path = this.normalizePath(rawPath);
			if (!path || this.isInternalPath(path)) continue;

			const category = this.getCategoryForPath(path);
			if (!this.shouldSyncPath(path, category)) continue;

			const stat = await adapter.stat(path);
			if (!stat) continue;

			const data = await this.readLocalBinary(path);
			const checksum = await this.sha256(data);
			records.push({
				path,
				size: stat.size,
				checksum,
				modified: new Date(stat.mtime).toISOString(),
				category: category || undefined,
			});
		}

		const manifest: VaultManifest = {
			generatedAt: new Date().toISOString(),
			files: records,
		};

		this.localManifestCache = {
			expiresAt: Date.now() + this.localManifestCacheTtlMs,
			manifest,
		};

		return manifest;
	}

	private diffManifests(
		localManifest: VaultManifest,
		remoteManifest: VaultManifest,
		mode: SyncMode
	): SyncPlan {
		const toPull: SyncFileAction[] = [];
		const toPush: SyncFileAction[] = [];
		const conflicts: SyncConflict[] = [];
		const unchanged: string[] = [];
		const toDelete: SyncFileAction[] = [];

		const localMap = this.toFileMap(
			localManifest.files.filter((entry) => this.shouldSyncPath(entry.path, entry.category))
		);
		const remoteMap = this.toFileMap(
			remoteManifest.files.filter((entry) => this.shouldSyncPath(entry.path, entry.category))
		);
		const allPaths = new Set<string>([
			...Array.from(localMap.keys()),
			...Array.from(remoteMap.keys()),
		]);

		for (const path of allPaths) {
			const local = localMap.get(path);
			const remote = remoteMap.get(path);

			if (!local && remote) {
				if (mode !== "push") {
					toPull.push({
						path,
						direction: "pull",
						reason: "new remote file",
						remoteModified: remote.modified,
						size: remote.size,
					});
				}
				continue;
			}

			if (local && !remote) {
				if (mode !== "pull") {
					toPush.push({
						path,
						direction: "push",
						reason: "new local file",
						localModified: this.toEpoch(local.modified),
						size: local.size,
					});
				}
				continue;
			}

			if (!local || !remote) {
				continue;
			}

			if (local.checksum === remote.checksum && local.checksum.length > 0) {
				unchanged.push(path);
				continue;
			}

			const localMtime = this.toEpoch(local.modified);
			const remoteMtime = this.toEpoch(remote.modified);
			const bothModifiedSinceLastSync =
				this.settings.lastSyncTimestamp > 0 &&
				localMtime > this.settings.lastSyncTimestamp &&
				remoteMtime > this.settings.lastSyncTimestamp;

			if (bothModifiedSinceLastSync && mode === "full") {
				conflicts.push({
					path,
					localModified: localMtime,
					remoteModified: remote.modified,
					localSize: local.size,
					remoteSize: remote.size,
				});
				continue;
			}

			if (remoteMtime > localMtime && mode !== "push") {
				toPull.push({
					path,
					direction: "pull",
					reason: "remote newer",
					localModified: localMtime,
					remoteModified: remote.modified,
					size: remote.size,
				});
				continue;
			}

			if (localMtime > remoteMtime && mode !== "pull") {
				toPush.push({
					path,
					direction: "push",
					reason: "local newer",
					localModified: localMtime,
					remoteModified: remote.modified,
					size: local.size,
				});
				continue;
			}

			if (mode === "full") {
				conflicts.push({
					path,
					localModified: localMtime,
					remoteModified: remote.modified,
					localSize: local.size,
					remoteSize: remote.size,
				});
			} else if (mode === "pull") {
				toPull.push({
					path,
					direction: "pull",
					reason: "checksum mismatch",
					localModified: localMtime,
					remoteModified: remote.modified,
					size: remote.size,
				});
			} else {
				toPush.push({
					path,
					direction: "push",
					reason: "checksum mismatch",
					localModified: localMtime,
					remoteModified: remote.modified,
					size: local.size,
				});
			}
		}

		return {
			toPull,
			toPush,
			conflicts,
			toDelete,
			unchanged,
		};
	}

	private async applyActions(
		actions: SyncFileAction[],
		stage: "pulling" | "pushing",
		handler: (path: string) => Promise<void>,
		onSuccess: () => void,
		result: SyncResult,
		onProgress?: (progress: SyncProgress) => void
	): Promise<void> {
		for (let index = 0; index < actions.length; index++) {
			const action = actions[index];
			if (!action) continue;
			onProgress?.({
				stage,
				current: index + 1,
				total: actions.length,
				path: action.path,
				message: `${stage === "pulling" ? "Pulling" : "Pushing"} ${index + 1}/${actions.length}`,
			});

			try {
				await handler(action.path);
				onSuccess();
			} catch (error) {
				result.errors.push({
					path: action.path,
					message: error instanceof Error ? error.message : "Unknown sync action error",
				});
			}
		}
	}

	private async resolveConflict(conflict: SyncConflict): Promise<void> {
		const resolution: ResolvedConflictAction = this.resolver.resolve(
			conflict,
			this.settings.conflictStrategy
		);

		if (resolution.preserveLocalCopy) {
			await this.renameLocalToConflictCopy(conflict.path);
		}

		if (resolution.action.direction === "pull") {
			await this.pullFile(conflict.path);
			return;
		}

		if (resolution.action.direction === "push") {
			await this.pushFile(conflict.path);
		}
	}

	private async pullFile(path: string): Promise<void> {
		const binary = await this.client.getFileBinary(path);
		await this.ensureLocalDirectory(path);
		await this.writeLocalBinary(path, binary);
	}

	private async pushFile(path: string): Promise<void> {
		const binary = await this.readLocalBinary(path);
		await this.client.putFileBinary(path, binary);
	}

	private async renameLocalToConflictCopy(path: string): Promise<void> {
		const adapter = this.getAdapter();
		if (!(await adapter.exists(path))) {
			return;
		}

		const renamedPath = await this.nextConflictPath(path);
		await this.ensureLocalDirectory(renamedPath);
		await adapter.rename(path, renamedPath);
	}

	private async nextConflictPath(path: string): Promise<string> {
		const adapter = this.getAdapter();
		const normalized = this.normalizePath(path);
		const slashIndex = normalized.lastIndexOf("/");
		const folder = slashIndex >= 0 ? normalized.slice(0, slashIndex) : "";
		const fileName = slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
		const extIndex = fileName.lastIndexOf(".");
		const stem = extIndex > 0 ? fileName.slice(0, extIndex) : fileName;
		const extension = extIndex > 0 ? fileName.slice(extIndex) : "";
		const date = new Date().toISOString().slice(0, 10);
		let candidate = `${stem}.conflict-${date}${extension}`;
		let absoluteCandidate = folder ? `${folder}/${candidate}` : candidate;
		let suffix = 1;

		while (await adapter.exists(absoluteCandidate)) {
			candidate = `${stem}.conflict-${date}-${suffix}${extension}`;
			absoluteCandidate = folder ? `${folder}/${candidate}` : candidate;
			suffix++;
		}

		return absoluteCandidate;
	}

	private async walkAllFiles(adapter: VaultAdapter): Promise<string[]> {
		const files: string[] = [];
		const queue: string[] = [""];

		while (queue.length > 0) {
			const current = queue.shift();
			if (typeof current === "undefined") {
				continue;
			}

			const { files: directFiles, folders } = await this.safeList(adapter, current);
			for (const file of directFiles) {
				files.push(this.normalizePath(file));
			}
			for (const folder of folders) {
				queue.push(this.normalizePath(folder));
			}
		}

		return files;
	}

	private async safeList(
		adapter: VaultAdapter,
		path: string
	): Promise<{ files: string[]; folders: string[] }> {
		try {
			return await adapter.list(path);
		} catch (error) {
			if (path === "") {
				return adapter.list("/");
			}
			throw error;
		}
	}

	private async ensureLocalDirectory(filePath: string): Promise<void> {
		const adapter = this.getAdapter();
		const segments = this.normalizePath(filePath).split("/");
		segments.pop();
		if (segments.length === 0) return;

		let current = "";
		for (const segment of segments) {
			if (!segment) continue;
			current = current ? `${current}/${segment}` : segment;
			if (!(await adapter.exists(current))) {
				await adapter.mkdir(current);
			}
		}
	}

	private async readLocalBinary(path: string): Promise<ArrayBuffer> {
		const adapter = this.getAdapter() as AdapterWithBinary;
		if (typeof adapter.readBinary === "function") {
			return adapter.readBinary(path);
		}

		const text = await adapter.read(path);
		return new TextEncoder().encode(text).buffer;
	}

	private async writeLocalBinary(path: string, data: ArrayBuffer): Promise<void> {
		const adapter = this.getAdapter() as AdapterWithBinary;
		if (typeof adapter.writeBinary === "function") {
			await adapter.writeBinary(path, data);
			return;
		}

		const text = new TextDecoder().decode(data);
		await adapter.write(path, text);
	}

	private async sha256(data: ArrayBuffer): Promise<string> {
		const digest = await crypto.subtle.digest("SHA-256", data);
		const bytes = new Uint8Array(digest);
		let hash = "";
		for (const byte of bytes) {
			hash += byte.toString(16).padStart(2, "0");
		}
		return hash;
	}

	private shouldSyncPath(path: string, categoryOverride?: string): boolean {
		const normalized = this.normalizePath(path);
		if (!normalized || this.isInternalPath(normalized)) {
			return false;
		}

		if (this.matchesExcludePatterns(normalized)) {
			return false;
		}

		const selectedCategories = this.settings.syncCategories;
		if (selectedCategories.length === 0) {
			return true;
		}

		const category = categoryOverride ?? this.getCategoryForPath(normalized);
		if (!category) {
			// Root-level files should continue syncing unless explicitly excluded.
			return true;
		}

		return selectedCategories.includes(category);
	}

	private matchesExcludePatterns(path: string): boolean {
		for (const rawPattern of this.settings.excludePatterns) {
			const pattern = rawPattern.trim();
			if (!pattern) continue;

			let regex = this.excludeRegexCache.get(pattern);
			if (!regex) {
				regex = this.compileGlobPattern(pattern);
				this.excludeRegexCache.set(pattern, regex);
			}

			if (regex.test(path)) {
				return true;
			}
		}
		return false;
	}

	private compileGlobPattern(pattern: string): RegExp {
		const normalized = this.normalizePath(pattern);
		let output = "^";
		for (let i = 0; i < normalized.length; i++) {
			const char = normalized[i];
			if (!char) continue;

			if (char === "*") {
				const next = normalized[i + 1];
				if (next === "*") {
					output += ".*";
					i++;
				} else {
					output += "[^/]*";
				}
				continue;
			}

			if (char === "?") {
				output += ".";
				continue;
			}

			if ("\\^$.+()[]{}|".includes(char)) {
				output += `\\${char}`;
			} else {
				output += char;
			}
		}
		output += "$";
		return new RegExp(output);
	}

	private getCategoryForPath(path: string): string {
		const normalized = this.normalizePath(path);
		const first = normalized.split("/")[0] ?? "";
		if (!first || first.startsWith(".")) {
			return "";
		}
		return first;
	}

	private isInternalPath(path: string): boolean {
		const normalized = this.normalizePath(path);
		return (
			normalized === ".obsidian" ||
			normalized === ".clawvault" ||
			normalized.startsWith(".obsidian/") ||
			normalized.startsWith(".clawvault/")
		);
	}

	private normalizePath(path: string): string {
		return path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/{2,}/g, "/");
	}

	private toFileMap(entries: ManifestFileRecord[]): Map<string, ManifestFileRecord> {
		const map = new Map<string, ManifestFileRecord>();
		for (const entry of entries) {
			map.set(this.normalizePath(entry.path), {
				...entry,
				path: this.normalizePath(entry.path),
			});
		}
		return map;
	}

	private toEpoch(value: string): number {
		const parsed = Date.parse(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}

	private getAdapter(): VaultAdapter {
		return this.app.vault.adapter;
	}
}

