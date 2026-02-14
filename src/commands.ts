/**
 * ClawVault Commands
 * Command palette registrations
 */

import { Notice, Platform, TFile, TFolder } from "obsidian";
import type ClawVaultPlugin from "./main";
import { generateCanvasTemplate } from "./canvas-templates";
import { openGeneratedCanvasPreview } from "./canvas-preview";
import { COMMAND_IDS, STATUS_VIEW_TYPE, TASK_BOARD_VIEW_TYPE } from "./constants";
import {
	BlockedModal,
	CaptureModal,
	OpenLoopsModal,
	TaskModal,
	TemplateModal,
} from "./modals";
import type { TemplateModalResult } from "./modals/template-modal";

/**
 * Register all ClawVault commands
 */
export function registerCommands(plugin: ClawVaultPlugin): void {
	// Generate Dashboard command
	plugin.addCommand({
		id: COMMAND_IDS.GENERATE_DASHBOARD,
		name: "ClawVault: Generate Dashboard",
		callback: () => {
			void generateDashboard(plugin);
		},
	});

	// Quick Capture command
	plugin.addCommand({
		id: COMMAND_IDS.QUICK_CAPTURE,
		name: "ClawVault: Quick Capture",
		hotkeys: [{ modifiers: ["Ctrl", "Shift"], key: "c" }],
		callback: () => {
			new CaptureModal(plugin.app).open();
		},
	});

	// Add Task command
	plugin.addCommand({
		id: COMMAND_IDS.ADD_TASK,
		name: "ClawVault: Add Task",
		hotkeys: [{ modifiers: ["Ctrl", "Shift"], key: "t" }],
		callback: () => {
			new TaskModal(plugin.app).open();
		},
	});

	// View Blocked command
	plugin.addCommand({
		id: COMMAND_IDS.VIEW_BLOCKED,
		name: "ClawVault: View Blocked Tasks",
		callback: () => {
			new BlockedModal(plugin.app, plugin.vaultReader).open();
		},
	});

	// Open Status Panel command
	plugin.addCommand({
		id: COMMAND_IDS.OPEN_STATUS_PANEL,
		name: "ClawVault: Open Status Panel",
		callback: () => {
			void activateStatusView(plugin);
		},
	});

	// Open Task Board command
	plugin.addCommand({
		id: COMMAND_IDS.OPEN_TASK_BOARD,
		name: "ClawVault: Open Task Board",
		callback: () => {
			void activateTaskBoardView(plugin);
		},
	});

	// Generate Canvas from Template command
	plugin.addCommand({
		id: COMMAND_IDS.GENERATE_CANVAS_FROM_TEMPLATE,
		name: "ClawVault: Generate Canvas from Template",
		callback: () => {
			new TemplateModal(plugin.app, async (result) => {
				await generateCanvasFromTemplate(plugin, result);
			}).open();
		},
	});

	// Force Refresh Stats command
	plugin.addCommand({
		id: COMMAND_IDS.REFRESH_STATS,
		name: "ClawVault: Refresh Stats",
		callback: () => {
			void plugin.refreshAll();
		},
	});

	// Show Open Loops command
	plugin.addCommand({
		id: COMMAND_IDS.SHOW_OPEN_LOOPS,
		name: "ClawVault: Show Open Loops",
		callback: () => {
			new OpenLoopsModal(plugin.app, plugin.vaultReader).open();
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

async function generateCanvasFromTemplate(
	plugin: ClawVaultPlugin,
	result: TemplateModalResult
): Promise<void> {
	new Notice("Generating canvas...");

	try {
		const tasks = await plugin.vaultReader.getAllTasks();
		const graphIndex = await plugin.vaultReader.readGraphIndex();
		const stats = await plugin.vaultReader.getVaultStats();
		const openLoops = await plugin.vaultReader.getOpenLoops(7);
		const decisionFiles = plugin.vaultReader.getRecentDecisionFiles(result.dateRangeDays, 12);
		const allFiles = plugin.app.vault.getMarkdownFiles();
		const vaultPath =
			plugin.settings.vaultPathOverride ||
			(plugin.app.vault.adapter as { basePath?: string }).basePath ||
			plugin.app.vault.getName();

		const canvasData = generateCanvasTemplate(result.templateId, vaultPath, {
			project: result.projectFilter,
			dateRangeDays: result.dateRangeDays,
			tasks,
			graphIndex,
			vaultName: stats.vaultName,
			allFiles,
			decisionFiles,
			openLoops,
			stats,
		});

		const dashboardsFolder = "dashboards";
		await ensureFolderExists(plugin, dashboardsFolder);
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		const filePath = `${dashboardsFolder}/${result.templateId}-${timestamp}.canvas`;
		await plugin.app.vault.create(filePath, JSON.stringify(canvasData, null, 2));

		await openGeneratedCanvasPreview(plugin.app, filePath);
	} catch (error) {
		console.error("ClawVault: Canvas generation failed", error);
		new Notice(
			error instanceof Error
				? `Canvas generation failed: ${error.message}`
				: "Canvas generation failed."
		);
	}
}

async function ensureFolderExists(plugin: ClawVaultPlugin, folderPath: string): Promise<void> {
	const existing = plugin.app.vault.getAbstractFileByPath(folderPath);
	if (existing instanceof TFolder) {
		return;
	}
	if (existing instanceof TFile) {
		throw new Error(`Cannot create folder "${folderPath}" because a file already exists.`);
	}
	await plugin.app.vault.createFolder(folderPath);
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

async function activateTaskBoardView(plugin: ClawVaultPlugin): Promise<void> {
	const { workspace } = plugin.app;
	let leaf = workspace.getLeavesOfType(TASK_BOARD_VIEW_TYPE)[0];

	if (!leaf) {
		const rightLeaf = workspace.getRightLeaf(false);
		if (rightLeaf) {
			await rightLeaf.setViewState({
				type: TASK_BOARD_VIEW_TYPE,
				active: true,
			});
			leaf = rightLeaf;
		}
	}

	if (leaf) {
		await workspace.revealLeaf(leaf);
	}
}
