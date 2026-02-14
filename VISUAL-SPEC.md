# ClawVault Visual Spec — BrainMeld Style

## The Look

Dark background (#0a0a0a), colored nodes by category, green links between nodes, subtle glow on focused nodes. This is the "BrainMeld" style that makes knowledge graphs look like neural networks.

## Graph Color Scheme

These CSS selectors color graph nodes by tag. The plugin should:
1. Ship with this CSS in `styles.css`
2. Auto-inject `cssclass` / tags into vault files based on their category folder
3. Configure graph `colorGroups` in `.obsidian/graph.json` on first load

### Color Map
| Category | Color | Hex | Tag |
|----------|-------|-----|-----|
| People | Cyan/Teal | #00b4d8 | #person |
| Projects | Forest Green | #2d6a4f | #project |
| Decisions | Orange/Red | #e8590c | #decision |
| Lessons | Gold | #fcc419 | #lesson |
| Commitments | Red | #e03131 | #commitment |
| Tasks | Cyan | #22b8cf | #task |
| Observations | Purple | #7950f2 | #observation |
| Handoffs | Violet | #845ef7 | #handoff |
| Inbox | Amber | #f39c12 | #inbox |
| Daily Notes | Gray | #495057 | #daily |
| Focused Node | ClawVault Gold | #e8a430 | — |
| Links | Green | rgba(45, 200, 120, 0.15) | — |
| Focused Links | Green Bright | rgba(45, 200, 120, 0.6) | — |
| Background | Near Black | #0a0a0a | — |

### Graph Settings
```json
{
  "colorGroups": [
    {"query": "path:people", "color": {"a": 1, "rgb": 47316}},
    {"query": "path:projects", "color": {"a": 1, "rgb": 2976335}},
    {"query": "path:decisions", "color": {"a": 1, "rgb": 15227916}},
    {"query": "path:lessons", "color": {"a": 1, "rgb": 16565273}},
    {"query": "path:tasks", "color": {"a": 1, "rgb": 2275535}},
    {"query": "path:commitments", "color": {"a": 1, "rgb": 14700849}},
    {"query": "path:backlog", "color": {"a": 1, "rgb": 9806262}},
    {"query": "path:inbox", "color": {"a": 1, "rgb": 15964178}}
  ],
  "showTags": false,
  "showAttachments": false,
  "textFadeMultiplier": 0,
  "nodeSizeMultiplier": 1.2,
  "lineSizeMultiplier": 0.8,
  "repelStrength": 10,
  "linkDistance": 250,
  "centerStrength": 0.5
}
```

## Canvas Dashboard Colors

The generated `dashboard.canvas` should use Obsidian's canvas color system:
- Color 1 (red): Blocked items, critical alerts
- Color 2 (orange): Active/in-progress tasks
- Color 3 (yellow): Backlog, pending items
- Color 4 (green): Completed, healthy stats
- Color 5 (cyan): Knowledge graph section
- Color 6 (purple): Observations, reflections

## Setup Command

`ClawVault: Setup Graph Colors` command should:
1. Create/update `.obsidian/snippets/clawvault-graph.css` with the BrainMeld styles
2. Enable the snippet in `.obsidian/appearance.json`
3. Update `.obsidian/graph.json` with colorGroups config
4. Show a Notice: "Graph colors configured! Open Graph View to see the BrainMeld style."
