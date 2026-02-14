/**
 * ClawVault Status View
 * Sidebar panel showing vault statistics
 */

import { ItemView, WorkspaceLeaf } from "obsidian";
import type ClawVaultPlugin from "./main";
import { COMMAND_IDS, STATUS_VIEW_TYPE } from "./constants";
import type { VaultStats } from "./vault-reader";

interface StatusViewData {
	stats: VaultStats;
	graphTypes: Record<string, number>;
	todayObs: { count: number; categories: string[] };
}

/**
 * Status panel view for the right sidebar
 */
export class ClawVaultStatusView extends ItemView {
	plugin: ClawVaultPlugin;
	private statusContentEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: ClawVaultPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return STATUS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "ClawVault status";
	}

	getIcon(): string {
		return "database";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		if (!container || !(container instanceof HTMLElement)) return;
		
		container.empty();
		container.addClass("clawvault-status-view");

		this.statusContentEl = container.createDiv({ cls: "clawvault-status-content" });
		await this.refresh();
	}

	async onClose(): Promise<void> {
		this.statusContentEl = null;
	}

	/**
	 * Refresh the status panel with current vault stats
	 */
	async refresh(): Promise<void> {
		if (!this.statusContentEl) return;

		this.statusContentEl.empty();

		try {
			const [stats, graphTypes, todayObs] = await Promise.all([
				this.plugin.vaultReader.getVaultStats(),
				this.plugin.vaultReader.getGraphTypeSummary(),
				this.plugin.vaultReader.getTodayObservations(),
			]);
			this.renderStats({
				stats,
				graphTypes,
				todayObs,
			});
		} catch (error) {
			this.renderError(error);
		}
	}

	/**
	 * Render vault statistics
	 */
	private renderStats(data: StatusViewData): void {
		if (!this.statusContentEl) return;
		const { stats, graphTypes, todayObs } = data;

		// Header
		const header = this.statusContentEl.createDiv({ cls: "clawvault-status-header" });
		header.createEl("h3", { text: "🐘 ClawVault" });
		header.createEl("hr");

		// Vault info
		const vaultInfo = this.statusContentEl.createDiv({ cls: "clawvault-status-section" });
		vaultInfo.createEl("div", {
			text: `Vault: ${stats.vaultName}`,
			cls: "clawvault-status-vault-name",
		});
		vaultInfo.createEl("div", {
			text: `Files: ${this.formatNumber(stats.fileCount)}`,
			cls: "clawvault-status-counts",
		});

		// Memory Graph section
		const graphSection = this.statusContentEl.createDiv({ cls: "clawvault-status-section" });
		graphSection.createEl("h4", { text: "Memory Graph" });

		const graphStats = graphSection.createDiv({ cls: "clawvault-graph-stats" });
		graphStats.createDiv({
			text: `🔗 ${this.formatNumber(stats.nodeCount)} nodes · ${this.formatNumber(stats.edgeCount)} edges`,
			cls: "clawvault-graph-totals",
		});

		// Node type breakdown
		const sortedTypes = Object.entries(graphTypes).sort((a, b) => b[1] - a[1]);
		if (sortedTypes.length > 0) {
			const typeGrid = graphSection.createDiv({ cls: "clawvault-graph-type-grid" });
			for (const [type, count] of sortedTypes) {
				const typeEl = typeGrid.createDiv({ cls: "clawvault-graph-type-item" });
				typeEl.createSpan({ text: `${count}`, cls: "clawvault-graph-type-count" });
				typeEl.createSpan({ text: ` ${type}`, cls: "clawvault-graph-type-label" });
			}
		}

		// Today's observations
		const obsSection = this.statusContentEl.createDiv({ cls: "clawvault-status-section" });
		obsSection.createEl("h4", { text: "Observations today" });
		obsSection.createDiv({
			text: `${todayObs.count} observation${todayObs.count === 1 ? "" : "s"}`,
			cls: "clawvault-obs-today",
		});
		obsSection.createDiv({
			text:
				todayObs.categories.length > 0
					? `Categories: ${todayObs.categories.join(", ")}`
					: "Categories: none",
			cls: "clawvault-obs-categories",
		});

		// Inbox section
		if (stats.inboxCount > 0) {
			const inboxSection = this.statusContentEl.createDiv({ cls: "clawvault-status-section" });
			inboxSection.createDiv({
				text: `📥 Inbox: ${stats.inboxCount} pending`,
				cls: "clawvault-inbox-count",
			});
		}

		// Last observation section
		const activitySection = this.statusContentEl.createDiv({
			cls: "clawvault-status-section clawvault-activity",
		});
		activitySection.createDiv({
			text: `Last observation: ${
				stats.lastObservation ? stats.lastObservation.toLocaleString() : "none"
			}`,
		});

		// Kanban board link
		const kanbanSection = this.statusContentEl.createDiv({ cls: "clawvault-status-section" });
		const kanbanLink = kanbanSection.createEl("a", {
			text: "📋 Open Kanban Board",
			cls: "clawvault-kanban-link",
		});
		kanbanLink.addEventListener("click", (event) => {
			event.preventDefault();
			void this.app.workspace.openLinkText("Board.md", "", "tab");
		});

		const quickActionsSection = this.statusContentEl.createDiv({
			cls: "clawvault-status-section clawvault-status-quick-actions",
		});
		quickActionsSection.createEl("h4", { text: "Quick actions" });
		const actionsRow = quickActionsSection.createDiv({ cls: "clawvault-quick-action-row" });
		this.renderQuickActionButton(
			actionsRow,
			"Quick Capture",
			COMMAND_IDS.QUICK_CAPTURE
		);
		this.renderQuickActionButton(actionsRow, "Refresh", COMMAND_IDS.REFRESH_STATS);

		// Refresh button
		const footer = this.statusContentEl.createDiv({ cls: "clawvault-status-footer" });
		const refreshBtn = footer.createEl("button", {
			text: "Refresh",
			cls: "clawvault-refresh-btn",
		});
		refreshBtn.addEventListener("click", () => {
			void this.refresh();
		});
	}

	/**
	 * Render error state
	 */
	private renderError(error: unknown): void {
		if (!this.statusContentEl) return;

		const errorDiv = this.statusContentEl.createDiv({ cls: "clawvault-status-error" });
		errorDiv.createEl("h4", { text: "🐘 ClawVault" });
		errorDiv.createEl("p", {
			text: "Could not load vault statistics.",
			cls: "clawvault-error-message",
		});
		errorDiv.createEl("p", {
			text: error instanceof Error ? error.message : "Unknown error",
			cls: "clawvault-error-details",
		});

		const refreshBtn = errorDiv.createEl("button", {
			text: "Retry",
			cls: "clawvault-refresh-btn",
		});
		refreshBtn.addEventListener("click", () => {
			void this.refresh();
		});
	}

	/**
	 * Format a number with commas
	 */
	private formatNumber(num: number): string {
		return num.toLocaleString();
	}

	private renderQuickActionButton(
		parent: HTMLElement,
		label: string,
		commandId: string
	): void {
		const button = parent.createEl("button", {
			text: label,
			cls: "clawvault-quick-action-btn",
		});
		button.addEventListener("click", () => {
			void this.executeCommandById(commandId);
		});
	}

	private async executeCommandById(commandId: string): Promise<void> {
		const commandManager = (
			this.app as typeof this.app & {
				commands?: {
					executeCommandById: (id: string) => Promise<boolean> | boolean;
				};
			}
		).commands;
		if (commandManager?.executeCommandById) {
			await commandManager.executeCommandById(commandId);
		}
	}
}
