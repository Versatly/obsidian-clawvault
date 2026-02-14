/**
 * ClawVault File Decorations
 * Visual indicators in the file explorer
 */

import { TFile } from "obsidian";
import type ClawVaultPlugin from "./main";
import { DEFAULT_FOLDERS, STATUS_ICONS, TaskStatus, TASK_STATUS } from "./constants";

/**
 * Manages file explorer decorations
 */
export class FileDecorations {
	private plugin: ClawVaultPlugin;
	private decorationCache: Map<string, string> = new Map();
	private observer: MutationObserver | null = null;

	constructor(plugin: ClawVaultPlugin) {
		this.plugin = plugin;
	}

	/**
	 * Initialize file decorations
	 */
	initialize(): void {
		// Set up mutation observer to watch for file explorer changes
		this.setupObserver();
		
		// Initial decoration pass
		void this.decorateAllFiles();

		// Re-decorate when files change
		this.plugin.registerEvent(
			this.plugin.app.vault.on("modify", (file) => {
				if (file instanceof TFile) {
					void this.decorateFile(file);
				}
			})
		);

		this.plugin.registerEvent(
			this.plugin.app.vault.on("create", (file) => {
				if (file instanceof TFile) {
					setTimeout(() => {
						void this.decorateFile(file);
					}, 100);
				}
			})
		);

		this.plugin.registerEvent(
			this.plugin.app.vault.on("rename", (file, oldPath) => {
				// Clear old decoration
				this.decorationCache.delete(oldPath);
				if (file instanceof TFile) {
					setTimeout(() => {
						void this.decorateFile(file);
					}, 100);
				}
			})
		);
	}

	/**
	 * Clean up decorations
	 */
	cleanup(): void {
		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}
		this.removeAllDecorations();
		this.decorationCache.clear();
	}

	/**
	 * Set up mutation observer for file explorer
	 */
	private setupObserver(): void {
		this.observer = new MutationObserver((mutations) => {
			let shouldRedecorate = false;
			for (const mutation of mutations) {
				if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
					shouldRedecorate = true;
					break;
				}
			}
			if (shouldRedecorate) {
				// Debounce redecorations
				setTimeout(() => {
					void this.decorateAllFiles();
				}, 50);
			}
		});

		// Observe the file explorer container
		const fileExplorer = document.querySelector(".nav-files-container");
		if (fileExplorer) {
			this.observer.observe(fileExplorer, {
				childList: true,
				subtree: true,
			});
		}
	}

	/**
	 * Decorate all files in the explorer
	 */
	async decorateAllFiles(): Promise<void> {
		if (!this.plugin.settings.showFileDecorations) {
			this.removeAllDecorations();
			return;
		}

		const files = this.plugin.app.vault.getMarkdownFiles();
		for (const file of files) {
			await this.decorateFile(file);
		}
	}

	/**
	 * Decorate a single file
	 */
	async decorateFile(file: TFile): Promise<void> {
		if (!this.plugin.settings.showFileDecorations) return;

		const decoration = await this.getDecoration(file);
		if (decoration) {
			this.decorationCache.set(file.path, decoration);
			this.applyDecoration(file.path, decoration);
		}
	}

	/**
	 * Get the decoration for a file
	 */
	private async getDecoration(file: TFile): Promise<string | null> {
		// Check if file is in inbox
		if (this.isInFolder(file, DEFAULT_FOLDERS.INBOX)) {
			return "📥";
		}

		// Check if file is a task
		if (this.isInFolder(file, DEFAULT_FOLDERS.TASKS)) {
			const status = await this.plugin.vaultReader.getTaskStatus(file);
			if (status) {
				return STATUS_ICONS[status] ?? STATUS_ICONS[TASK_STATUS.OPEN];
			}
		}

		return null;
	}

	/**
	 * Check if a file is in a specific folder
	 */
	private isInFolder(file: TFile, folderPath: string): boolean {
		return file.path.startsWith(folderPath + "/") || file.parent?.path === folderPath;
	}

	/**
	 * Apply decoration to file explorer element
	 */
	private applyDecoration(filePath: string, decoration: string): void {
		// Find the file element in the explorer
		const fileElements = document.querySelectorAll(
			`.nav-file-title[data-path="${CSS.escape(filePath)}"]`
		);

		fileElements.forEach((element) => {
			// Remove existing decoration
			const existingDecoration = element.querySelector(".clawvault-decoration");
			if (existingDecoration) {
				existingDecoration.remove();
			}

			// Add new decoration
			const decorationEl = document.createElement("span");
			decorationEl.className = "clawvault-decoration";
			decorationEl.textContent = decoration;
			decorationEl.setAttribute("aria-label", this.getDecorationLabel(decoration));

			// Insert at the beginning of the title
			element.insertBefore(decorationEl, element.firstChild);
		});
	}

	/**
	 * Get accessible label for decoration
	 */
	private getDecorationLabel(decoration: string): string {
		switch (decoration) {
			case "📥":
				return "Inbox item";
			case STATUS_ICONS[TASK_STATUS.OPEN]:
				return "Open task";
			case STATUS_ICONS[TASK_STATUS.IN_PROGRESS]:
				return "Active task";
			case STATUS_ICONS[TASK_STATUS.BLOCKED]:
				return "Blocked task";
			case STATUS_ICONS[TASK_STATUS.DONE]:
				return "Completed task";
			default:
				return "";
		}
	}

	/**
	 * Remove all decorations
	 */
	private removeAllDecorations(): void {
		const decorations = document.querySelectorAll(".clawvault-decoration");
		decorations.forEach((decoration) => {
			decoration.remove();
		});
	}
}
