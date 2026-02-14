/**
 * ClawVault Status View
 * Sidebar panel showing vault statistics
 */

import { ItemView, WorkspaceLeaf } from "obsidian";
import type ClawVaultPlugin from "./main";
import { STATUS_VIEW_TYPE } from "./constants";
import type { VaultStats } from "./vault-reader";

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
		return "ClawVault Status";
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
			const stats = await this.plugin.vaultReader.getVaultStats();
			this.renderStats(stats);
		} catch (error) {
			this.renderError(error);
		}
	}

	/**
	 * Render vault statistics
	 */
	private renderStats(stats: VaultStats): void {
		if (!this.statusContentEl) return;

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
			text: `Files: ${this.formatNumber(stats.fileCount)} | Nodes: ${this.formatNumber(stats.nodeCount)} | Edges: ${this.formatNumber(stats.edgeCount)}`,
			cls: "clawvault-status-counts",
		});

		// Tasks section
		if (stats.tasks.total > 0) {
			const tasksSection = this.statusContentEl.createDiv({ cls: "clawvault-status-section" });
			tasksSection.createEl("h4", { text: "Tasks" });

			const taskStats = tasksSection.createDiv({ cls: "clawvault-task-stats" });
			
			// Active, open, blocked
			const statusLine = taskStats.createDiv({ cls: "clawvault-task-status-line" });
			statusLine.createSpan({ text: `● ${stats.tasks.active} active`, cls: "clawvault-task-active" });
			statusLine.createSpan({ text: " | " });
			statusLine.createSpan({ text: `○ ${stats.tasks.open} open`, cls: "clawvault-task-open" });
			statusLine.createSpan({ text: " | " });
			statusLine.createSpan({ text: `⊘ ${stats.tasks.blocked} blocked`, cls: "clawvault-task-blocked" });

			// Completed with percentage
			const completedPct = stats.tasks.total > 0
				? Math.round((stats.tasks.completed / stats.tasks.total) * 100)
				: 0;
			taskStats.createDiv({
				text: `✓ ${stats.tasks.completed} completed (${completedPct}%)`,
				cls: "clawvault-task-completed",
			});

			// Progress bar
			const progressBar = taskStats.createDiv({ cls: "clawvault-progress-bar" });
			const progressFill = progressBar.createDiv({ cls: "clawvault-progress-fill" });
			progressFill.style.width = `${completedPct}%`;
		}

		// Inbox section
		if (stats.inboxCount > 0) {
			const inboxSection = this.statusContentEl.createDiv({ cls: "clawvault-status-section" });
			inboxSection.createDiv({
				text: `📥 Inbox: ${stats.inboxCount} pending`,
				cls: "clawvault-inbox-count",
			});
		}

		// Last activity section
		const activitySection = this.statusContentEl.createDiv({ cls: "clawvault-status-section clawvault-activity" });
		
		if (stats.lastObservation) {
			activitySection.createDiv({
				text: `Last Observation: ${this.formatTimeAgo(stats.lastObservation)}`,
			});
		}
		
		if (stats.lastReflection) {
			activitySection.createDiv({
				text: `Last Reflection: ${stats.lastReflection}`,
			});
		}

		// Refresh button
		const footer = this.statusContentEl.createDiv({ cls: "clawvault-status-footer" });
		const refreshBtn = footer.createEl("button", {
			text: "Refresh",
			cls: "clawvault-refresh-btn",
		});
		refreshBtn.addEventListener("click", () => this.refresh());
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
		refreshBtn.addEventListener("click", () => this.refresh());
	}

	/**
	 * Format a number with commas
	 */
	private formatNumber(num: number): string {
		return num.toLocaleString();
	}

	/**
	 * Format a date as time ago
	 */
	private formatTimeAgo(date: Date): string {
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMins / 60);
		const diffDays = Math.floor(diffHours / 24);

		if (diffMins < 1) return "just now";
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString();
	}
}
