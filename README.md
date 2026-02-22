# ClawVault

Visual memory management for Obsidian vaults. ClawVault provides colored graph views, vault statistics, quick capture, and task management features to help you maintain a healthy knowledge base.

## Features

### Status panel
A sidebar panel showing real-time vault statistics:
- Total files, nodes, and edges in your memory graph
- Node type breakdown (tasks, decisions, people, projects, etc.)
- Today's observations count and categories
- Inbox pending items count
- Quick access to the Kanban board

### Colored graph view
Automatically colors nodes in Obsidian's graph view based on folder categories:
- **Tasks** (gold/orange)
- **Decisions** (red)
- **People** (blue)
- **Projects** (green)
- **Lessons** (purple)
- **Inbox** (amber)
- **Backlog** (gray)

Run the "Setup graph colors" command to apply a neural-style color scheme to your graph.

### Quick capture
Press `Ctrl+Shift+C` (or run the command) to quickly capture thoughts to your inbox folder without leaving your current context.

### File decorations
Visual indicators in the file explorer showing inbox items and other status markers.

### Kanban board integration
Quick access to open your `Board.md` file as a task board.

## Commands

| Command | Description |
|---------|-------------|
| **ClawVault: Quick Capture** | Open the quick capture modal (Ctrl+Shift+C) |
| **ClawVault: Open Status Panel** | Open the status sidebar panel |
| **ClawVault: Open Kanban Board** | Open Board.md in a new tab |
| **ClawVault: Refresh Stats** | Force refresh all vault statistics |
| **ClawVault: Setup graph colors** | Configure neural-style graph colors |

## Settings

- **Vault path override**: Optional path override for vault detection
- **Auto-refresh interval**: How often to refresh statistics (10-300 seconds)
- **Show status bar**: Toggle the status bar item showing node/edge counts
- **Show file decorations**: Toggle inbox indicators in the file explorer
- **Graph colors**: Customize colors for each category type

## Installation

### From Obsidian Community Plugins
1. Open **Settings → Community plugins**
2. Select **Browse** and search for "ClawVault"
3. Select **Install**, then **Enable**

### Manual installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create a folder named `clawvault` in your vault's `.obsidian/plugins/` directory
3. Copy the downloaded files into the folder
4. Reload Obsidian and enable the plugin in **Settings → Community plugins**

## Vault structure

ClawVault works best with vaults organized into category folders:

```
vault/
├── inbox/          # Uncategorized captures
├── tasks/          # Task notes
├── decisions/      # Decision records
├── people/         # People notes
├── projects/       # Project documentation
├── lessons/        # Lessons learned
├── observations/   # Daily observations
├── backlog/        # Backlog items
├── .clawvault.json # Optional config file
└── .clawvault/
    └── graph-index.json  # Optional graph index
```

### Configuration file (optional)

Create a `.clawvault.json` file in your vault root to customize behavior:

```json
{
  "name": "My Vault",
  "categories": ["tasks", "decisions", "people", "projects", "lessons"],
  "version": "1.0"
}
```

## Support

- [GitHub Issues](https://github.com/Versatly/clawvault/issues) — Report bugs or request features
- [ClawVault Documentation](https://clawvault.dev) — Full documentation

## License

This plugin is released under the [0-BSD License](LICENSE).
