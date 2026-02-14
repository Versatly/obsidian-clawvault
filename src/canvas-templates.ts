/**
 * ClawVault Canvas Templates
 * Built-in JSON Canvas templates for dashboard generation
 */

import type { TFile } from "obsidian";
import {
	CANVAS_TEMPLATE_IDS,
	type CanvasTemplateId,
	TASK_PRIORITY,
	TASK_STATUS,
} from "./constants";
import type { GraphEdge, GraphIndex, GraphNode, ParsedTask, VaultStats } from "./vault-reader";

export interface CanvasNodeBase {
	id: string;
	type: "text" | "file" | "group";
	x: number;
	y: number;
	width: number;
	height: number;
	color?: string;
}

export interface CanvasTextNode extends CanvasNodeBase {
	type: "text";
	text: string;
}

export interface CanvasFileNode extends CanvasNodeBase {
	type: "file";
	file: string;
}

export interface CanvasGroupNode extends CanvasNodeBase {
	type: "group";
	label: string;
}

export type CanvasNode = CanvasTextNode | CanvasFileNode | CanvasGroupNode;

export interface CanvasEdge {
	id: string;
	fromNode: string;
	toNode: string;
	fromSide?: "top" | "right" | "bottom" | "left";
	toSide?: "top" | "right" | "bottom" | "left";
	label?: string;
	color?: string;
}

export interface CanvasData {
	nodes: CanvasNode[];
	edges: CanvasEdge[];
}

export interface TemplateOptions {
	project?: string;
	dateRangeDays?: number;
	tasks?: ParsedTask[];
	graphIndex?: GraphIndex | null;
	vaultName?: string;
	allFiles?: TFile[];
	decisionFiles?: TFile[];
	openLoops?: ParsedTask[];
	stats?: VaultStats | null;
}

export interface CanvasTemplateDefinition {
	id: CanvasTemplateId;
	title: string;
	description: string;
}

const PRIORITY_NODE_COLORS: Record<string, string> = {
	[TASK_PRIORITY.CRITICAL]: "3", // red
	[TASK_PRIORITY.HIGH]: "2", // orange
	[TASK_PRIORITY.MEDIUM]: "6", // blue
	[TASK_PRIORITY.LOW]: "5", // gray
};

export const BUILTIN_CANVAS_TEMPLATES: CanvasTemplateDefinition[] = [
	{
		id: CANVAS_TEMPLATE_IDS.PROJECT_BOARD,
		title: "Project board",
		description: "Kanban-style project board with Backlog, Active, Blocked, and Done columns.",
	},
	{
		id: CANVAS_TEMPLATE_IDS.BRAIN_OVERVIEW,
		title: "Brain overview",
		description:
			"Radial vault map with grouped entities and links based on the graph index.",
	},
	{
		id: CANVAS_TEMPLATE_IDS.SPRINT_DASHBOARD,
		title: "Sprint dashboard",
		description:
			"Operational dashboard for active work, decisions, open loops, and graph health stats.",
	},
];

class CanvasBuilder {
	private nodeSeq = 0;
	private edgeSeq = 0;
	nodes: CanvasNode[] = [];
	edges: CanvasEdge[] = [];

	addTextNode(args: Omit<CanvasTextNode, "id" | "type">): string {
		const id = `text-${++this.nodeSeq}`;
		this.nodes.push({
			id,
			type: "text",
			...args,
		});
		return id;
	}

	addFileNode(args: Omit<CanvasFileNode, "id" | "type">): string {
		const id = `file-${++this.nodeSeq}`;
		this.nodes.push({
			id,
			type: "file",
			...args,
		});
		return id;
	}

	addGroupNode(args: Omit<CanvasGroupNode, "id" | "type">): string {
		const id = `group-${++this.nodeSeq}`;
		this.nodes.push({
			id,
			type: "group",
			...args,
		});
		return id;
	}

	addEdge(args: Omit<CanvasEdge, "id">): string {
		const id = `edge-${++this.edgeSeq}`;
		this.edges.push({
			id,
			...args,
		});
		return id;
	}

	build(): CanvasData {
		return {
			nodes: this.nodes,
			edges: this.edges,
		};
	}
}

export function generateCanvasTemplate(
	templateId: CanvasTemplateId,
	vaultPath: string,
	options: TemplateOptions
): CanvasData {
	switch (templateId) {
		case CANVAS_TEMPLATE_IDS.PROJECT_BOARD:
			return generateProjectBoardTemplate(vaultPath, options);
		case CANVAS_TEMPLATE_IDS.BRAIN_OVERVIEW:
			return generateBrainOverviewTemplate(vaultPath, options);
		case CANVAS_TEMPLATE_IDS.SPRINT_DASHBOARD:
			return generateSprintDashboardTemplate(vaultPath, options);
		default: {
			const exhaustiveCheck: never = templateId;
			throw new Error(`Unsupported template: ${String(exhaustiveCheck)}`);
		}
	}
}

export function generateProjectBoardTemplate(
	_vaultPath: string,
	options: TemplateOptions
): CanvasData {
	const builder = new CanvasBuilder();
	const selectedProject = (options.project ?? "").trim().toLowerCase();
	const tasks = (options.tasks ?? []).filter((task) => {
		if (!selectedProject) {
			return true;
		}
		return task.frontmatter.project?.trim().toLowerCase() === selectedProject;
	});

	builder.addTextNode({
		x: 0,
		y: -180,
		width: 1320,
		height: 100,
		text: selectedProject
			? `# Project board: ${selectedProject}`
			: "# Project board: all projects",
	});

	const columns: Array<{
		title: string;
		statuses: string[];
		color: string;
	}> = [
		{ title: "Backlog", statuses: [TASK_STATUS.OPEN], color: "5" },
		{ title: "Active", statuses: [TASK_STATUS.IN_PROGRESS], color: "6" },
		{ title: "Blocked", statuses: [TASK_STATUS.BLOCKED], color: "3" },
		{ title: "Done", statuses: [TASK_STATUS.DONE], color: "4" },
	];

	const columnWidth = 310;
	const columnGap = 24;
	const baseY = 0;
	const cardHeight = 120;

	columns.forEach((column, columnIndex) => {
		const x = columnIndex * (columnWidth + columnGap);
		const columnTasks = tasks
			.filter((task) => column.statuses.includes(task.status))
			.sort((a, b) => b.file.stat.mtime - a.file.stat.mtime);
		const columnHeight = Math.max(440, columnTasks.length * (cardHeight + 16) + 90);

		builder.addGroupNode({
			label: column.title,
			x,
			y: baseY,
			width: columnWidth,
			height: columnHeight,
			color: column.color,
		});

		if (columnTasks.length === 0) {
			builder.addTextNode({
				x: x + 20,
				y: baseY + 70,
				width: columnWidth - 40,
				height: 80,
				text: "No tasks",
				color: "5",
			});
			return;
		}

		columnTasks.forEach((task, taskIndex) => {
			const nodeColor =
				PRIORITY_NODE_COLORS[`${task.frontmatter.priority ?? TASK_PRIORITY.MEDIUM}`] ??
				PRIORITY_NODE_COLORS[TASK_PRIORITY.MEDIUM];
			builder.addFileNode({
				x: x + 15,
				y: baseY + 56 + taskIndex * (cardHeight + 12),
				width: columnWidth - 30,
				height: cardHeight,
				file: task.file.path,
				color: nodeColor,
			});
		});
	});

	return builder.build();
}

export function generateBrainOverviewTemplate(
	_vaultPath: string,
	options: TemplateOptions
): CanvasData {
	const builder = new CanvasBuilder();
	const graphIndex = options.graphIndex;
	const vaultName = options.vaultName ?? "Vault";

	const centerNodeId = builder.addTextNode({
		x: 680,
		y: 420,
		width: 360,
		height: 140,
		text: `# ${vaultName}\n\nBrain overview`,
		color: "6",
	});

	if (!graphIndex || graphIndex.nodes.length === 0) {
		builder.addTextNode({
			x: 640,
			y: 600,
			width: 420,
			height: 120,
			text: "No graph index found. Run ClawVault indexing, then regenerate this canvas.",
			color: "5",
		});
		return builder.build();
	}

	const degreeByNode = computeNodeDegrees(graphIndex.edges);
	const allFilesByPath = new Set((options.allFiles ?? []).map((file) => file.path));
	const filesByBasename = new Map<string, string>();
	for (const file of options.allFiles ?? []) {
		if (!filesByBasename.has(file.basename.toLowerCase())) {
			filesByBasename.set(file.basename.toLowerCase(), file.path);
		}
	}

	const grouped = groupGraphNodes(graphIndex.nodes);
	const categories = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));
	const radius = 620;
	const groupNodeByGraphId = new Map<string, string>();

	categories.forEach((category, index) => {
		const categoryNodes = grouped.get(category) ?? [];
		const angle = (Math.PI * 2 * index) / Math.max(categories.length, 1);
		const groupX = Math.round(840 + Math.cos(angle) * radius);
		const groupY = Math.round(480 + Math.sin(angle) * radius);

		builder.addGroupNode({
			label: category,
			x: groupX - 200,
			y: groupY - 160,
			width: 400,
			height: 340,
			color: "5",
		});

		builder.addEdge({
			fromNode: centerNodeId,
			toNode: builder.addTextNode({
				x: groupX - 80,
				y: groupY - 120,
				width: 160,
				height: 46,
				text: category,
				color: "5",
			}),
			color: "5",
		});

		const topEntities = categoryNodes
			.sort((a, b) => {
				const degreeA = degreeByNode.get(a.id) ?? 0;
				const degreeB = degreeByNode.get(b.id) ?? 0;
				return degreeB - degreeA;
			})
			.slice(0, 6);

		topEntities.forEach((node, nodeIndex) => {
			const filePath = resolveGraphNodePath(node, allFilesByPath, filesByBasename);
			const x = groupX - 180 + (nodeIndex % 2) * 190;
			const y = groupY - 70 + Math.floor(nodeIndex / 2) * 92;

			let canvasNodeId: string;
			if (filePath) {
				canvasNodeId = builder.addFileNode({
					x,
					y,
					width: 170,
					height: 78,
					file: filePath,
					color: "4",
				});
			} else {
				canvasNodeId = builder.addTextNode({
					x,
					y,
					width: 170,
					height: 78,
					text: node.label,
					color: "4",
				});
			}
			groupNodeByGraphId.set(node.id, canvasNodeId);
		});
	});

	let edgeCount = 0;
	for (const edge of graphIndex.edges) {
		const fromNode = groupNodeByGraphId.get(edge.source);
		const toNode = groupNodeByGraphId.get(edge.target);
		if (!fromNode || !toNode) {
			continue;
		}
		builder.addEdge({
			fromNode,
			toNode,
			color: "2",
		});
		edgeCount++;
		if (edgeCount >= 70) {
			break;
		}
	}

	return builder.build();
}

export function generateSprintDashboardTemplate(
	_vaultPath: string,
	options: TemplateOptions
): CanvasData {
	const builder = new CanvasBuilder();
	const tasks = options.tasks ?? [];
	const stats = options.stats;
	const days = options.dateRangeDays ?? 7;
	const activeCount =
		stats?.tasks.active ?? tasks.filter((task) => task.status === TASK_STATUS.IN_PROGRESS).length;
	const blockedCount =
		stats?.tasks.blocked ?? tasks.filter((task) => task.status === TASK_STATUS.BLOCKED).length;
	const totalCount = stats?.tasks.total ?? tasks.length;
	const doneCount =
		stats?.tasks.completed ?? tasks.filter((task) => task.status === TASK_STATUS.DONE).length;
	const completionRate = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

	builder.addTextNode({
		x: 0,
		y: -170,
		width: 1360,
		height: 90,
		text: `# Sprint dashboard (${days}d window)`,
	});

	const topCards = [
		{
			title: "Active tasks",
			value: `${activeCount}`,
			x: 0,
			color: "6",
		},
		{
			title: "Blocked tasks",
			value: `${blockedCount}`,
			x: 290,
			color: "3",
		},
		{
			title: "Completion rate",
			value: `${completionRate}%`,
			x: 580,
			color: "4",
		},
	];

	for (const card of topCards) {
		builder.addTextNode({
			x: card.x,
			y: 0,
			width: 260,
			height: 120,
			color: card.color,
			text: `## ${card.title}\n\n${card.value}`,
		});
	}

	builder.addGroupNode({
		label: "Recent decisions",
		x: 0,
		y: 170,
		width: 840,
		height: 430,
		color: "2",
	});

	const recentDecisions = options.decisionFiles ?? [];
	if (recentDecisions.length === 0) {
		builder.addTextNode({
			x: 24,
			y: 240,
			width: 790,
			height: 80,
			text: "No recent decisions in the selected date window.",
			color: "5",
		});
	} else {
		recentDecisions.slice(0, 8).forEach((file, index) => {
			builder.addFileNode({
				x: 24 + (index % 2) * 400,
				y: 220 + Math.floor(index / 2) * 88,
				width: 360,
				height: 70,
				file: file.path,
				color: "2",
			});
		});
	}

	builder.addGroupNode({
		label: "Open loops",
		x: 0,
		y: 640,
		width: 840,
		height: 320,
		color: "3",
	});

	const openLoops = options.openLoops ?? [];
	if (openLoops.length === 0) {
		builder.addTextNode({
			x: 24,
			y: 700,
			width: 790,
			height: 90,
			text: "No open loops older than 7 days.",
			color: "4",
		});
	} else {
		openLoops.slice(0, 6).forEach((task, index) => {
			builder.addFileNode({
				x: 24 + (index % 2) * 400,
				y: 690 + Math.floor(index / 2) * 84,
				width: 360,
				height: 66,
				file: task.file.path,
				color: "3",
			});
		});
	}

	builder.addGroupNode({
		label: "Graph stats",
		x: 900,
		y: 170,
		width: 440,
		height: 790,
		color: "6",
	});

	builder.addTextNode({
		x: 930,
		y: 230,
		width: 380,
		height: 220,
		text:
			`## Graph\n\nNodes: ${(stats?.nodeCount ?? 0).toLocaleString()}\n` +
			`Edges: ${(stats?.edgeCount ?? 0).toLocaleString()}\n` +
			`Files: ${(stats?.fileCount ?? 0).toLocaleString()}`,
		color: "6",
	});

	builder.addTextNode({
		x: 930,
		y: 490,
		width: 380,
		height: 220,
		text:
			`## Tasks\n\nOpen: ${stats?.tasks.open ?? 0}\n` +
			`In progress: ${stats?.tasks.active ?? 0}\n` +
			`Blocked: ${stats?.tasks.blocked ?? 0}\n` +
			`Done: ${stats?.tasks.completed ?? 0}`,
		color: "4",
	});

	return builder.build();
}

function groupGraphNodes(nodes: GraphNode[]): Map<string, GraphNode[]> {
	const grouped = new Map<string, GraphNode[]>();
	for (const node of nodes) {
		const rawCategory = node.category ?? node.type ?? "uncategorized";
		const category = rawCategory.trim().toLowerCase();
		if (!grouped.has(category)) {
			grouped.set(category, []);
		}
		grouped.get(category)?.push(node);
	}
	return grouped;
}

function computeNodeDegrees(edges: GraphEdge[]): Map<string, number> {
	const degrees = new Map<string, number>();
	for (const edge of edges) {
		degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
		degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
	}
	return degrees;
}

function resolveGraphNodePath(
	node: GraphNode,
	allFilesByPath: Set<string>,
	filesByBasename: Map<string, string>
): string | null {
	const id = node.id.trim();
	const label = node.label.trim();

	if (allFilesByPath.has(id)) {
		return id;
	}

	if (id.endsWith(".md") && allFilesByPath.has(id)) {
		return id;
	}

	const inferredFromLabel = filesByBasename.get(label.toLowerCase());
	if (inferredFromLabel) {
		return inferredFromLabel;
	}

	return null;
}
