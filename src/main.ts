/**
 * ClawVault Obsidian Plugin
 * Visual memory management for ClawVault vaults
 */

import { Plugin, WorkspaceLeaf } from "obsidian";
import { ClawVaultSettings, ClawVaultSettingTab, DEFAULT_SETTINGS } from "./settings";
import { VaultReader } from "./vault-reader";
import { ClawVaultStatusView } from "./status-view";
// Task board view removed — Kanban plugin handles task visualization
import { FileDecorations } from "./decorations";
import { GraphEnhancer } from "./graph-enhancer";
import { registerCommands } from "./commands";
import {
	DEFAULT_CATEGORY_COLORS,
	STATUS_VIEW_TYPE,
	// TASK_BOARD_VIEW_TYPE removed — using Kanban plugin
} from "./constants";

export default class ClawVaultPlugin extends Plugin {
	settings: ClawVaultSettings = DEFAULT_SETTINGS;
	vaultReader: VaultReader = null!;
	
	private statusBarItem: HTMLElement | null = null;
	private refreshIntervalId: number | null = null;
	private fileDecorations: FileDecorations | null = null;
	private graphEnhancer: GraphEnhancer | null = null;

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
		this.addSettingTab(new ClawVaultSettingTab(this.app, this));

		// Initialize file decorations
		this.fileDecorations = new FileDecorations(this);
		this.fileDecorations.initialize();

		// Initialize graph enhancements
		this.graphEnhancer = new GraphEnhancer(this);
		this.graphEnhancer.initialize();

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
		// Clean up refresh interval
		if (this.refreshIntervalId !== null) {
			window.clearInterval(this.refreshIntervalId);
			this.refreshIntervalId = null;
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

		// Note: Don't detach leaves in onunload per Obsidian guidelines
		// The view will be properly cleaned up by Obsidian
	}

	async loadSettings(): Promise<void> {
		const data = await this.loadData() as Partial<ClawVaultSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		
		// Merge category colors with defaults
		this.settings.categoryColors = Object.assign(
			{},
			DEFAULT_CATEGORY_COLORS,
			this.settings.categoryColors
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
			this.statusBarItem.setText(
				`🐘 ${stats.nodeCount.toLocaleString()} nodes · ${activeTaskCount} tasks`
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

	/**
	 * Refresh all plugin data
	 */
	async refreshAll(): Promise<void> {
		// Clear vault reader cache
		this.vaultReader.clearCache();

		// Update status bar
		await this.updateStatusBar();

		// Refresh status view if open
		const leaves = this.app.workspace.getLeavesOfType(STATUS_VIEW_TYPE);
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof ClawVaultStatusView) {
				await view.refresh();
			}
		}

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
}
