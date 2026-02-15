/**
 * Shared sync section renderer for the status sidebar.
 */

import type { SyncRuntimeState } from "./sync-types";

export interface SyncStatusViewActions {
	onSyncNow: () => void;
	onConfigure: () => void;
	onRetry: () => void;
}

export function renderSyncStatusSection(
	parent: HTMLElement,
	state: SyncRuntimeState,
	actions: SyncStatusViewActions
): HTMLElement {
	const section = parent.createDiv({
		cls: "clawvault-status-section clawvault-sync-section",
	});

	section.createEl("h4", { text: state.status === "syncing" ? "🔄 Syncing..." : "🔄 Sync" });
	section.createDiv({
		text: `Server: ${formatServerState(state.serverUrl, state.status)}`,
		cls: "clawvault-sync-server",
	});

	section.createDiv({
		text: `Last sync: ${formatLastSync(state.lastSyncTimestamp)}`,
		cls: "clawvault-sync-last",
	});

	if (state.progress) {
		const progress = state.progress;
		const detail = progress.total > 0
			? `${progress.current}/${progress.total}`
			: "running";
		const progressText = progress.message
			? `${progress.message}`
			: `${capitalize(progress.stage)} ${detail}`;
		section.createDiv({
			text: progressText,
			cls: "clawvault-sync-progress",
		});
	} else if (state.lastSyncStats) {
		section.createDiv({
			text: `↓ ${state.lastSyncStats.pulled} pulled · ↑ ${state.lastSyncStats.pushed} pushed · ⚡ ${state.lastSyncStats.conflicts} conflicts`,
			cls: "clawvault-sync-summary",
		});
	} else if (state.message) {
		section.createDiv({
			text: state.message,
			cls: "clawvault-sync-message",
		});
	}

	const actionsRow = section.createDiv({ cls: "clawvault-sync-actions" });
	if (state.status === "disconnected" || state.status === "error") {
		const retryButton = actionsRow.createEl("button", {
			text: "Retry",
			cls: "clawvault-sync-action-btn",
		});
		retryButton.addEventListener("click", () => actions.onRetry());

		const configureButton = actionsRow.createEl("button", {
			text: "Configure",
			cls: "clawvault-sync-action-btn",
		});
		configureButton.addEventListener("click", () => actions.onConfigure());
	} else {
		const syncNowButton = actionsRow.createEl("button", {
			text: state.status === "syncing" ? "Syncing..." : "Sync now",
			cls: "clawvault-sync-action-btn",
		});
		syncNowButton.disabled = state.status === "syncing";
		syncNowButton.addEventListener("click", () => actions.onSyncNow());

		const configureButton = actionsRow.createEl("button", {
			text: "Configure",
			cls: "clawvault-sync-action-btn",
		});
		configureButton.addEventListener("click", () => actions.onConfigure());
	}

	return section;
}

function formatServerState(serverUrl: string, status: SyncRuntimeState["status"]): string {
	if (!serverUrl.trim()) {
		return "not configured";
	}

	const withoutProtocol = serverUrl.replace(/^https?:\/\//, "");
	if (status === "disconnected" || status === "error") {
		return `${withoutProtocol} ❌`;
	}

	return `${withoutProtocol} ✅`;
}

function formatLastSync(timestamp: number): string {
	if (!timestamp || timestamp <= 0) {
		return "never";
	}

	const diffMs = Date.now() - timestamp;
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMins / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffMins < 1) return "just now";
	if (diffMins < 60) return `${diffMins} min ago`;
	if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
	if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
	return new Date(timestamp).toLocaleString();
}

function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

