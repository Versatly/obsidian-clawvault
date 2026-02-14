# ClawVault Obsidian Plugin — v0.1.0

## Overview

Build a community plugin for Obsidian that enhances ClawVault vaults with visual features: colored graph nodes by tag/category, a sidebar status panel, command palette integration, and CSS snippets for the knowledge graph.

This is based on the obsidian-sample-plugin template. The plugin reads vault files (markdown with frontmatter) and the `.clawvault/graph-index.json` file to provide visual enhancements.

## What to Build

### 1. Custom CSS for Graph View (styles.css)

Inject CSS that colors graph nodes based on tags and folder categories:

```css
/* Tag-based coloring for graph nodes */
.graph-view .links { /* default styling */ }

/* Category folders → node colors
 * Obsidian doesn't natively support folder-based graph coloring,
 * so we use the settings panel to let users configure tag→color mappings
 * and inject CSS classes via the plugin's graph leaf decorator.
 */
```

The plugin should:
- Read `.clawvault.json` to get category list
- Allow users to configure colors per category/tag in settings
- Default color scheme:
  - tasks: `#e8a430` (gold/orange)
  - decisions: `#e85d4a` (red)
  - people: `#4a90e8` (blue)
  - projects: `#4ae85d` (green)
  - lessons: `#9b59b6` (purple)
  - blocked items: `#e74c3c` (bright red)
  - backlog: `#95a5a6` (gray)

### 2. Sidebar Status Panel (StatusView)

Register a custom view in the right sidebar showing:

```
🐘 ClawVault
━━━━━━━━━━━━━━
Vault: my-agent
Files: 409 | Nodes: 705 | Edges: 1,323

Tasks
● 3 active | ○ 5 open | ⊘ 2 blocked
✓ 12 completed (70%)

Inbox: 5 pending

Last Observation: 2h ago
Last Reflection: Week 07
```

Data source: read `.clawvault/graph-index.json` for graph stats, count files in `tasks/` and `backlog/` folders, read frontmatter for status fields.

### 3. Command Palette Commands

Register these commands:
- **ClawVault: Generate Dashboard** — runs `clawvault canvas` and opens the resulting `.canvas` file
- **ClawVault: Quick Capture** — opens a modal with a text input, creates a file in `inbox/`
- **ClawVault: Add Task** — modal with title, project, priority fields, creates file in `tasks/`
- **ClawVault: View Blocked** — opens a modal listing all blocked tasks

For commands that run CLI: use `child_process.exec` to run `clawvault` commands. If clawvault CLI is not available, show a notice saying "ClawVault CLI not found. Install with: npm i -g clawvault"

### 4. Status Bar Item

Bottom status bar showing: `🐘 705 nodes · 3 tasks` — clicking opens the sidebar panel.

### 5. Settings Tab

Plugin settings:
- **Vault path override** (optional, auto-detected from vault root)
- **Graph colors** — color picker per category (with defaults)
- **Auto-refresh interval** — how often to refresh stats (default: 60s)
- **Show status bar** — toggle

### 6. File Decorations

Add visual indicators in the file explorer:
- Task files: show status icon (●/○/⊘/✓) based on frontmatter `status` field
- Files in `inbox/`: show 📥 icon

## File Structure

```
src/
├── main.ts              # Plugin entry point
├── settings.ts          # Settings tab
├── status-view.ts       # Sidebar panel view
├── vault-reader.ts      # Read .clawvault.json, graph-index, task files
├── commands.ts          # Command palette registrations
├── modals/
│   ├── capture-modal.ts # Quick capture modal
│   ├── task-modal.ts    # Add task modal
│   └── blocked-modal.ts # View blocked tasks modal
├── decorations.ts       # File explorer decorations
└── constants.ts         # Default colors, view type IDs
styles.css               # Graph coloring + sidebar + decoration styles
manifest.json            # Plugin manifest
```

## Constraints

- Use only the Obsidian Plugin API (`obsidian` module)
- No external network calls (everything reads local files)
- `child_process` only for optional CLI commands (with graceful fallback)
- Must work on mobile (skip CLI-dependent features, show "desktop only" notice)
- Keep the plugin lightweight — no heavy computations on load
- Follow Obsidian community plugin guidelines
- TypeScript strict mode

## Build & Test

```bash
npm install
npm run build    # Produces main.js
```

To test: copy `main.js`, `manifest.json`, `styles.css` to `.obsidian/plugins/clawvault/` in a test vault.

## Reference

- Obsidian Plugin API: https://docs.obsidian.md/Reference/TypeScript+API/Plugin
- JSON Canvas spec: https://jsoncanvas.org/spec/1.0/
- ClawVault task frontmatter: `status` (open|in-progress|blocked|done), `priority` (critical|high|medium|low), `project`, `owner`, `blocked_by`, `due`
- Graph index format: `.clawvault/graph-index.json` has `{nodes: [{id, label, type, category}], edges: [{source, target, type}]}`

## What Done Looks Like

1. Plugin loads in Obsidian without errors
2. Graph nodes are colored by category
3. Sidebar shows vault stats
4. Commands work from command palette
5. Status bar shows node count + task count
6. Settings allow color customization
7. `npm run build` produces working `main.js`
