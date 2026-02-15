/**
 * Conflict resolution for sync operations.
 */

import type { ConflictStrategy, SyncConflict, SyncFileAction } from "./sync-types";

export interface ResolvedConflictAction {
	action: SyncFileAction;
	preserveLocalCopy: boolean;
}

export class SyncResolver {
	private readonly isMobile: boolean;

	constructor(isMobile: boolean) {
		this.isMobile = isMobile;
	}

	resolve(conflict: SyncConflict, strategy: ConflictStrategy): ResolvedConflictAction {
		const effectiveStrategy =
			strategy === "ask" && this.isMobile ? "newest-wins" : strategy;

		switch (effectiveStrategy) {
			case "remote-wins":
				return {
					action: this.createPullAction(conflict, "conflict: remote wins"),
					preserveLocalCopy: false,
				};
			case "local-wins":
				return {
					action: this.createPushAction(conflict, "conflict: local wins"),
					preserveLocalCopy: false,
				};
			case "keep-both":
				return {
					action: this.createPullAction(conflict, "conflict: keep both"),
					preserveLocalCopy: true,
				};
			case "ask":
				// Modal-based conflict prompts are not implemented yet.
				// Fall back to newest-wins for now.
				return this.resolve(conflict, "newest-wins");
			case "newest-wins":
			default:
				return this.resolveNewest(conflict);
		}
	}

	private resolveNewest(conflict: SyncConflict): ResolvedConflictAction {
		const remoteTime = Date.parse(conflict.remoteModified);
		const localTime = conflict.localModified;

		if (Number.isFinite(remoteTime) && remoteTime > localTime) {
			return {
				action: this.createPullAction(conflict, "conflict: remote newer"),
				preserveLocalCopy: false,
			};
		}

		return {
			action: this.createPushAction(conflict, "conflict: local newer"),
			preserveLocalCopy: false,
		};
	}

	private createPullAction(conflict: SyncConflict, reason: string): SyncFileAction {
		return {
			path: conflict.path,
			direction: "pull",
			reason,
			localModified: conflict.localModified,
			remoteModified: conflict.remoteModified,
			size: conflict.remoteSize,
		};
	}

	private createPushAction(conflict: SyncConflict, reason: string): SyncFileAction {
		return {
			path: conflict.path,
			direction: "push",
			reason,
			localModified: conflict.localModified,
			remoteModified: conflict.remoteModified,
			size: conflict.localSize,
		};
	}
}

