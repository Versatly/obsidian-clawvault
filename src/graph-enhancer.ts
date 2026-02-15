/**
 * ClawVault Graph Enhancer
 * Applies dynamic graph coloring and node sizing based on metadata
 */

import { TFile } from "obsidian";
import type ClawVaultPlugin from "./main";
import { DEFAULT_CATEGORY_COLORS } from "./constants";

export class GraphEnhancer {
	private plugin: ClawVaultPlugin;
	private observer: MutationObserver | null = null;
	private refreshTimerId: number | null = null;

	constructor(plugin: ClawVaultPlugin) {
		this.plugin = plugin;
	}

	initialize(): void {
		this.applyCategoryVariables();
		this.setupObserver();
		this.registerEventHandlers();
		this.scheduleEnhance();
	}

	cleanup(): void {
		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}
		if (this.refreshTimerId !== null) {
			window.clearTimeout(this.refreshTimerId);
			this.refreshTimerId = null;
		}
	}

	applyCategoryVariables(): void {
		const root = document.documentElement;
		const mergedColors = Object.assign(
			{},
			DEFAULT_CATEGORY_COLORS,
			this.plugin.settings.categoryColors
		);

		for (const [category, color] of Object.entries(mergedColors)) {
			root.style.setProperty(`--clawvault-color-${category}`, color);
		}
	}

	scheduleEnhance(delayMs = 120): void {
		if (this.refreshTimerId !== null) {
			window.clearTimeout(this.refreshTimerId);
		}
		this.refreshTimerId = window.setTimeout(() => {
			this.refreshTimerId = null;
			this.enhanceOpenGraphViews();
		}, delayMs);
	}

	private setupObserver(): void {
		this.observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (
					mutation.type === "childList" &&
					(mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)
				) {
					this.scheduleEnhance(80);
					break;
				}
			}
		});

		this.observer.observe(document.body, {
			childList: true,
			subtree: true,
		});
	}

	private registerEventHandlers(): void {
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("layout-change", () => {
				this.scheduleEnhance(60);
			})
		);

		this.plugin.registerEvent(
			this.plugin.app.workspace.on("active-leaf-change", () => {
				this.scheduleEnhance(60);
			})
		);

		this.plugin.registerEvent(
			this.plugin.app.metadataCache.on("resolved", () => {
				this.scheduleEnhance(90);
			})
		);

		this.plugin.registerEvent(
			this.plugin.app.vault.on("modify", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					this.scheduleEnhance();
				}
			})
		);
	}

	private enhanceOpenGraphViews(): void {
		this.applyCategoryVariables();
		const graphNodes = document.querySelectorAll<HTMLElement>(".graph-view .node");
		for (const graphNode of Array.from(graphNodes)) {
			this.applyMetadataDecoration(graphNode);
		}
	}

	private applyMetadataDecoration(graphNode: HTMLElement): void {
		const path = graphNode.dataset.path;
		if (!path) {
			return;
		}

		const abstractFile = this.plugin.app.vault.getAbstractFileByPath(path);
		if (!(abstractFile instanceof TFile)) {
			return;
		}

		const cache = this.plugin.app.metadataCache.getFileCache(abstractFile);
		const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;

		const category = this.getCategoryFromPathOrFrontmatter(path, frontmatter);
		if (category) {
			graphNode.dataset.category = category;
		}

		const firstTag = this.getFirstTag(frontmatter);
		if (firstTag) {
			graphNode.classList.add("clawvault-node-tagged");
			graphNode.dataset.tag = firstTag;
			graphNode.style.setProperty("--clawvault-tag-color", this.resolveTagColor(firstTag));
		} else {
			graphNode.classList.remove("clawvault-node-tagged");
			graphNode.removeAttribute("data-tag");
			graphNode.style.removeProperty("--clawvault-tag-color");
		}

		const priority = this.getPriority(frontmatter);
		const isCritical = priority === "critical";
		graphNode.classList.toggle("clawvault-node-critical", isCritical);
	}

	private getCategoryFromPathOrFrontmatter(
		path: string,
		frontmatter: Record<string, unknown> | undefined
	): string {
		const frontmatterCategory = frontmatter?.category;
		if (typeof frontmatterCategory === "string" && frontmatterCategory.trim().length > 0) {
			return frontmatterCategory.trim().toLowerCase();
		}
		return path.split("/")[0]?.toLowerCase() ?? "default";
	}

	private getFirstTag(frontmatter: Record<string, unknown> | undefined): string | null {
		const rawTags = frontmatter?.tags;
		if (Array.isArray(rawTags)) {
			for (const tag of rawTags) {
				if (typeof tag === "string" && tag.trim().length > 0) {
					return tag.replace(/^#/, "").trim().toLowerCase();
				}
			}
		}

		if (typeof rawTags === "string" && rawTags.trim().length > 0) {
			const tags = rawTags
				.split(/[,\s]+/)
				.map((tag) => tag.replace(/^#/, "").trim().toLowerCase())
				.filter((tag) => tag.length > 0);
			if (tags.length > 0) {
				return tags[0] ?? null;
			}
		}

		return null;
	}

	private resolveTagColor(tag: string): string {
		const categoryColor = this.plugin.settings.categoryColors[tag];
		if (typeof categoryColor === "string" && categoryColor.trim().length > 0) {
			return categoryColor;
		}

		let hash = 0;
		for (let i = 0; i < tag.length; i++) {
			hash = (hash << 5) - hash + tag.charCodeAt(i);
			hash |= 0;
		}
		const hue = Math.abs(hash) % 360;
		return `hsl(${hue}, 68%, 56%)`;
	}

	private getPriority(frontmatter: Record<string, unknown> | undefined): string {
		const priority = frontmatter?.priority;
		if (typeof priority === "string") {
			return priority.trim().toLowerCase();
		}
		return "";
	}
}
