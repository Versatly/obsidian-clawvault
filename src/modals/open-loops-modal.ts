/**
 * Open Loops Modal
 * Lists aging non-completed tasks (> 7 days old)
 */

import { App, Modal } from "obsidian";
import type { ParsedTask, VaultReader } from "../vault-reader";

export class OpenLoopsModal extends Modal {
	private vaultReader: VaultReader;

	constructor(app: App, vaultReader: VaultReader) {
		super(app);
		this.vaultReader = vaultReader;
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("clawvault-open-loops-modal");
		contentEl.createEl("h2", { text: "Open loops" });

		const loadingEl = contentEl.createDiv({ cls: "clawvault-loading" });
		loadingEl.setText("Loading open loops...");

		try {
			const openLoops = await this.vaultReader.getOpenLoops(7);
			loadingEl.remove();
			this.renderOpenLoops(openLoops);
		} catch (error) {
			loadingEl.remove();
			contentEl.createEl("p", {
				text:
					error instanceof Error
						? `Failed to load open loops: ${error.message}`
						: "Failed to load open loops.",
				cls: "clawvault-error-details",
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderOpenLoops(tasks: ParsedTask[]): void {
		const { contentEl } = this;

		if (tasks.length === 0) {
			const emptyState = contentEl.createDiv({ cls: "clawvault-empty-state" });
			emptyState.createEl("p", { text: "No open loops older than 7 days." });
		} else {
			const summary = contentEl.createDiv({ cls: "clawvault-blocked-summary" });
			summary.setText(
				`${tasks.length} open task${tasks.length === 1 ? "" : "s"} older than 7 days`
			);

			const listEl = contentEl.createDiv({ cls: "clawvault-blocked-list" });
			for (const task of tasks) {
				const itemEl = listEl.createDiv({ cls: "clawvault-blocked-item clawvault-open-loop-item" });
				const ageDays = this.getAgeInDays(task.createdAt ?? new Date(task.file.stat.ctime));

				const titleLink = itemEl.createEl("a", {
					text: task.frontmatter.title ?? task.file.basename,
					cls: "clawvault-blocked-link",
				});
				titleLink.addEventListener("click", (event) => {
					event.preventDefault();
					this.close();
					void this.app.workspace.openLinkText(task.file.path, "", "tab");
				});

				const meta = itemEl.createDiv({ cls: "clawvault-blocked-meta" });
				meta.createSpan({ text: `Status: ${task.status}` });
				if (task.frontmatter.project) {
					meta.createSpan({ text: `Project: ${task.frontmatter.project}` });
				}
				meta.createSpan({ text: `${ageDays}d open`, cls: "clawvault-open-loop-age" });
			}
		}

		const actionsEl = contentEl.createDiv({ cls: "clawvault-modal-buttons" });
		actionsEl.createEl("button", {
			text: "Close",
			cls: "mod-cta",
		}).addEventListener("click", () => this.close());
	}

	private getAgeInDays(createdAt: Date): number {
		const diff = Date.now() - createdAt.getTime();
		return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
	}
}
