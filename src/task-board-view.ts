/**
 * ClawVault Task Board View
 * Kanban-style task board with drag-and-drop status updates
 */

import { ItemView, Notice, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
import type ClawVaultPlugin from "./main";
import {
	DEFAULT_FOLDERS,
	STATUS_ICONS,
	TASK_BOARD_VIEW_TYPE,
	TASK_PRIORITY,
	TASK_STATUS,
	TaskStatus,
} from "./constants";
import type { ParsedTask, TaskFrontmatter } from "./vault-reader";

interface FilterState {
	project: string;
	priority: string;
	owner: string;
}

interface TaskBoardCardData {
	file: TFile;
	title: string;
	status: TaskStatus;
	priority: string;
	project: string;
	owner: string;
	blockedBy: string;
	createdAt: Date | null;
}

const ALL_FILTER_VALUE = "__all__";

export class ClawVaultTaskBoardView extends ItemView {
	plugin: ClawVaultPlugin;
	private boardContentEl: HTMLElement | null = null;
	private allTasks: TaskBoardCardData[] = [];
	private filters: FilterState = {
		project: ALL_FILTER_VALUE,
		priority: ALL_FILTER_VALUE,
		owner: ALL_FILTER_VALUE,
	};
	private refreshTimerId: number | null = null;
	private isRefreshing = false;

	constructor(leaf: WorkspaceLeaf, plugin: ClawVaultPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return TASK_BOARD_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "ClawVault task board";
	}

	getIcon(): string {
		return "kanban-square";
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl.children[1];
		if (!container || !(container instanceof HTMLElement)) {
			return;
		}

		container.empty();
		container.addClass("clawvault-task-board-view");
		this.boardContentEl = container.createDiv({ cls: "clawvault-task-board-content" });

		this.registerVaultListeners();
		await this.refresh();
	}

	async onClose(): Promise<void> {
		this.boardContentEl = null;
		if (this.refreshTimerId !== null) {
			window.clearTimeout(this.refreshTimerId);
			this.refreshTimerId = null;
		}
	}

	async refresh(): Promise<void> {
		if (!this.boardContentEl || this.isRefreshing) {
			return;
		}

		this.isRefreshing = true;
		this.boardContentEl.empty();
		this.boardContentEl.createDiv({
			text: "Loading tasks...",
			cls: "clawvault-loading",
		});

		try {
			const taskData = await this.plugin.vaultReader.getAllTasks();
			this.allTasks = taskData.map((task) => this.toCardData(task));
			this.renderBoard();
		} catch (error) {
			this.renderError(error);
		} finally {
			this.isRefreshing = false;
		}
	}

	private registerVaultListeners(): void {
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (this.isTaskFile(file)) {
					this.scheduleRefresh();
				}
			})
		);

		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (this.isTaskFile(file)) {
					this.scheduleRefresh();
				}
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (this.isTaskFile(file)) {
					this.scheduleRefresh();
				}
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", (file) => {
				if (this.isTaskFile(file)) {
					this.scheduleRefresh();
				}
			})
		);
	}

	private scheduleRefresh(): void {
		if (this.refreshTimerId !== null) {
			window.clearTimeout(this.refreshTimerId);
		}
		this.refreshTimerId = window.setTimeout(() => {
			this.refreshTimerId = null;
			void this.refresh();
		}, 150);
	}

	private isTaskFile(file: TAbstractFile): file is TFile {
		return (
			file instanceof TFile &&
			file.extension === "md" &&
			(file.path.startsWith(`${DEFAULT_FOLDERS.TASKS}/`) ||
				file.parent?.path === DEFAULT_FOLDERS.TASKS)
		);
	}

	private toCardData(task: ParsedTask): TaskBoardCardData {
		const frontmatter = task.frontmatter;
		return {
			file: task.file,
			title: frontmatter.title?.trim() || task.file.basename,
			status: task.status,
			priority: this.normalizePriority(frontmatter.priority),
			project: frontmatter.project?.trim() || "unassigned",
			owner: frontmatter.owner?.trim() || "unassigned",
			blockedBy: this.normalizeBlockedBy(frontmatter.blocked_by),
			createdAt: task.createdAt,
		};
	}

	private normalizePriority(priority: TaskFrontmatter["priority"]): string {
		if (
			priority === TASK_PRIORITY.CRITICAL ||
			priority === TASK_PRIORITY.HIGH ||
			priority === TASK_PRIORITY.MEDIUM ||
			priority === TASK_PRIORITY.LOW
		) {
			return priority;
		}
		return TASK_PRIORITY.MEDIUM;
	}

	private normalizeBlockedBy(blockedBy: TaskFrontmatter["blocked_by"]): string {
		if (Array.isArray(blockedBy)) {
			return blockedBy.join(", ");
		}
		if (typeof blockedBy === "string") {
			return blockedBy.trim();
		}
		return "";
	}

	private renderBoard(): void {
		if (!this.boardContentEl) {
			return;
		}

		this.boardContentEl.empty();
		this.renderFilterBar();

		const boardEl = this.boardContentEl.createDiv({ cls: "clawvault-kanban-board" });
		const statuses: TaskStatus[] = [
			TASK_STATUS.OPEN,
			TASK_STATUS.IN_PROGRESS,
			TASK_STATUS.BLOCKED,
			TASK_STATUS.DONE,
		];

		for (const status of statuses) {
			const tasks = this.getFilteredTasks().filter((task) => task.status === status);
			const columnEl = boardEl.createDiv({
				cls: "clawvault-kanban-column",
			});
			columnEl.dataset.status = status;

			const columnHeader = columnEl.createDiv({ cls: "clawvault-kanban-column-header" });
			columnHeader.createSpan({
				text: `${STATUS_ICONS[status]} ${this.getStatusLabel(status)}`,
				cls: "clawvault-kanban-column-title",
			});
			columnHeader.createSpan({
				text: `${tasks.length}`,
				cls: "clawvault-kanban-column-count",
			});

			const columnBody = columnEl.createDiv({ cls: "clawvault-kanban-column-body" });
			columnBody.addEventListener("dragover", (event) => {
				event.preventDefault();
				columnBody.addClass("is-drag-over");
			});
			columnBody.addEventListener("dragleave", () => {
				columnBody.removeClass("is-drag-over");
			});
			columnBody.addEventListener("drop", (event) => {
				event.preventDefault();
				columnBody.removeClass("is-drag-over");
				const taskPath = event.dataTransfer?.getData("text/plain");
				if (taskPath) {
					void this.handleDrop(taskPath, status);
				}
			});

			if (tasks.length === 0) {
				columnBody.createDiv({
					text: "No tasks",
					cls: "clawvault-kanban-empty",
				});
			}

			for (const task of tasks) {
				this.renderTaskCard(columnBody, task);
			}
		}
	}

	private renderFilterBar(): void {
		if (!this.boardContentEl) {
			return;
		}

		const filterBar = this.boardContentEl.createDiv({ cls: "clawvault-board-filter-bar" });
		filterBar.createSpan({ text: "Filter:", cls: "clawvault-board-filter-label" });

		this.renderFilterSelect(
			filterBar,
			"Project",
			this.filters.project,
			this.getFilterValues((task) => task.project),
			(value) => {
				this.filters.project = value;
				this.renderBoard();
			}
		);

		this.renderFilterSelect(
			filterBar,
			"Priority",
			this.filters.priority,
			this.getFilterValues((task) => task.priority),
			(value) => {
				this.filters.priority = value;
				this.renderBoard();
			}
		);

		this.renderFilterSelect(
			filterBar,
			"Owner",
			this.filters.owner,
			this.getFilterValues((task) => task.owner),
			(value) => {
				this.filters.owner = value;
				this.renderBoard();
			}
		);

		const clearBtn = filterBar.createEl("button", {
			text: "Reset",
			cls: "clawvault-board-filter-reset",
		});
		clearBtn.addEventListener("click", () => {
			this.filters = {
				project: ALL_FILTER_VALUE,
				priority: ALL_FILTER_VALUE,
				owner: ALL_FILTER_VALUE,
			};
			this.renderBoard();
		});
	}

	private renderFilterSelect(
		parent: HTMLElement,
		label: string,
		currentValue: string,
		options: string[],
		onChange: (value: string) => void
	): void {
		const wrapper = parent.createDiv({ cls: "clawvault-board-filter-select-wrap" });
		wrapper.createSpan({
			text: `${label}:`,
			cls: "clawvault-board-filter-select-label",
		});

		const selectEl = wrapper.createEl("select", {
			cls: "clawvault-board-filter-select",
		});

		selectEl.createEl("option", {
			text: "All",
			value: ALL_FILTER_VALUE,
		});

		for (const option of options) {
			selectEl.createEl("option", {
				text: option,
				value: option,
			});
		}

		selectEl.value = currentValue;
		selectEl.addEventListener("change", () => {
			onChange(selectEl.value);
		});
	}

	private getFilterValues(selector: (task: TaskBoardCardData) => string): string[] {
		const values = new Set<string>();
		for (const task of this.allTasks) {
			const value = selector(task).trim();
			if (value.length > 0) {
				values.add(value);
			}
		}
		return Array.from(values).sort((a, b) => a.localeCompare(b));
	}

	private getFilteredTasks(): TaskBoardCardData[] {
		return this.allTasks.filter((task) => {
			if (
				this.filters.project !== ALL_FILTER_VALUE &&
				task.project !== this.filters.project
			) {
				return false;
			}
			if (
				this.filters.priority !== ALL_FILTER_VALUE &&
				task.priority !== this.filters.priority
			) {
				return false;
			}
			if (this.filters.owner !== ALL_FILTER_VALUE && task.owner !== this.filters.owner) {
				return false;
			}
			return true;
		});
	}

	private renderTaskCard(parent: HTMLElement, task: TaskBoardCardData): void {
		const cardEl = parent.createDiv({
			cls: `clawvault-task-card clawvault-task-priority-${task.priority}`,
		});
		cardEl.draggable = true;
		cardEl.dataset.path = task.file.path;

		cardEl.addEventListener("dragstart", (event) => {
			event.dataTransfer?.setData("text/plain", task.file.path);
			event.dataTransfer?.setData("text/clawvault-task-status", task.status);
			cardEl.addClass("is-dragging");
		});

		cardEl.addEventListener("dragend", () => {
			cardEl.removeClass("is-dragging");
		});

		cardEl.addEventListener("click", () => {
			void this.app.workspace.openLinkText(task.file.path, "", "tab");
		});

		cardEl.createDiv({
			text: task.title,
			cls: "clawvault-task-card-title",
		});

		const metaLine = cardEl.createDiv({ cls: "clawvault-task-card-meta" });
		metaLine.createSpan({ text: task.project });
		metaLine.createSpan({ text: " · " });
		metaLine.createSpan({
			text: task.priority,
			cls: `clawvault-priority-${task.priority}`,
		});
		if (task.owner !== "unassigned") {
			metaLine.createSpan({ text: " · " });
			metaLine.createSpan({ text: task.owner });
		}

		if (task.status === TASK_STATUS.BLOCKED && task.blockedBy) {
			cardEl.createDiv({
				text: `Blocked by: ${task.blockedBy}`,
				cls: "clawvault-task-card-blocked-by",
			});
		}
	}

	private async handleDrop(taskPath: string, newStatus: TaskStatus): Promise<void> {
		const abstractFile = this.app.vault.getAbstractFileByPath(taskPath);
		if (!(abstractFile instanceof TFile)) {
			return;
		}

		const task = this.allTasks.find((item) => item.file.path === taskPath);
		if (!task || task.status === newStatus) {
			return;
		}

		try {
			await this.app.vault.process(abstractFile, (content) =>
				this.updateStatusInFrontmatter(content, newStatus)
			);
			task.status = newStatus;
			this.renderBoard();
			new Notice(`Task moved to ${this.getStatusLabel(newStatus)}`);
		} catch (error) {
			console.error("ClawVault: Failed to update task status from board", error);
			new Notice("Could not update task status");
		}
	}

	private updateStatusInFrontmatter(content: string, status: TaskStatus): string {
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (!frontmatterMatch) {
			return `---\nstatus: ${status}\n---\n\n${content}`;
		}

		const fullFrontmatter = frontmatterMatch[0];
		const body = frontmatterMatch[1] ?? "";
		const bodyLines = body.split("\n");
		let updated = false;

		const newBodyLines = bodyLines.map((line) => {
			if (/^status\s*:/i.test(line)) {
				updated = true;
				return `status: ${status}`;
			}
			return line;
		});

		if (!updated) {
			newBodyLines.push(`status: ${status}`);
		}

		const newFrontmatter = `---\n${newBodyLines.join("\n")}\n---`;
		return content.replace(fullFrontmatter, newFrontmatter);
	}

	private getStatusLabel(status: TaskStatus): string {
		switch (status) {
			case TASK_STATUS.OPEN:
				return "Open";
			case TASK_STATUS.IN_PROGRESS:
				return "In progress";
			case TASK_STATUS.BLOCKED:
				return "Blocked";
			case TASK_STATUS.DONE:
				return "Done";
			default:
				return status;
		}
	}

	private renderError(error: unknown): void {
		if (!this.boardContentEl) {
			return;
		}
		this.boardContentEl.empty();
		const errorEl = this.boardContentEl.createDiv({ cls: "clawvault-status-error" });
		errorEl.createEl("h4", { text: "Task board unavailable" });
		errorEl.createEl("p", {
			text: error instanceof Error ? error.message : "Unknown error",
			cls: "clawvault-error-details",
		});
	}
}
