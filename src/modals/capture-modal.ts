/**
 * Quick Capture Modal
 * Modal for quickly capturing notes to inbox
 */

import { App, Modal, Notice, Setting } from "obsidian";
import { DEFAULT_FOLDERS } from "../constants";

/**
 * Modal for quick capture to inbox
 */
export class CaptureModal extends Modal {
	private content = "";
	private title = "";

	constructor(app: App) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("clawvault-capture-modal");

		contentEl.createEl("h2", { text: "Quick capture" });

		// Title input
		new Setting(contentEl)
			.setName("Title")
			.setDesc("Optional title for the capture")
			.addText((text) =>
				text
					.setPlaceholder("Untitled capture")
					.onChange((value) => {
						this.title = value;
					})
			);

		// Content textarea
		const contentSetting = new Setting(contentEl)
			.setName("Content")
			.setDesc("What do you want to capture?");

		const textareaContainer = contentSetting.controlEl.createDiv();
		const textarea = textareaContainer.createEl("textarea", {
			cls: "clawvault-capture-textarea",
			attr: {
				placeholder: "Enter your note here...",
				rows: "6",
			},
		});
		textarea.addEventListener("input", (e) => {
			this.content = (e.target as HTMLTextAreaElement).value;
		});

		// Focus the textarea
		setTimeout(() => textarea.focus(), 50);

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: "clawvault-modal-buttons" });
		
		const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());

		const saveBtn = buttonContainer.createEl("button", {
			text: "Save to inbox",
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
	 * Save the capture to inbox
	 */
	private async save(): Promise<void> {
		if (!this.content.trim()) {
			new Notice("Please enter some content to capture.");
			return;
		}

		try {
			// Generate filename
			const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
			const title = this.title.trim() || "capture";
			const sanitizedTitle = title.replace(/[\\/:*?"<>|]/g, "-").slice(0, 50);
			const filename = `${timestamp}-${sanitizedTitle}.md`;
			const filepath = `${DEFAULT_FOLDERS.INBOX}/${filename}`;

			// Create frontmatter
			const frontmatter = [
				"---",
				`created: ${new Date().toISOString()}`,
				`type: capture`,
				this.title ? `title: "${this.title}"` : null,
				"---",
			]
				.filter(Boolean)
				.join("\n");

			// Create file content
			const fileContent = `${frontmatter}\n\n${this.content}`;

			// Ensure inbox folder exists
			const inboxFolder = this.app.vault.getAbstractFileByPath(DEFAULT_FOLDERS.INBOX);
			if (!inboxFolder) {
				await this.app.vault.createFolder(DEFAULT_FOLDERS.INBOX);
			}

			// Create the file
			await this.app.vault.create(filepath, fileContent);

			new Notice(`Captured to ${filepath}`);
			this.close();
		} catch (error) {
			console.error("ClawVault: Failed to save capture:", error);
			new Notice("Failed to save capture. Check console for details.");
		}
	}
}
