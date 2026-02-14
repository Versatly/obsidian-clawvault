/**
 * Add Task Modal
 * Modal for creating new tasks
 */

import { App, Modal, Notice, Setting } from "obsidian";
import { DEFAULT_FOLDERS, TASK_PRIORITY, TASK_STATUS, TaskPriority } from "../constants";

/**
 * Modal for adding new tasks
 */
export class TaskModal extends Modal {
	private title = "";
	private project = "";
	private priority: TaskPriority = TASK_PRIORITY.MEDIUM;
	private description = "";

	constructor(app: App) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("clawvault-task-modal");

		contentEl.createEl("h2", { text: "Add task" });

		// Title input (required)
		new Setting(contentEl)
			.setName("Title")
			.setDesc("Task title (required)")
			.addText((text) =>
				text
					.setPlaceholder("Enter task title")
					.onChange((value) => {
						this.title = value;
					})
			);

		// Project input
		new Setting(contentEl)
			.setName("Project")
			.setDesc("Associated project (optional)")
			.addText((text) =>
				text
					.setPlaceholder("e.g., my-project")
					.onChange((value) => {
						this.project = value;
					})
			);

		// Priority dropdown
		new Setting(contentEl)
			.setName("Priority")
			.setDesc("Task priority level")
			.addDropdown((dropdown) =>
				dropdown
					.addOption(TASK_PRIORITY.CRITICAL, "Critical")
					.addOption(TASK_PRIORITY.HIGH, "High")
					.addOption(TASK_PRIORITY.MEDIUM, "Medium")
					.addOption(TASK_PRIORITY.LOW, "Low")
					.setValue(this.priority)
					.onChange((value) => {
						this.priority = value as TaskPriority;
					})
			);

		// Description textarea
		const descSetting = new Setting(contentEl)
			.setName("Description")
			.setDesc("Task description (optional)");

		const textareaContainer = descSetting.controlEl.createDiv();
		const textarea = textareaContainer.createEl("textarea", {
			cls: "clawvault-task-textarea",
			attr: {
				placeholder: "Enter task description...",
				rows: "4",
			},
		});
		textarea.addEventListener("input", (e) => {
			this.description = (e.target as HTMLTextAreaElement).value;
		});

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: "clawvault-modal-buttons" });

		const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());

		const saveBtn = buttonContainer.createEl("button", {
			text: "Create task",
			cls: "mod-cta",
		});
		saveBtn.addEventListener("click", () => {
			void this.save();
		});

		// Handle Enter key (Ctrl/Cmd + Enter to save)
		contentEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				void this.save();
			}
			if (e.key === "Escape") {
				this.close();
			}
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * Save the task
	 */
	private async save(): Promise<void> {
		if (!this.title.trim()) {
			new Notice("Please enter a task title.");
			return;
		}

		try {
			// Generate filename from title
			const sanitizedTitle = this.title
				.trim()
				.toLowerCase()
				.replace(/[\\/:*?"<>|]/g, "-")
				.replace(/\s+/g, "-")
				.slice(0, 50);
			const timestamp = Date.now();
			const filename = `${sanitizedTitle}-${timestamp}.md`;
			const filepath = `${DEFAULT_FOLDERS.TASKS}/${filename}`;

			// Create frontmatter
			const frontmatterLines = [
				"---",
				`title: "${this.title}"`,
				`status: ${TASK_STATUS.OPEN}`,
				`priority: ${this.priority}`,
				`created: ${new Date().toISOString()}`,
			];

			if (this.project.trim()) {
				frontmatterLines.push(`project: "${this.project.trim()}"`);
			}

			frontmatterLines.push("---");
			const frontmatter = frontmatterLines.join("\n");

			// Create file content
			let fileContent = `${frontmatter}\n\n# ${this.title}\n`;
			if (this.description.trim()) {
				fileContent += `\n${this.description}\n`;
			}

			// Ensure tasks folder exists
			const tasksFolder = this.app.vault.getAbstractFileByPath(DEFAULT_FOLDERS.TASKS);
			if (!tasksFolder) {
				await this.app.vault.createFolder(DEFAULT_FOLDERS.TASKS);
			}

			// Create the file
			const file = await this.app.vault.create(filepath, fileContent);

			new Notice(`Task created: ${this.title}`);
			this.close();

			// Open the new task file
			await this.app.workspace.openLinkText(file.path, "", true);
		} catch (error) {
			console.error("ClawVault: Failed to create task:", error);
			new Notice("Failed to create task. Check console for details.");
		}
	}
}
