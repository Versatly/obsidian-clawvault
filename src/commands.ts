/**
 * ClawVault Commands
 * Command palette registrations
 */

import { Notice, Platform, TFile } from "obsidian";
import type ClawVaultPlugin from "./main";
import { COMMAND_IDS, STATUS_VIEW_TYPE } from "./constants";
import { CaptureModal, TaskModal, BlockedModal } from "./modals";

/**
 * Register all ClawVault commands
 */
export function registerCommands(plugin: ClawVaultPlugin): void {
	// Generate Dashboard command
	plugin.addCommand({
		id: COMMAND_IDS.GENERATE_DASHBOARD,
		name: "Generate dashboard",
		callback: () => {
			void generateDashboard(plugin);
		},
	});

	// Quick Capture command
	plugin.addCommand({
		id: COMMAND_IDS.QUICK_CAPTURE,
		name: "Quick capture",
		callback: () => {
			new CaptureModal(plugin.app).open();
		},
	});

	// Add Task command
	plugin.addCommand({
		id: COMMAND_IDS.ADD_TASK,
		name: "Add task",
		callback: () => {
			new TaskModal(plugin.app).open();
		},
	});

	// View Blocked command
	plugin.addCommand({
		id: COMMAND_IDS.VIEW_BLOCKED,
		name: "View blocked tasks",
		callback: () => {
			new BlockedModal(plugin.app, plugin.vaultReader).open();
		},
	});

	// Open Status Panel command
	plugin.addCommand({
		id: COMMAND_IDS.OPEN_STATUS_PANEL,
		name: "Open status panel",
		callback: () => {
			void activateStatusView(plugin);
		},
	});
}

/**
 * Generate dashboard using ClawVault CLI
 */
async function generateDashboard(plugin: ClawVaultPlugin): Promise<void> {
	// Check if we're on mobile
	if (Platform.isMobile) {
		new Notice("Dashboard generation requires the ClawVault CLI (desktop only)");
		return;
	}

	new Notice("Generating dashboard...");

	try {
		// Dynamic import for Node.js modules (desktop only)
		const childProcess = await import("child_process");
		const util = await import("util");
		const execAsync = util.promisify(childProcess.exec);

		// Get vault path
		const vaultPath = plugin.settings.vaultPathOverride || 
			(plugin.app.vault.adapter as { basePath?: string }).basePath;

		if (!vaultPath) {
			new Notice("Could not determine vault path");
			return;
		}

		// Run clawvault canvas command
		const { stdout, stderr } = await execAsync("clawvault canvas", {
			cwd: vaultPath,
			timeout: 30000,
		});

		if (stderr && !stderr.includes("warning")) {
			console.warn("ClawVault CLI stderr:", stderr);
		}

		// Try to find and open the generated canvas file
		const canvasMatch = stdout.match(/Created:\s*(.+\.canvas)/i) ||
			stdout.match(/(.+\.canvas)/);
		
		if (canvasMatch?.[1]) {
			const canvasPath = canvasMatch[1].trim();
			const file = plugin.app.vault.getAbstractFileByPath(canvasPath);
			if (file instanceof TFile) {
				await plugin.app.workspace.openLinkText(file.path, "", true);
				new Notice("Dashboard generated successfully");
			} else {
				new Notice(`Dashboard generated: ${canvasPath}`);
			}
		} else {
			new Notice("Dashboard generated successfully");
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		
		if (errorMessage.includes("ENOENT") || errorMessage.includes("not found")) {
			new Notice("ClawVault CLI not found. Install with: npm i -g clawvault");
		} else {
			console.error("ClawVault: Dashboard generation failed:", error);
			new Notice(`Dashboard generation failed: ${errorMessage}`);
		}
	}
}

/**
 * Activate the status view in the right sidebar
 */
async function activateStatusView(plugin: ClawVaultPlugin): Promise<void> {
	const { workspace } = plugin.app;

	// Check if view is already open
	let leaf = workspace.getLeavesOfType(STATUS_VIEW_TYPE)[0];

	if (!leaf) {
		// Create new leaf in right sidebar
		const rightLeaf = workspace.getRightLeaf(false);
		if (rightLeaf) {
			await rightLeaf.setViewState({
				type: STATUS_VIEW_TYPE,
				active: true,
			});
			leaf = rightLeaf;
		}
	}

	// Reveal the leaf
	if (leaf) {
		await workspace.revealLeaf(leaf);
	}
}
