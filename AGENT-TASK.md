# ClawVault Obsidian Plugin — v0.2.0 Enhancements

## Overview

The plugin has a working v0.1.0 with sidebar stats, graph colors, commands, file decorations, and status bar. This task adds the missing features for a complete task management + dashboard experience.

## What Exists (don't break these)
- `src/main.ts` — Plugin entry, sidebar view, ribbon icon, status bar, auto-refresh
- `src/settings.ts` — Settings tab with color pickers, refresh interval, vault path
- `src/status-view.ts` — Sidebar panel with vault stats, task counts, graph info
- `src/vault-reader.ts` — Reads .clawvault.json, graph-index.json, task files with frontmatter
- `src/commands.ts` — Generate Dashboard, Quick Capture, Add Task, View Blocked commands
- `src/decorations.ts` — File explorer status icons for tasks
- `src/modals/` — capture, task, blocked modals
- `src/constants.ts` — Colors, status/priority types, command IDs

## What to Build

### 1. Task Board View (Kanban-style)

Create `src/task-board-view.ts` — a custom Obsidian view (register like StatusView) that renders a kanban board:

```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│   ○ Open    │ │ ● In Prog   │ │ ⊘ Blocked   │ │  ✓ Done     │
├─────────────┤ ├─────────────┤ ├─────────────┤ ├─────────────┤
│ Task title  │ │ Task title  │ │ Task title  │ │ Task title  │
│ proj · high │ │ proj · med  │ │ blocked by  │ │ completed   │
│             │ │             │ │ Task title  │ │             │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

Features:
- Reads all `.md` files from `tasks/` folder
- Parses frontmatter for status, priority, project, owner, blocked_by
- Groups by status into columns
- Click a task card → opens the markdown file
- Drag & drop between columns → updates frontmatter status (use `app.vault.process()`)
- Color-coded priority: critical=red border, high=orange, medium=blue, low=gray
- Filter bar: by project, by priority, by owner
- Auto-refresh when task files change (use `app.vault.on('modify', ...)`)

Register as view type `clawvault-task-board` with command `ClawVault: Open Task Board`.

### 2. Canvas Template System

Create `src/canvas-templates.ts`:

Define 3 built-in canvas templates as TypeScript objects (JSON Canvas spec):

**a) Project Board** — `project-board`
- Columns: Backlog | Active | Blocked | Done
- Each column is a group node
- Tasks are file nodes linking to task markdown files
- Filter by project name

**b) Brain Overview** — `brain-overview`
- Center: vault name
- Radial layout: one group per category (decisions, lessons, people, projects, etc.)
- Top entities from graph-index as file nodes inside each group
- Edge connections between related entities

**c) Sprint Dashboard** — `sprint-dashboard`
- Top row: active tasks, blocked count, completion rate
- Middle: recent decisions (last 7 days)
- Bottom: open loops / unresolved commitments
- Right side: graph stats

Each template is a function: `(vaultPath: string, options: TemplateOptions) => CanvasData`

Add command: `ClawVault: Generate Canvas from Template` — modal to pick template + options (project filter, date range).

### 3. Canvas Preview

Create `src/canvas-preview.ts`:

After generating a canvas file:
1. Open it in Obsidian's canvas view (`app.workspace.openLinkText(canvasPath, '', 'tab')`)
2. Show a Notice: "Canvas generated: dashboard.canvas — opened in new tab"

This is simple but important — user generates → immediately sees result.

### 4. Enhanced Status View

Update `src/status-view.ts` to add:
- **Backlog section**: count + list of top 5 backlog items (clickable → open file)
- **Recent activity**: last 5 observed sessions with timestamps
- **Open loops**: tasks that are open for >7 days (highlight in amber)
- **Quick actions row**: buttons for "Add Task", "Quick Capture", "Generate Dashboard"

### 5. Improved Graph Coloring

Update `src/decorations.ts` or create `src/graph-enhancer.ts`:
- On graph view open, inject CSS variables for each category color from settings
- Support for tag-based coloring (read tags from frontmatter)
- Priority-based node sizing: critical tasks = larger nodes

### 6. New Commands

Add to `src/commands.ts`:
- `ClawVault: Open Task Board` — opens the kanban view
- `ClawVault: Generate Canvas from Template` — template picker modal
- `ClawVault: Refresh Stats` — force refresh all data
- `ClawVault: Show Open Loops` — modal listing old open tasks

### 7. Keyboard Shortcuts

Register default hotkeys:
- `Ctrl+Shift+T` — Add Task modal
- `Ctrl+Shift+C` — Quick Capture modal

## File Structure (new files)

```
src/
├── task-board-view.ts    # Kanban board view (NEW)
├── canvas-templates.ts   # Template engine + 3 built-in templates (NEW)
├── canvas-preview.ts     # Open generated canvas (NEW)
├── graph-enhancer.ts     # Enhanced graph coloring (NEW)
├── modals/
│   └── template-modal.ts # Template picker modal (NEW)
```

## Constraints

- Obsidian Plugin API only — no external deps
- No network calls
- Must work without ClawVault CLI installed (graceful fallback for CLI commands)
- Mobile: task board and status view should work; CLI commands show "desktop only"
- Don't use `child_process` for the kanban board — read files directly via Obsidian API
- JSON Canvas spec 1.0: https://jsoncanvas.org/spec/1.0/
- TypeScript strict mode

## Task Frontmatter Schema (what's in task .md files)

```yaml
---
title: "Ship ClawVault v2.4.0"
status: open          # open | in-progress | blocked | done
priority: high        # critical | high | medium | low
project: clawvault
owner: clawdious
blocked_by: "waiting for review"
due: "2026-02-20"
source: manual        # manual | observer
tags: [task, engineering]
created: 2026-02-14
completed: null
---

# Task content here
```

## Build & Test

```bash
npm run build    # Must produce main.js without errors
```

Test by copying main.js + manifest.json + styles.css to `.obsidian/plugins/clawvault/` in a vault with task files.

## What Done Looks Like

1. `npm run build` succeeds
2. Kanban board view renders tasks in 4 columns
3. Drag & drop updates task status in frontmatter
4. 3 canvas templates generate valid .canvas files
5. Generated canvas opens automatically in Obsidian
6. Status view shows backlog, recent activity, open loops
7. All existing features still work (graph colors, commands, decorations)
