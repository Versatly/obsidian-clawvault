/**
 * ClawVault Obsidian Plugin
 * Visual memory management for ClawVault vaults
 */

import { Plugin, WorkspaceLeaf } from "obsidian";
import { ClawVaultSettings, ClawVaultSettingTab, DEFAULT_SETTINGS } from "./settings";
import { VaultReader } from "./vault-reader";
import { ClawVaultStatusView } from "./status-view";
import { FileDecorations } from "./decorations";
import { registerCommands } from "./commands";
import { STATUS_VIEW_TYPE, DEFAULT_CATEGORY_COLORS } from "./constants";

export default class ClawVaultPlugin extends Plugin {
	settings: ClawVaultSettings = DEFAULT_SETTINGS;
	vaultReader: VaultReader = null!;
	
	private statusBarItem: HTMLElement | null = null;
	private refreshIntervalId: number | null = null;
	private fileDecorations: FileDecorations | null = null;
	private styleEl: HTMLStyleElement | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Initialize vault reader
		this.vaultReader = new VaultReader(this.app);

		// Register the status view
		this.registerView(STATUS_VIEW_TYPE, (leaf: WorkspaceLeaf) => {
			return new ClawVaultStatusView(leaf, this);
		});

		// Add ribbon icon
		this.addRibbonIcon("database", "ClawVault Status", () => {
			this.activateStatusView();
		});

		// Add status bar item
		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.addClass("clawvault-status-bar");
		this.statusBarItem.addEventListener("click", () => {
			this.activateStatusView();
		});
		this.updateStatusBarVisibility();

		// Register commands
		registerCommands(this);

		// Add settings tab
		this.addSettingTab(new ClawVaultSettingTab(this.app, this));

		// Initialize file decorations
		this.fileDecorations = new FileDecorations(this);
		this.fileDecorations.initialize();

		// Inject graph styles
		this.injectGraphStyles();

		// Start refresh interval
		this.startRefreshInterval();

		// Initial status bar update
		this.updateStatusBar();

		console.log("ClawVault plugin loaded");
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

		// Clean up injected styles
		if (this.styleEl) {
			this.styleEl.remove();
			this.styleEl = null;
		}

		// Detach all status views
		this.app.workspace.detachLeavesOfType(STATUS_VIEW_TYPE);

		console.log("ClawVault plugin unloaded");
	}

	async loadSettings(): Promise<void> {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data as Partial<ClawVaultSettings>);
		
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
			workspace.revealLeaf(leaf);
		}
	}

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
		} catch (error) {
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
			this.refreshAll();
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

		// Update file decorations
		if (this.fileDecorations) {
			await this.fileDecorations.decorateAllFiles();
		}
	}

	/**
	 * Inject CSS styles for graph coloring
	 */
	injectGraphStyles(): void {
		// Remove existing style element
		if (this.styleEl) {
			this.styleEl.remove();
		}

		// Create new style element
		this.styleEl = document.createElement("style");
		this.styleEl.id = "clawvault-graph-styles";
		this.updateGraphStyleContent();
		document.head.appendChild(this.styleEl);
	}

	/**
	 * Update the graph style content
	 */
	private updateGraphStyleContent(): void {
		if (!this.styleEl) return;

		const colors = this.settings.categoryColors;
		const cssRules: string[] = [];

		// Generate CSS custom properties for each category
		cssRules.push(`:root {`);
		for (const [category, color] of Object.entries(colors)) {
			cssRules.push(`  --clawvault-color-${category}: ${color};`);
		}
		cssRules.push(`}`);

		// Graph node styling based on data attributes
		// Note: Obsidian's graph doesn't natively support folder-based coloring,
		// but we can use CSS classes that could be added via other means
		for (const [category, color] of Object.entries(colors)) {
			cssRules.push(`
.graph-view.color-fill-${category} .node circle,
.graph-view .node.${category} circle {
  fill: ${color} !important;
}

.graph-view.color-fill-${category} .node text,
.graph-view .node.${category} text {
  fill: ${color} !important;
}`);
		}

		this.styleEl.textContent = cssRules.join("\n");
	}

	/**
	 * Update graph styles (called when settings change)
	 */
	updateGraphStyles(): void {
		this.updateGraphStyleContent();
	}
}
