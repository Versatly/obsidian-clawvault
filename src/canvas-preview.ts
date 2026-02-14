/**
 * Canvas preview helper
 * Opens generated canvas files and shows a confirmation notice
 */

import { App, Notice } from "obsidian";

export async function openGeneratedCanvasPreview(
	app: App,
	canvasPath: string
): Promise<void> {
	await app.workspace.openLinkText(canvasPath, "", "tab");
	const filename = canvasPath.split("/").pop() ?? canvasPath;
	new Notice(`Canvas generated: ${filename} — opened in new tab`);
}
