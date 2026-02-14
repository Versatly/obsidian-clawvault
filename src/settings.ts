/**
 * ClawVault Plugin Settings
 * Settings interface, defaults, and settings tab
 */

import { App, PluginSettingTab, Setting } from "obsidian";
import type ClawVaultPlugin from "./main";
import { DEFAULT_CATEGORY_COLORS, DEFAULT_REFRESH_INTERVAL } from "./constants";

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
};

/**
 * Settings tab for ClawVault plugin
 */
export class ClawVaultSettingTab extends PluginSettingTab {
	plugin: ClawVaultPlugin;

	constructor(app: App, plugin: ClawVaultPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Header
		containerEl.createEl("h2", { text: "ClawVault Settings" });

		// General section
		containerEl.createEl("h3", { text: "General" });

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
		containerEl.createEl("h3", { text: "Display" });

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
		containerEl.createEl("h3", { text: "Graph colors" });
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

		// About section
		containerEl.createEl("h3", { text: "About" });
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
}
