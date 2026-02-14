/**
 * ClawVault Status View
 * Sidebar panel showing vault statistics
 */

import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type ClawVaultPlugin from "./main";
import { COMMAND_IDS, STATUS_VIEW_TYPE } from "./constants";
import type { ObservationSession, ParsedTask, VaultStats } from "./vault-reader";

interface StatusViewData {
	stats: VaultStats;
	backlogItems: ParsedTask[];
	recentSessions: ObservationSession[];
	openLoops: ParsedTask[];
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
			const [stats, backlogItems, recentSessions, openLoops, graphTypes, todayObs] = await Promise.all([
				this.plugin.vaultReader.getVaultStats(),
				this.plugin.vaultReader.getBacklogTasks(5),
				this.plugin.vaultReader.getRecentObservationSessions(5),
				this.plugin.vaultReader.getOpenLoops(7),
				this.plugin.vaultReader.getGraphTypeSummary(),
				this.plugin.vaultReader.getTodayObservations(),
			]);
			this.renderStats({
				stats,
				backlogItems,
				recentSessions,
				openLoops,
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
		const { stats, backlogItems, recentSessions, openLoops, graphTypes, todayObs } = data;

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

		// Memory Graph section
		if (stats.nodeCount > 0 || Object.keys(graphTypes).length > 0) {
			const graphSection = this.statusContentEl.createDiv({ cls: "clawvault-status-section" });
			graphSection.createEl("h4", { text: "Memory Graph" });

			const graphStats = graphSection.createDiv({ cls: "clawvault-graph-stats" });
			graphStats.createDiv({
				text: `🔗 ${this.formatNumber(stats.nodeCount)} nodes · ${this.formatNumber(stats.edgeCount)} edges`,
				cls: "clawvault-graph-totals",
			});

			// Node type breakdown (top 5)
			const sortedTypes = Object.entries(graphTypes)
				.sort((a, b) => b[1] - a[1])
				.slice(0, 6);
			if (sortedTypes.length > 0) {
				const typeGrid = graphSection.createDiv({ cls: "clawvault-graph-type-grid" });
				for (const [type, count] of sortedTypes) {
					const typeEl = typeGrid.createDiv({ cls: "clawvault-graph-type-item" });
					typeEl.createSpan({ text: `${count}`, cls: "clawvault-graph-type-count" });
					typeEl.createSpan({ text: ` ${type}`, cls: "clawvault-graph-type-label" });
				}
			}
		}

		// Today's observations
		if (todayObs.count > 0) {
			const obsSection = this.statusContentEl.createDiv({ cls: "clawvault-status-section" });
			obsSection.createDiv({
				text: `🔭 ${todayObs.count} observation${todayObs.count === 1 ? "" : "s"} today`,
				cls: "clawvault-obs-today",
			});
			if (todayObs.categories.length > 0) {
				obsSection.createDiv({
					text: `→ ${todayObs.categories.join(", ")}`,
					cls: "clawvault-obs-categories",
				});
			}
		}

		// Kanban board link
		const boardFile = this.app.vault.getAbstractFileByPath("Board.md");
		if (boardFile instanceof TFile) {
			const kanbanSection = this.statusContentEl.createDiv({ cls: "clawvault-status-section" });
			const kanbanLink = kanbanSection.createEl("a", {
				text: "📋 Open Kanban Board",
				cls: "clawvault-kanban-link",
			});
			kanbanLink.addEventListener("click", (event) => {
				event.preventDefault();
				void this.app.workspace.openLinkText("Board.md", "", "tab");
			});
		}

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

		// Backlog section
		const backlogSection = this.statusContentEl.createDiv({ cls: "clawvault-status-section" });
		backlogSection.createEl("h4", {
			text: `Backlog (${stats.tasks.open})`,
		});

		if (backlogItems.length === 0) {
			backlogSection.createDiv({
				text: "No backlog tasks",
				cls: "clawvault-empty-hint",
			});
		} else {
			const backlogList = backlogSection.createDiv({ cls: "clawvault-status-list" });
			for (const task of backlogItems) {
				const item = backlogList.createDiv({ cls: "clawvault-status-list-item" });
				const link = item.createEl("a", {
					text: task.frontmatter.title ?? task.file.basename,
					cls: "clawvault-blocked-link",
				});
				link.addEventListener("click", (event) => {
					event.preventDefault();
					void this.app.workspace.openLinkText(task.file.path, "", "tab");
				});

				const meta = item.createDiv({ cls: "clawvault-status-list-meta" });
				if (task.frontmatter.project) {
					meta.createSpan({ text: task.frontmatter.project });
				}
				if (task.frontmatter.priority) {
					if (meta.childElementCount > 0) meta.createSpan({ text: " · " });
					meta.createSpan({
						text: `${task.frontmatter.priority}`,
						cls: `clawvault-priority-${task.frontmatter.priority}`,
					});
				}
			}
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
				text: `Last observation: ${this.formatTimeAgo(stats.lastObservation)}`,
			});
		}
		
		if (stats.lastReflection) {
			activitySection.createDiv({
				text: `Last reflection: ${stats.lastReflection}`,
			});
		}

		// Recent observation sessions
		const recentActivitySection = this.statusContentEl.createDiv({
			cls: "clawvault-status-section",
		});
		recentActivitySection.createEl("h4", { text: "Recent activity" });
		if (recentSessions.length === 0) {
			recentActivitySection.createDiv({
				text: "No observed sessions found.",
				cls: "clawvault-empty-hint",
			});
		} else {
			const sessionsList = recentActivitySection.createDiv({ cls: "clawvault-status-list" });
			for (const session of recentSessions) {
				const row = sessionsList.createDiv({ cls: "clawvault-status-list-item" });
				const link = row.createEl("a", {
					text: session.file.basename,
					cls: "clawvault-blocked-link",
				});
				link.addEventListener("click", (event) => {
					event.preventDefault();
					void this.app.workspace.openLinkText(session.file.path, "", "tab");
				});
				row.createDiv({
					text: session.timestamp.toLocaleString(),
					cls: "clawvault-status-list-meta",
				});
			}
		}

		// Open loops section
		const openLoopsSection = this.statusContentEl.createDiv({ cls: "clawvault-status-section" });
		openLoopsSection.createEl("h4", {
			text: `Open loops (${openLoops.length})`,
		});

		if (openLoops.length === 0) {
			openLoopsSection.createDiv({
				text: "No open loops older than 7 days.",
				cls: "clawvault-empty-hint",
			});
		} else {
			const loopList = openLoopsSection.createDiv({ cls: "clawvault-status-list" });
			for (const task of openLoops.slice(0, 5)) {
				const row = loopList.createDiv({
					cls: "clawvault-status-list-item clawvault-open-loop-warning",
				});
				const ageDays = this.getAgeInDays(task.createdAt ?? new Date(task.file.stat.ctime));
				const link = row.createEl("a", {
					text: task.frontmatter.title ?? task.file.basename,
					cls: "clawvault-blocked-link",
				});
				link.addEventListener("click", (event) => {
					event.preventDefault();
					void this.app.workspace.openLinkText(task.file.path, "", "tab");
				});
				row.createDiv({
					text: `${ageDays}d open`,
					cls: "clawvault-status-list-meta",
				});
			}
		}

		const quickActionsSection = this.statusContentEl.createDiv({
			cls: "clawvault-status-section clawvault-status-quick-actions",
		});
		quickActionsSection.createEl("h4", { text: "Quick actions" });
		const actionsRow = quickActionsSection.createDiv({ cls: "clawvault-quick-action-row" });
		this.renderQuickActionButton(
			actionsRow,
			"Add Task",
			COMMAND_IDS.ADD_TASK
		);
		this.renderQuickActionButton(
			actionsRow,
			"Quick Capture",
			COMMAND_IDS.QUICK_CAPTURE
		);
		this.renderQuickActionButton(
			actionsRow,
			"Generate Dashboard",
			COMMAND_IDS.GENERATE_DASHBOARD
		);

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

	private getAgeInDays(date: Date): number {
		const diffMs = Date.now() - date.getTime();
		return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
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
