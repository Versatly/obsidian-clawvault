# ClawVault

Visual memory management for your Obsidian vault. ClawVault provides colored graph visualization, vault statistics, quick capture, and a status dashboard to help you manage your knowledge base effectively.

## Features

### Colored graph view
Automatically colorizes your graph view based on folder categories (tasks, projects, people, decisions, etc.). Run the "Setup graph colors" command to apply neural-style coloring to your vault's graph.

### Status dashboard
A dedicated panel showing vault statistics including node counts, edge counts, and category breakdowns. Access it via the ribbon icon or the "Open Status Panel" command.

### Quick capture
Rapidly capture thoughts and notes to your inbox folder. Use `Ctrl+Shift+C` (or `Cmd+Shift+C` on Mac) to open the capture modal.

### File decorations
Visual indicators in the file explorer showing inbox items and other category markers.

### Status bar
Optional status bar display showing real-time node and edge counts for your vault.

## Installation

### From Obsidian Community Plugins

1. Open **Settings → Community plugins**
2. Select **Browse** and search for "ClawVault"
3. Select **Install**, then **Enable**

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/Versatly/clawvault/releases)
2. Create a folder called `clawvault` in your vault's `.obsidian/plugins/` directory
3. Copy the downloaded files into the `clawvault` folder
4. Reload Obsidian and enable the plugin in **Settings → Community plugins**

## Commands

| Command | Description |
|---------|-------------|
| Quick capture | Open the quick capture modal |
| Open status panel | Open the vault status dashboard |
| Open kanban board | Open your Board.md file |
| Refresh stats | Force refresh all vault statistics |
| Setup graph colors (neural style) | Apply neural-style graph coloring |

## Settings

- **Vault path override**: Optionally specify a custom vault path
- **Auto-refresh interval**: Configure how often statistics refresh (10–300 seconds)
- **Show status bar**: Toggle the status bar display
- **Show file decorations**: Toggle file explorer decorations
- **Graph colors**: Customize colors for each category (tasks, projects, people, etc.)

## Supported categories

ClawVault recognizes these folder-based categories for graph coloring:

- `tasks` — Gold/orange
- `decisions` — Red
- `people` — Blue
- `projects` — Green
- `lessons` — Purple
- `blocked` — Bright red
- `backlog` — Gray
- `inbox` — Amber

## Development

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Development mode with watch
npm run dev

# Run linter
npm run lint
```

## Support

- [Documentation](https://clawvault.dev)
- [GitHub Issues](https://github.com/Versatly/clawvault/issues)
- [GitHub Repository](https://github.com/Versatly/clawvault)

## License

[MIT](LICENSE)
