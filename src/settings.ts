/**
 * ClawVault Plugin Settings
 * Settings interface, defaults, and settings tab
 */

import { App, PluginSettingTab, Setting } from "obsidian";
import type ClawVaultPlugin from "./main";
import {
	DEFAULT_CATEGORY_COLORS,
	DEFAULT_REFRESH_INTERVAL,
	MIN_SYNC_INTERVAL_MINUTES,
} from "./constants";
import {
	DEFAULT_SYNC_SETTINGS,
	type ConflictStrategy,
	type SyncSettings,
} from "./sync/sync-types";

/**
 * Plugin settings interface
 */
export interface ClawVaultSettings {
	// Vault path override (optional, auto-detected from vault root)
	vaultPathOverride: string;
	
	// Graph colors per category
	categoryColors: Record<string, string>;
	
	// Auto-refresh interval in milliseconds
	refreshInterval: number;
	
	// Show status bar item
	showStatusBar: boolean;
	
	// Show file decorations
	showFileDecorations: boolean;

	// Whether graph colors have been auto-configured
	graphColorsConfigured: boolean;

	// Built-in sync settings
	sync: SyncSettings;
}

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: ClawVaultSettings = {
	vaultPathOverride: "",
	categoryColors: { ...DEFAULT_CATEGORY_COLORS },
	refreshInterval: DEFAULT_REFRESH_INTERVAL,
	showStatusBar: true,
	showFileDecorations: true,
	graphColorsConfigured: false,
	sync: { ...DEFAULT_SYNC_SETTINGS },
};

/**
 * Settings tab for ClawVault plugin
 */
export class ClawVaultSettingTab extends PluginSettingTab {
	plugin: ClawVaultPlugin;
	private showAuthFields = false;
	private syncSectionHeadingEl: HTMLElement | null = null;

	constructor(app: App, plugin: ClawVaultPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("clawvault-settings");
		this.syncSectionHeadingEl = null;
		this.showAuthFields =
			this.showAuthFields ||
			Boolean(
				this.plugin.settings.sync.authUsername ||
				this.plugin.settings.sync.authPassword
			);

		// Header
		new Setting(containerEl).setName("ClawVault settings").setHeading();

		// General section
		new Setting(containerEl).setName("General").setHeading();

		new Setting(containerEl)
			.setName("Vault path override")
			.setDesc("Optional: Override the vault path (leave empty to auto-detect)")
			.addText((text) =>
				text
					.setPlaceholder("Auto-detect")
					.setValue(this.plugin.settings.vaultPathOverride)
					.onChange(async (value) => {
						this.plugin.settings.vaultPathOverride = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Auto-refresh interval")
			.setDesc("How often to refresh vault statistics (in seconds)")
			.addSlider((slider) =>
				slider
					.setLimits(10, 300, 10)
					.setValue(this.plugin.settings.refreshInterval / 1000)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.refreshInterval = value * 1000;
						await this.plugin.saveSettings();
						this.plugin.restartRefreshInterval();
					})
			);

		// Display section
		new Setting(containerEl).setName("Display").setHeading();

		new Setting(containerEl)
			.setName("Show status bar")
			.setDesc("Show node count and task count in the status bar")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showStatusBar)
					.onChange(async (value) => {
						this.plugin.settings.showStatusBar = value;
						await this.plugin.saveSettings();
						this.plugin.updateStatusBarVisibility();
					})
			);

		new Setting(containerEl)
			.setName("Show file decorations")
			.setDesc("Show status icons on task files in the file explorer")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showFileDecorations)
					.onChange(async (value) => {
						this.plugin.settings.showFileDecorations = value;
						await this.plugin.saveSettings();
					})
			);

		// Graph colors section
		new Setting(containerEl).setName("Graph colors").setHeading();
		
		containerEl.createEl("p", {
			text: "Customize colors for different categories in the graph view.",
			cls: "setting-item-description",
		});

		const categories = Object.keys(DEFAULT_CATEGORY_COLORS);
		for (const category of categories) {
			const currentColor =
				this.plugin.settings.categoryColors[category] ??
				DEFAULT_CATEGORY_COLORS[category] ??
				"#7f8c8d";

			new Setting(containerEl)
				.setName(this.formatCategoryName(category))
				.setDesc(`Color for ${category} nodes`)
				.addColorPicker((picker) =>
					picker.setValue(currentColor).onChange(async (value) => {
						this.plugin.settings.categoryColors[category] = value;
						await this.plugin.saveSettings();
						this.plugin.updateGraphStyles();
					})
				)
				.addExtraButton((button) =>
					button
						.setIcon("reset")
						.setTooltip("Reset to default")
						.onClick(async () => {
							const defaultColor = DEFAULT_CATEGORY_COLORS[category] ?? "#7f8c8d";
							this.plugin.settings.categoryColors[category] = defaultColor;
							await this.plugin.saveSettings();
							this.display(); // Refresh the settings display
							this.plugin.updateGraphStyles();
						})
				);
		}

		// Reset all colors button
		new Setting(containerEl)
			.setName("Reset all colors")
			.setDesc("Reset all category colors to their defaults")
			.addButton((button) =>
				button
					.setButtonText("Reset all")
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.categoryColors = { ...DEFAULT_CATEGORY_COLORS };
						await this.plugin.saveSettings();
						this.display();
						this.plugin.updateGraphStyles();
					})
			);

		// Sync section
		const syncHeading = new Setting(containerEl).setName("Sync").setHeading();
		this.syncSectionHeadingEl = syncHeading.settingEl;

		new Setting(containerEl)
			.setName("Server URL")
			.setDesc("Base URL for clawvault serve (for example, http://100.64.31.68:8384)")
			.addText((text) =>
				text
					.setPlaceholder("http://100.64.31.68:8384")
					.setValue(this.plugin.settings.sync.serverUrl)
					.onChange(async (value) => {
						this.plugin.settings.sync.serverUrl = value.trim();
						await this.saveSyncSettings();
					})
			)
			.addButton((button) =>
				button
					.setButtonText("Test connection")
					.onClick(async () => {
						await this.plugin.testSyncConnection();
					})
			);

		new Setting(containerEl)
			.setName("Use Basic auth")
			.setDesc("Enable username/password authentication for the sync server")
			.addToggle((toggle) =>
				toggle
					.setValue(this.showAuthFields)
					.onChange((value) => {
						this.showAuthFields = value;
						this.display();
					})
			);

		if (this.showAuthFields) {
			new Setting(containerEl)
				.setName("Auth username")
				.setDesc("Optional basic auth username")
				.addText((text) =>
					text
						.setPlaceholder("username")
						.setValue(this.plugin.settings.sync.authUsername)
						.onChange(async (value) => {
							this.plugin.settings.sync.authUsername = value.trim();
							await this.saveSyncSettings();
						})
				);

			new Setting(containerEl)
				.setName("Auth password")
				.setDesc("Optional basic auth password")
				.addText((text) => {
					text.inputEl.type = "password";
					text
						.setPlaceholder("password")
						.setValue(this.plugin.settings.sync.authPassword)
						.onChange(async (value) => {
							this.plugin.settings.sync.authPassword = value;
							await this.saveSyncSettings();
						});
				});
		}

		new Setting(containerEl)
			.setName("Auto-sync enabled")
			.setDesc("Run automatic sync on startup and at a periodic interval")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.sync.autoSyncEnabled)
					.onChange(async (value) => {
						this.plugin.settings.sync.autoSyncEnabled = value;
						await this.saveSyncSettings();
					})
			);

		new Setting(containerEl)
			.setName("Auto-sync interval")
			.setDesc(`Minutes between background sync runs (minimum ${MIN_SYNC_INTERVAL_MINUTES} min)`)
			.addSlider((slider) =>
				slider
					.setLimits(MIN_SYNC_INTERVAL_MINUTES, 120, 5)
					.setValue(this.plugin.settings.sync.autoSyncInterval)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.sync.autoSyncInterval = Math.max(
							MIN_SYNC_INTERVAL_MINUTES,
							value
						);
						await this.saveSyncSettings();
					})
			);

		new Setting(containerEl)
			.setName("Sync on app open")
			.setDesc("Run a sync when Obsidian finishes loading")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.sync.syncOnOpen)
					.onChange(async (value) => {
						this.plugin.settings.sync.syncOnOpen = value;
						await this.saveSyncSettings();
					})
			);

		new Setting(containerEl)
			.setName("Sync on app close")
			.setDesc("Attempt sync during plugin unload (can be unreliable on mobile)")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.sync.syncOnClose)
					.onChange(async (value) => {
						this.plugin.settings.sync.syncOnClose = value;
						await this.saveSyncSettings();
					})
			);

		new Setting(containerEl)
			.setName("Exclude patterns")
			.setDesc("Comma-separated glob patterns to exclude from sync")
			.addTextArea((text) =>
				text
					.setPlaceholder(".trash/**, attachments/*.tmp")
					.setValue(this.plugin.settings.sync.excludePatterns.join(", "))
					.onChange(async (value) => {
						this.plugin.settings.sync.excludePatterns = this.parseList(value);
						await this.saveSyncSettings();
					})
			);

		new Setting(containerEl)
			.setName("Conflict strategy")
			.setDesc("How to resolve files changed on both local and remote")
			.addDropdown((dropdown) => {
				const labels: Record<ConflictStrategy, string> = {
					"newest-wins": "Newest wins",
					"remote-wins": "Remote wins",
					"local-wins": "Local wins",
					"keep-both": "Keep both copies",
					ask: "Ask every time",
				};
				for (const [value, label] of Object.entries(labels)) {
					dropdown.addOption(value, label);
				}
				dropdown
					.setValue(this.plugin.settings.sync.conflictStrategy)
					.onChange(async (value) => {
						this.plugin.settings.sync.conflictStrategy = value as ConflictStrategy;
						await this.saveSyncSettings();
					});
			});

		const categoriesHeader = containerEl.createEl("div", {
			text: "Sync categories",
			cls: "setting-item-name",
		});
		categoriesHeader.style.marginTop = "10px";
		containerEl.createEl("div", {
			text: "Choose which top-level categories to sync. If all are enabled, the setting is saved as 'all categories'.",
			cls: "setting-item-description",
		});

		const categoryContainer = containerEl.createDiv({
			cls: "clawvault-sync-category-container",
		});
		categoryContainer.createEl("div", {
			text: "Loading categories...",
			cls: "setting-item-description",
		});
		void this.renderSyncCategorySettings(categoryContainer);

		new Setting(containerEl)
			.setName("Sync now")
			.setDesc(this.formatLastSyncSummary())
			.addButton((button) =>
				button
					.setButtonText("Sync now")
					.setCta()
					.onClick(async () => {
						await this.plugin.syncNow("full");
						this.display();
					})
			);

		// About section
		new Setting(containerEl).setName("About").setHeading();
		
		containerEl.createEl("p", {
			text: "ClawVault is a visual memory management plugin for Obsidian. It provides colored graph nodes, task tracking, and vault statistics.",
		});
		containerEl.createEl("p", {
			text: "For more information, visit the ClawVault documentation.",
		});
	}

	/**
	 * Format category name for display
	 */
	private formatCategoryName(category: string): string {
		return category.charAt(0).toUpperCase() + category.slice(1);
	}

	private async saveSyncSettings(): Promise<void> {
		await this.plugin.saveSettings();
		this.plugin.reconfigureSync();
	}

	private parseList(value: string): string[] {
		return value
			.split(",")
			.map((item) => item.trim())
			.filter((item) => item.length > 0);
	}

	private async renderSyncCategorySettings(containerEl: HTMLElement): Promise<void> {
		containerEl.empty();
		const config = await this.plugin.vaultReader.readConfig();
		const categorySet = new Set<string>();
		for (const category of config?.categories ?? []) {
			const trimmed = category.trim();
			if (trimmed.length > 0) {
				categorySet.add(trimmed);
			}
		}
		for (const category of Object.keys(DEFAULT_CATEGORY_COLORS)) {
			categorySet.add(category);
		}

		const categories = Array.from(categorySet).sort((a, b) => a.localeCompare(b));
		if (categories.length === 0) {
			containerEl.createEl("div", {
				text: "No categories discovered yet.",
				cls: "setting-item-description",
			});
			return;
		}

		for (const category of categories) {
			const allSelected = this.plugin.settings.sync.syncCategories.length === 0;
			const isSelected =
				allSelected || this.plugin.settings.sync.syncCategories.includes(category);

			new Setting(containerEl)
				.setName(this.formatCategoryName(category))
				.addToggle((toggle) =>
					toggle.setValue(isSelected).onChange(async (enabled) => {
						await this.toggleSyncCategory(categories, category, enabled);
					})
				);
		}
	}

	private async toggleSyncCategory(
		allCategories: string[],
		category: string,
		enabled: boolean
	): Promise<void> {
		const selected = new Set(this.plugin.settings.sync.syncCategories);
		const currentlyAll = selected.size === 0;
		const nextSelection = currentlyAll ? new Set(allCategories) : new Set(selected);

		if (enabled) {
			nextSelection.add(category);
		} else {
			nextSelection.delete(category);
		}

		if (
			nextSelection.size === allCategories.length ||
			nextSelection.size === 0
		) {
			this.plugin.settings.sync.syncCategories = [];
		} else {
			this.plugin.settings.sync.syncCategories = Array.from(nextSelection).sort(
				(a, b) => a.localeCompare(b)
			);
		}

		await this.saveSyncSettings();
		this.display();
	}

	private formatLastSyncSummary(): string {
		const sync = this.plugin.settings.sync;
		if (!sync.lastSyncTimestamp) {
			return "Last sync: never";
		}

		const when = new Date(sync.lastSyncTimestamp).toLocaleString();
		if (!sync.lastSyncStats) {
			return `Last sync: ${when}`;
		}

		return `Last sync: ${when} (↓ ${sync.lastSyncStats.pulled} · ↑ ${sync.lastSyncStats.pushed} · ⚡ ${sync.lastSyncStats.conflicts})`;
	}

	focusSyncSection(): void {
		if (!this.syncSectionHeadingEl) return;
		this.syncSectionHeadingEl.scrollIntoView({
			behavior: "smooth",
			block: "start",
		});
		this.syncSectionHeadingEl.classList.add("clawvault-sync-highlight");
		window.setTimeout(() => {
			this.syncSectionHeadingEl?.classList.remove("clawvault-sync-highlight");
		}, 1200);
	}
}
