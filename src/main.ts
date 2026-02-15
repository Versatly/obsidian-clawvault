/**
 * ClawVault Obsidian Plugin
 * Visual memory management for ClawVault vaults
 */

import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { ClawVaultSettings, ClawVaultSettingTab, DEFAULT_SETTINGS } from "./settings";
import { VaultReader } from "./vault-reader";
import { ClawVaultStatusView } from "./status-view";
// Task board view removed — Kanban plugin handles task visualization
import { FileDecorations } from "./decorations";
import { GraphEnhancer } from "./graph-enhancer";
import { registerCommands } from "./commands";
import {
	DEFAULT_CATEGORY_COLORS,
	MIN_SYNC_INTERVAL_MINUTES,
	STATUS_VIEW_TYPE,
	// TASK_BOARD_VIEW_TYPE removed — using Kanban plugin
} from "./constants";
import { SyncClient } from "./sync/sync-client";
import { SyncEngine } from "./sync/sync-engine";
import {
	DEFAULT_SYNC_SETTINGS,
	type SyncMode,
	type SyncResult,
	type SyncRuntimeState,
} from "./sync/sync-types";

export default class ClawVaultPlugin extends Plugin {
	settings: ClawVaultSettings = DEFAULT_SETTINGS;
	vaultReader: VaultReader = null!;
	
	private statusBarItem: HTMLElement | null = null;
	private refreshIntervalId: number | null = null;
	private syncIntervalId: number | null = null;
	private fileDecorations: FileDecorations | null = null;
	private graphEnhancer: GraphEnhancer | null = null;
	private settingTab: ClawVaultSettingTab | null = null;
	private syncClient: SyncClient | null = null;
	private syncEngine: SyncEngine | null = null;
	private syncState: SyncRuntimeState = {
		status: "disconnected",
		serverUrl: "",
		message: "Sync server not configured",
		lastSyncTimestamp: 0,
		lastSyncStats: null,
		progress: null,
	};

	async onload(): Promise<void> {
		await this.loadSettings();

		// Initialize vault reader
		this.vaultReader = new VaultReader(this.app);

		// Register the status view
		this.registerView(STATUS_VIEW_TYPE, (leaf: WorkspaceLeaf) => {
			return new ClawVaultStatusView(leaf, this);
		});

		// Task board view removed — Kanban plugin is the task UI

		// Add ribbon icon
		this.addRibbonIcon("database", "ClawVault status", () => {
			void this.activateStatusView();
		});
		this.addRibbonIcon("refresh-cw", "ClawVault sync now", () => {
			void this.syncNow("full");
		});

		// Add status bar item
		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.addClass("clawvault-status-bar");
		this.statusBarItem.addEventListener("click", () => {
			void this.activateStatusView();
		});
		this.updateStatusBarVisibility();

		// Register commands
		registerCommands(this);

		// Add settings tab
		this.settingTab = new ClawVaultSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		// Initialize file decorations
		this.fileDecorations = new FileDecorations(this);
		this.fileDecorations.initialize();

		// Initialize graph enhancements
		this.graphEnhancer = new GraphEnhancer(this);
		this.graphEnhancer.initialize();

		// Initialize sync modules
		this.reconfigureSync();

		// Start refresh interval
		this.startRefreshInterval();

		// Initial status bar update
		void this.updateStatusBar();

		// Auto-setup graph colors on first install
		if (!this.settings.graphColorsConfigured) {
			this.app.workspace.onLayoutReady(() => {
				void this.autoSetupGraphColors();
			});
		}

		// Optional sync on open
		this.app.workspace.onLayoutReady(() => {
			if (this.settings.sync.syncOnOpen && this.settings.sync.serverUrl.trim().length > 0) {
				void this.syncNow("full", true);
			}
		});
	}

	/**
	 * Auto-configure graph colors on first plugin install
	 */
	private async autoSetupGraphColors(): Promise<void> {
		try {
			// Trigger the setup command programmatically
			(this.app as unknown as { commands: { executeCommandById: (id: string) => void } })
				.commands.executeCommandById("clawvault-setup-graph-colors");
			
			// Mark as configured so we don't repeat
			this.settings.graphColorsConfigured = true;
			await this.saveSettings();
		} catch {
			// Silently fail — user can run manually
		}
	}

	onunload(): void {
		if (this.settings.sync.syncOnClose) {
			void this.syncNow("full", true);
		}

		// Clean up refresh interval
		if (this.refreshIntervalId !== null) {
			window.clearInterval(this.refreshIntervalId);
			this.refreshIntervalId = null;
		}

		// Clean up sync interval
		if (this.syncIntervalId !== null) {
			window.clearInterval(this.syncIntervalId);
			this.syncIntervalId = null;
		}

		// Clean up file decorations
		if (this.fileDecorations) {
			this.fileDecorations.cleanup();
			this.fileDecorations = null;
		}

		// Clean up graph enhancements
		if (this.graphEnhancer) {
			this.graphEnhancer.cleanup();
			this.graphEnhancer = null;
		}
		this.settingTab = null;

		// Note: Don't detach leaves in onunload per Obsidian guidelines
		// The view will be properly cleaned up by Obsidian
	}

	async loadSettings(): Promise<void> {
		const data = await this.loadData() as Partial<ClawVaultSettings> | null;
		const syncSettings = Object.assign({}, DEFAULT_SYNC_SETTINGS, data?.sync ?? {});
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data, {
			sync: syncSettings,
		});
		
		// Merge category colors with defaults
		this.settings.categoryColors = Object.assign(
			{},
			DEFAULT_CATEGORY_COLORS,
			this.settings.categoryColors
		);

		// Guard interval bounds and stale sync values
		this.settings.sync.autoSyncInterval = Math.max(
			MIN_SYNC_INTERVAL_MINUTES,
			this.settings.sync.autoSyncInterval
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Activate the status view in the right sidebar
	 */
	async activateStatusView(): Promise<void> {
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(STATUS_VIEW_TYPE)[0];

		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({
					type: STATUS_VIEW_TYPE,
					active: true,
				});
				leaf = rightLeaf;
			}
		}

		if (leaf) {
			await workspace.revealLeaf(leaf);
		}
	}

	// Task board view removed — use Kanban plugin + Board.md

	/**
	 * Update status bar visibility based on settings
	 */
	updateStatusBarVisibility(): void {
		if (this.statusBarItem) {
			if (this.settings.showStatusBar) {
				this.statusBarItem.show();
			} else {
				this.statusBarItem.hide();
			}
		}
	}

	/**
	 * Update status bar content
	 */
	async updateStatusBar(): Promise<void> {
		if (!this.statusBarItem || !this.settings.showStatusBar) return;

		try {
			const stats = await this.vaultReader.getVaultStats();
			const activeTaskCount = stats.tasks.active + stats.tasks.open;
			const syncSuffix = this.formatSyncStatusBarSuffix();
			this.statusBarItem.setText(
				`🐘 ${stats.nodeCount.toLocaleString()} nodes · ${activeTaskCount} tasks${syncSuffix}`
			);
		} catch {
			this.statusBarItem.setText("🐘 ClawVault");
		}
	}

	/**
	 * Start the auto-refresh interval
	 */
	startRefreshInterval(): void {
		if (this.refreshIntervalId !== null) {
			window.clearInterval(this.refreshIntervalId);
		}

		this.refreshIntervalId = window.setInterval(() => {
			void this.refreshAll();
		}, this.settings.refreshInterval);

		// Register for cleanup
		this.registerInterval(this.refreshIntervalId);
	}

	/**
	 * Restart the refresh interval (called when settings change)
	 */
	restartRefreshInterval(): void {
		this.startRefreshInterval();
	}

	reconfigureSync(): void {
		const serverUrl = this.settings.sync.serverUrl.trim();
		const authEnabled =
			this.settings.sync.authUsername.trim().length > 0 ||
			this.settings.sync.authPassword.length > 0;

		if (!serverUrl) {
			this.syncClient = null;
			this.syncEngine = null;
			this.stopSyncInterval();
			this.setSyncState({
				status: "disconnected",
				serverUrl: "",
				message: "Sync server not configured",
				progress: null,
			});
			return;
		}

		const clientConfig = {
			serverUrl,
			auth: authEnabled
				? {
						username: this.settings.sync.authUsername,
						password: this.settings.sync.authPassword,
				  }
				: undefined,
			timeout: 30000,
		};

		if (!this.syncClient) {
			this.syncClient = new SyncClient(clientConfig);
		} else {
			this.syncClient.updateConfig(clientConfig);
		}

		if (!this.syncEngine) {
			this.syncEngine = new SyncEngine(this.app, this.syncClient, this.settings.sync);
		} else {
			this.syncEngine.updateSettings(this.settings.sync);
		}

		this.setSyncState({
			status: "idle",
			serverUrl,
			message: "Ready",
			progress: null,
		});
		this.configureSyncInterval();
	}

	getSyncState(): SyncRuntimeState {
		return {
			...this.syncState,
			serverUrl: this.settings.sync.serverUrl,
			lastSyncTimestamp: this.settings.sync.lastSyncTimestamp,
			lastSyncStats: this.settings.sync.lastSyncStats,
		};
	}

	async syncNow(mode: SyncMode = "full", silent = false): Promise<SyncResult | null> {
		if (!this.syncEngine || !this.syncClient) {
			if (!silent) {
				new Notice("ClawVault sync: configure a server URL first.");
			}
			this.setSyncState({
				status: "disconnected",
				message: "Sync server not configured",
				progress: null,
			});
			return null;
		}

		if (this.syncState.status === "syncing") {
			if (!silent) {
				new Notice("ClawVault sync is already running.");
			}
			return null;
		}

		this.setSyncState({
			status: "syncing",
			message: "Sync in progress",
			progress: {
				stage: "planning",
				current: 0,
				total: 1,
				message: "Planning sync...",
			},
		});

		try {
			const result = await this.syncEngine.sync(mode, (progress) => {
				this.setSyncState({
					status: "syncing",
					message: progress.message ?? "Sync in progress",
					progress,
				});
			});

			this.settings.sync.lastSyncTimestamp = result.endedAt;
			this.settings.sync.lastSyncStats = {
				pulled: result.pulled,
				pushed: result.pushed,
				conflicts: result.conflicts,
			};
			await this.saveSettings();

			const errorMessage =
				result.errors.length > 0
					? `Completed with ${result.errors.length} error${result.errors.length === 1 ? "" : "s"}`
					: "Synced successfully";
			this.setSyncState({
				status: "idle",
				message: errorMessage,
				progress: null,
			});

			if (!silent) {
				new Notice(
					`ClawVault sync: ↓ ${result.pulled}, ↑ ${result.pushed}, ⚡ ${result.conflicts}`
				);
			}

			if (result.pulled > 0 || result.pushed > 0) {
				await this.refreshAll();
			} else {
				await this.refreshStatusViews();
			}

			return result;
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown sync error";
			this.setSyncState({
				status: "error",
				message,
				progress: null,
			});
			if (!silent) {
				new Notice(`ClawVault sync failed: ${message}`);
			}
			return null;
		}
	}

	async testSyncConnection(): Promise<boolean> {
		if (!this.settings.sync.serverUrl.trim()) {
			new Notice("ClawVault sync: set a server URL first.");
			return false;
		}

		this.reconfigureSync();
		if (!this.syncClient) {
			new Notice("ClawVault sync: failed to configure sync client.");
			return false;
		}

		try {
			const health = await this.syncClient.healthCheck();
			this.setSyncState({
				status: "idle",
				message: `Connected (${health.status})`,
				progress: null,
			});
			new Notice(`ClawVault sync connected to vault: ${health.vault}`);
			return true;
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown connection error";
			this.setSyncState({
				status: "error",
				message,
				progress: null,
			});
			new Notice(`ClawVault sync connection failed: ${message}`);
			return false;
		}
	}

	openPluginSettings(): void {
		const settingApi = (
			this.app as typeof this.app & {
				setting?: {
					open: () => void;
					openTabById: (id: string) => void;
				};
			}
		).setting;
		settingApi?.open();
		settingApi?.openTabById(this.manifest.id);
		window.setTimeout(() => {
			this.settingTab?.focusSyncSection();
		}, 50);
	}

	async focusSyncStatusSection(): Promise<void> {
		await this.activateStatusView();
		const leaves = this.app.workspace.getLeavesOfType(STATUS_VIEW_TYPE);
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof ClawVaultStatusView) {
				view.focusSyncSection();
			}
		}
	}

	/**
	 * Refresh all plugin data
	 */
	async refreshAll(): Promise<void> {
		// Clear vault reader cache
		this.vaultReader.clearCache();

		// Update status bar
		await this.updateStatusBar();

		// Refresh status view if open
		await this.refreshStatusViews();

		// Task board removed — Kanban plugin handles task visualization

		// Update file decorations
		if (this.fileDecorations) {
			await this.fileDecorations.decorateAllFiles();
		}

		// Update graph enhancements
		this.graphEnhancer?.scheduleEnhance();
	}

	/**
	 * Update graph styles (called when settings change)
	 * Note: Graph coloring is handled via styles.css with CSS custom properties
	 */
	updateGraphStyles(): void {
		this.graphEnhancer?.applyCategoryVariables();
		this.graphEnhancer?.scheduleEnhance(40);
	}

	private configureSyncInterval(): void {
		this.stopSyncInterval();

		if (
			!this.settings.sync.autoSyncEnabled ||
			!this.settings.sync.serverUrl.trim()
		) {
			return;
		}

		const intervalMinutes = Math.max(
			MIN_SYNC_INTERVAL_MINUTES,
			this.settings.sync.autoSyncInterval
		);
		const intervalMs = intervalMinutes * 60 * 1000;
		this.syncIntervalId = window.setInterval(() => {
			void this.syncNow("full", true);
		}, intervalMs);
		this.registerInterval(this.syncIntervalId);
	}

	private stopSyncInterval(): void {
		if (this.syncIntervalId !== null) {
			window.clearInterval(this.syncIntervalId);
			this.syncIntervalId = null;
		}
	}

	private setSyncState(next: Partial<SyncRuntimeState>): void {
		this.syncState = {
			...this.syncState,
			...next,
			serverUrl: this.settings.sync.serverUrl,
			lastSyncTimestamp: this.settings.sync.lastSyncTimestamp,
			lastSyncStats: this.settings.sync.lastSyncStats,
		};
		void this.updateStatusBar();
		this.refreshSyncStateViews();
	}

	private refreshSyncStateViews(): void {
		const leaves = this.app.workspace.getLeavesOfType(STATUS_VIEW_TYPE);
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof ClawVaultStatusView) {
				view.refreshSyncState();
			}
		}
	}

	private async refreshStatusViews(): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(STATUS_VIEW_TYPE);
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof ClawVaultStatusView) {
				await view.refresh();
			}
		}
	}

	private formatSyncStatusBarSuffix(): string {
		if (this.syncState.status === "syncing") {
			return " · ↕ syncing...";
		}

		if (!this.settings.sync.lastSyncTimestamp) {
			return "";
		}

		const diffMs = Date.now() - this.settings.sync.lastSyncTimestamp;
		const diffMinutes = Math.floor(diffMs / 60000);
		if (diffMinutes < 1) {
			return " · ↕ synced just now";
		}
		if (diffMinutes < 60) {
			return ` · ↕ synced ${diffMinutes}m ago`;
		}
		const diffHours = Math.floor(diffMinutes / 60);
		if (diffHours < 24) {
			return ` · ↕ synced ${diffHours}h ago`;
		}
		const diffDays = Math.floor(diffHours / 24);
		return ` · ↕ synced ${diffDays}d ago`;
	}
}
