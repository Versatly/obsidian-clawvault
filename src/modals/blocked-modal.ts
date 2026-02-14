/**
 * Blocked Tasks Modal
 * Modal for viewing all blocked tasks
 */

import { App, Modal, TFile } from "obsidian";
import type { VaultReader, TaskFrontmatter } from "../vault-reader";

interface BlockedTask {
	file: TFile;
	frontmatter: TaskFrontmatter;
}

/**
 * Modal for viewing blocked tasks
 */
export class BlockedModal extends Modal {
	private vaultReader: VaultReader;

	constructor(app: App, vaultReader: VaultReader) {
		super(app);
		this.vaultReader = vaultReader;
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.addClass("clawvault-blocked-modal");

		contentEl.createEl("h2", { text: "⊘ Blocked tasks" });

		// Show loading state
		const loadingEl = contentEl.createDiv({ cls: "clawvault-loading" });
		loadingEl.setText("Loading blocked tasks...");

		try {
			const blockedTasks = await this.vaultReader.getBlockedTasks();
			loadingEl.remove();

			if (blockedTasks.length === 0) {
				this.renderEmptyState();
			} else {
				this.renderBlockedTasks(blockedTasks);
			}
		} catch (error) {
			loadingEl.remove();
			this.renderError(error);
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * Render empty state when no blocked tasks
	 */
	private renderEmptyState(): void {
		const { contentEl } = this;
		const emptyEl = contentEl.createDiv({ cls: "clawvault-empty-state" });
		emptyEl.createEl("p", { text: "No blocked tasks found." });
		emptyEl.createEl("p", {
			text: "Tasks with status: blocked will appear here.",
			cls: "clawvault-empty-hint",
		});
	}

	/**
	 * Render the list of blocked tasks
	 */
	private renderBlockedTasks(tasks: BlockedTask[]): void {
		const { contentEl } = this;

		const summary = contentEl.createDiv({ cls: "clawvault-blocked-summary" });
		summary.setText(`${tasks.length} blocked task${tasks.length === 1 ? "" : "s"}`);

		const listEl = contentEl.createDiv({ cls: "clawvault-blocked-list" });

		for (const task of tasks) {
			const taskEl = listEl.createDiv({ cls: "clawvault-blocked-item" });

			// Task title/name
			const titleEl = taskEl.createDiv({ cls: "clawvault-blocked-title" });
			const titleLink = titleEl.createEl("a", {
				text: task.frontmatter.title ?? task.file.basename,
				cls: "clawvault-blocked-link",
			});
			titleLink.addEventListener("click", (e) => {
				e.preventDefault();
				this.close();
				void this.app.workspace.openLinkText(task.file.path, "", true);
			});

			// Task metadata
			const metaEl = taskEl.createDiv({ cls: "clawvault-blocked-meta" });

			if (task.frontmatter.project) {
				metaEl.createSpan({
					text: `Project: ${task.frontmatter.project}`,
					cls: "clawvault-blocked-project",
				});
			}

			if (task.frontmatter.priority) {
				const priorityClass = `clawvault-priority-${task.frontmatter.priority}`;
				metaEl.createSpan({
					text: `Priority: ${task.frontmatter.priority}`,
					cls: `clawvault-blocked-priority ${priorityClass}`,
				});
			}

			// Blocked by info
			if (task.frontmatter.blocked_by) {
				const blockedBy = Array.isArray(task.frontmatter.blocked_by)
					? task.frontmatter.blocked_by.join(", ")
					: task.frontmatter.blocked_by;
				
				const blockedByEl = taskEl.createDiv({ cls: "clawvault-blocked-by" });
				blockedByEl.createSpan({ text: "Blocked by: " });
				blockedByEl.createSpan({
					text: blockedBy,
					cls: "clawvault-blocked-by-value",
				});
			}

			// Due date if present
			if (task.frontmatter.due) {
				const dueEl = taskEl.createDiv({ cls: "clawvault-blocked-due" });
				dueEl.setText(`Due: ${task.frontmatter.due}`);
			}

			// Parent task
			if (task.frontmatter.parent) {
				const parentEl = taskEl.createDiv({ cls: "clawvault-blocked-parent" });
				parentEl.createSpan({ text: "Parent: " });
				parentEl.createSpan({
					text: task.frontmatter.parent,
					cls: "clawvault-blocked-parent-value",
				});
			}

			// Dependencies
			if (task.frontmatter.depends_on && task.frontmatter.depends_on.length > 0) {
				const depsEl = taskEl.createDiv({ cls: "clawvault-blocked-depends" });
				depsEl.createSpan({ text: "Depends on: " });
				depsEl.createSpan({
					text: task.frontmatter.depends_on.join(", "),
					cls: "clawvault-blocked-depends-value",
				});
			}

			// Estimate
			if (task.frontmatter.estimate) {
				const estEl = taskEl.createDiv({ cls: "clawvault-blocked-estimate" });
				estEl.setText(`Estimate: ${task.frontmatter.estimate}`);
			}

			// Description
			if (task.frontmatter.description) {
				const descEl = taskEl.createDiv({ cls: "clawvault-blocked-description" });
				descEl.setText(task.frontmatter.description);
			}
		}

		// Close button
		const buttonContainer = contentEl.createDiv({ cls: "clawvault-modal-buttons" });
		const closeBtn = buttonContainer.createEl("button", {
			text: "Close",
			cls: "mod-cta",
		});
		closeBtn.addEventListener("click", () => this.close());
	}

	/**
	 * Render error state
	 */
	private renderError(error: unknown): void {
		const { contentEl } = this;
		const errorEl = contentEl.createDiv({ cls: "clawvault-error" });
		errorEl.createEl("p", { text: "Failed to load blocked tasks." });
		errorEl.createEl("p", {
			text: error instanceof Error ? error.message : "Unknown error",
			cls: "clawvault-error-details",
		});
	}
}
