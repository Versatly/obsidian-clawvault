# ClawVault Obsidian Plugin — Built-in Mobile Sync

Build a native sync engine into this Obsidian plugin so it can sync with a remote ClawVault server over HTTP (WebDAV + manifest API). This replaces the need for the "Remotely Save" third-party plugin.

## Build & Test

```bash
npm run build    # Must produce main.js without errors (tsc -noEmit + esbuild)
npm run lint     # ESLint must pass
```

**No external dependencies allowed.** Use only `obsidian` API (`requestUrl`, `Platform`, `App`, `Vault`, `DataAdapter`).

**Test by verifying:** `npm run build` produces `main.js` with zero errors.

## Reference Files (read these for patterns)

- `src/main.ts` — Plugin entry, how views/commands/settings are registered
- `src/settings.ts` — Settings interface + tab (extend this, don't replace)
- `src/vault-reader.ts` — How to read vault files via `app.vault.adapter` (use same pattern)
- `src/commands.ts` — How commands are registered
- `src/status-view.ts` — Sidebar panel rendering (add sync status section here)
- `src/constants.ts` — Constants, types, colors
- `src/modals/` — Modal patterns

## Constraints

- **Obsidian Plugin API only** — no Node.js `fs`, no `child_process`, no `fetch`. Use `requestUrl()` for HTTP.
- **Must work on mobile** — use `app.vault.adapter` for all file ops (works on both `FileSystemAdapter` and `CapacitorAdapter`)
- **TypeScript strict mode** — match existing tsconfig
- **Zero new npm dependencies** — everything built with Obsidian's API
- **Don't break existing features** — graph colors, status panel, commands, decorations must still work
- **Extend settings, don't replace** — add sync section to existing `ClawVaultSettingTab`

---

## Current State

### What ClawVault CLI Already Has
1. **WebDAV server** (`src/lib/webdav.ts`) — Full DAV Level 1+2 implementation: GET, PUT, DELETE, MKCOL, PROPFIND, MOVE, COPY, OPTIONS, HEAD. Basic Auth support. Blocks `.clawvault`, `.git`, `.obsidian`, `node_modules`.
2. **`clawvault serve`** (via `src/lib/tailscale.ts:serveVault()`) — HTTP server on port 8384 that:
   - Mounts WebDAV at `/webdav/`
   - Serves manifest at `/.clawvault/manifest`
   - File download/upload at `/.clawvault/files/`
   - Health check at `/.clawvault/health`
   - Binds to `0.0.0.0` (reachable via Tailscale IP)
3. **`clawvault sync <target>`** — Local filesystem sync (rsync-style) with `--delete` and `--dry-run`
4. **Tailscale integration** (`src/commands/tailscale.ts`) — Peer discovery, serve, sync between machines, trust levels (read/read-write/full)
5. **Vault manifest** — JSON manifest with file paths, sizes, checksums, categories

### What the Obsidian Plugin Already Has (`obsidian-clawvault`)
- Status sidebar panel (vault stats, task counts, graph info)
- Graph color enhancement (neural style, auto-configure `.obsidian/graph.json`)
- File decorations (task status icons in file explorer)
- Commands: Quick Capture, Add Task, View Blocked, Open Loops, Open Kanban Board, Refresh Stats, Setup Graph Colors
- Modals: capture, task, blocked, open loops
- VaultReader: reads `.clawvault.json`, `graph-index.json`, task frontmatter
- `manifest.json` declares `isDesktopOnly: false` — already mobile-capable

### Current Mobile Sync Flow (External Tool)
User must manually:
1. Run `clawvault serve` on server
2. Install Tailscale on phone
3. Install **Remotely Save** community plugin in Obsidian mobile
4. Configure Remotely Save with WebDAV URL pointing to `http://<tailscale-ip>:8384/webdav/`
5. Manually trigger sync or wait for auto-sync

**Problems:**
- Requires a separate community plugin (Remotely Save)
- No integration between sync state and ClawVault's data model
- No conflict awareness (Remotely Save handles generically)
- No sync status in ClawVault's UI
- User has to know Tailscale IP and configure manually
- No selective sync (whole vault or nothing)

---

## Proposed Integration: Built-in Sync in the Obsidian Plugin

### Architecture

```
┌──────────────────────────────────────────────────┐
│ Obsidian (Desktop/Mobile)                        │
│  ┌──────────────────────────────────────┐        │
│  │ obsidian-clawvault plugin            │        │
│  │  ├─ VaultReader (existing)           │        │
│  │  ├─ SyncEngine (NEW)                 │        │
│  │  │   ├─ WebDAV client via requestUrl │        │
│  │  │   ├─ Manifest diffing             │        │
│  │  │   ├─ Conflict resolution          │        │
│  │  │   └─ Category-based filtering     │        │
│  │  ├─ SyncSettingsTab (NEW)            │        │
│  │  ├─ SyncStatusView (NEW)             │        │
│  │  └─ AutoSync (NEW)                   │        │
│  └──────────────────────────────────────┘        │
│                    ↕ HTTP (requestUrl)            │
└──────────────────────────────────────────────────┘
                     │
                     │ Tailscale / LAN / Tunneled
                     │
┌──────────────────────────────────────────────────┐
│ Server (clawvault serve)                         │
│  ├─ WebDAV at /webdav/                           │
│  ├─ Manifest at /.clawvault/manifest             │
│  ├─ File API at /.clawvault/files/               │
│  └─ Health at /.clawvault/health                 │
└──────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Use Obsidian's `requestUrl()` for all HTTP** — works on both desktop and mobile, bypasses CORS. No external deps needed.
2. **Manifest-based diffing, not full directory scan** — The server already generates manifests with checksums. Compare local file stats against remote manifest to determine what needs syncing.
3. **Bidirectional sync** — Pull remote changes, push local changes. Manifest checksums determine direction.
4. **Category-based selective sync** — User can choose which categories to sync (tasks, decisions, people, etc.) vs syncing everything.
5. **No Remotely Save dependency** — This replaces it entirely for ClawVault vaults.

---

## New Files

```
src/
├── sync/
│   ├── sync-engine.ts        # Core sync logic
│   ├── sync-client.ts        # WebDAV + manifest HTTP client
│   ├── sync-resolver.ts      # Conflict resolution
│   ├─ sync-status-view.ts   # Sidebar sync status panel
│   └── sync-settings.ts      # Sync configuration UI
```

---

## Detailed Spec

### 1. `SyncClient` (`src/sync/sync-client.ts`)

HTTP client wrapping Obsidian's `requestUrl()` to talk to `clawvault serve`.

```typescript
interface SyncClientConfig {
  serverUrl: string;        // e.g., "http://100.64.31.68:8384"
  auth?: {
    username: string;
    password: string;
  };
  timeout?: number;         // ms, default 30000
}

class SyncClient {
  // Connection
  async healthCheck(): Promise<{ status: string; vault: string }>;
  
  // Manifest
  async fetchManifest(): Promise<VaultManifest>;
  
  // WebDAV file operations (using requestUrl for mobile compat)
  async getFile(remotePath: string): Promise<string>;
  async putFile(remotePath: string, content: string): Promise<void>;
  async deleteFile(remotePath: string): Promise<void>;
  async propfind(remotePath: string, depth?: string): Promise<PropfindEntry[]>;
  
  // Batch operations
  async getFilesBatch(paths: string[]): Promise<Map<string, string>>;
}
```

**Implementation notes:**
- All HTTP via `requestUrl()` — the ONLY way to do HTTP on Obsidian mobile (no `fetch`, no `XMLHttpRequest` for non-CORS).
- WebDAV PUT for writes, GET for reads. No need for MKCOL (manifest tells us structure).
- Basic Auth via `Authorization: Basic <base64>` header.
- Timeout handling: `requestUrl` doesn't support AbortController, so use Promise.race with timeout.

### 2. `SyncEngine` (`src/sync/sync-engine.ts`)

Core sync orchestrator. Compares local vault state with remote manifest.

```typescript
interface SyncPlan {
  toPull: SyncFileAction[];   // Remote → Local
  toPush: SyncFileAction[];   // Local → Remote
  conflicts: SyncConflict[];  // Both modified
  toDelete: SyncFileAction[]; // Orphans to remove
  unchanged: string[];        // No action needed
}

interface SyncFileAction {
  path: string;
  direction: 'pull' | 'push' | 'delete';
  reason: string;             // "remote newer" | "local newer" | "new file" | "deleted remotely"
  localModified?: number;     // mtime
  remoteModified?: string;    // ISO timestamp
  size?: number;
}

interface SyncConflict {
  path: string;
  localModified: number;
  remoteModified: string;
  localSize: number;
  remoteSize: number;
}

class SyncEngine {
  constructor(app: App, client: SyncClient, settings: SyncSettings);
  
  // Plan what needs to sync (dry run)
  async planSync(): Promise<SyncPlan>;
  
  // Execute a sync plan
  async executeSync(plan: SyncPlan): Promise<SyncResult>;
  
  // Quick sync (plan + execute)
  async sync(): Promise<SyncResult>;
  
  // Build local manifest from vault files
  async buildLocalManifest(): Promise<VaultManifest>;
}
```

**Sync algorithm:**
1. Fetch remote manifest from `/.clawvault/manifest`
2. Build local manifest by scanning vault files (using `app.vault.adapter`)
3. Diff:
   - File exists remote only → `toPull` (unless excluded by category filter)
   - File exists local only → `toPush` (unless it was deleted remotely — track deletions)
   - File exists both, remote checksum ≠ local checksum:
     - Remote mtime > local mtime → `toPull`
     - Local mtime > remote mtime → `toPush`
     - Both modified since last sync → `conflict`
   - File exists both, checksums match → `unchanged`
4. Apply category filter from settings
5. Execute: pull first, then push, then handle conflicts per resolution strategy

**Local manifest building:**
- Walk vault files using `app.vault.adapter.list()`
- Skip `.obsidian/`, `.clawvault/` internal dirs
- Compute checksums: use `app.vault.adapter.read()` → simple hash (CRC32 or SHA-256 via SubtleCrypto which IS available on mobile)
- Cache manifest with TTL to avoid re-scanning on rapid syncs

### 3. `SyncResolver` (`src/sync/sync-resolver.ts`)

Conflict resolution strategies.

```typescript
type ConflictStrategy = 
  | 'remote-wins'      // Server version always wins
  | 'local-wins'       // Local version always wins
  | 'newest-wins'      // Most recent mtime wins
  | 'keep-both'        // Rename local as .conflict.md
  | 'ask';             // Show modal for each conflict (desktop only)

class SyncResolver {
  resolve(conflict: SyncConflict, strategy: ConflictStrategy): SyncFileAction;
}
```

Default strategy: `newest-wins` (sensible for agent vaults where the agent is the primary writer and mobile is read-mostly).

For `keep-both`: rename local file to `filename.conflict-2026-02-14.md` and pull remote version.

### 4. `SyncSettings` (additions to `src/settings.ts`)

New settings section in the existing settings tab:

```typescript
interface SyncSettings {
  // Connection
  serverUrl: string;           // Required. e.g., "http://100.64.31.68:8384"
  authUsername: string;         // Optional Basic Auth
  authPassword: string;         // Optional Basic Auth
  
  // Behavior
  autoSyncEnabled: boolean;     // Auto-sync on app open/close and interval
  autoSyncInterval: number;     // Minutes between auto-syncs (default: 15)
  syncOnOpen: boolean;          // Sync when Obsidian opens (default: true)
  syncOnClose: boolean;         // Sync when Obsidian closes (default: false — unreliable on mobile)
  
  // Filtering
  syncCategories: string[];     // Which categories to sync (empty = all)
  excludePatterns: string[];    // Glob patterns to exclude
  
  // Conflict resolution
  conflictStrategy: ConflictStrategy;  // Default: 'newest-wins'
  
  // State
  lastSyncTimestamp: number;    // Unix ms of last successful sync
  lastSyncStats: {
    pulled: number;
    pushed: number;
    conflicts: number;
  } | null;
}
```

**Settings UI additions:**
- **Sync section** with server URL input + "Test Connection" button
- Auth fields (hidden by default, expand on toggle)
- Auto-sync toggle + interval slider
- Category checkboxes (populated from vault config)
- Conflict strategy dropdown
- "Sync Now" button
- Last sync status display

### 5. `SyncStatusView` (`src/sync/sync-status-view.ts`)

Add sync status to the existing ClawVault status sidebar panel (don't create a separate view).

Update `ClawVaultStatusView` to include a **Sync** section:

```
🔄 Sync
  Server: 100.64.31.68:8384 ✅
  Last sync: 2 min ago
  ↓ 3 pulled · ↑ 1 pushed · ⚡ 0 conflicts
  [Sync Now]
```

When syncing is in progress:
```
🔄 Syncing...
  ↓ Pulling 5/12 files...
  [Cancel]
```

When disconnected:
```
🔄 Sync
  Server: Disconnected ❌
  Last sync: 3 hours ago
  [Retry] [Configure]
```

### 6. Commands

Add to `src/commands.ts`:

| Command | ID | Hotkey | Description |
|---------|-----|--------|-------------|
| ClawVault: Sync Now | `clawvault-sync-now` | `Ctrl+Shift+S` | Manual trigger, pull+push |
| ClawVault: Sync Pull | `clawvault-sync-pull` | — | Pull only (safe for mobile) |
| ClawVault: Sync Push | `clawvault-sync-push` | — | Push only |
| ClawVault: Show Sync Status | `clawvault-sync-status` | — | Focus the sync section in sidebar |
| ClawVault: Configure Sync | `clawvault-sync-configure` | — | Open settings to sync section |

### 7. Auto-Sync

In `main.ts`, wire up auto-sync:

```typescript
// On layout ready (app open)
this.app.workspace.onLayoutReady(() => {
  if (this.settings.sync.syncOnOpen && this.settings.sync.serverUrl) {
    void this.syncEngine.sync();
  }
});

// Periodic sync
if (this.settings.sync.autoSyncEnabled) {
  this.registerInterval(
    window.setInterval(() => {
      void this.syncEngine.sync();
    }, this.settings.sync.autoSyncInterval * 60 * 1000)
  );
}
```

### 8. Mobile-Specific Considerations

| Concern | Solution |
|---------|----------|
| No `fs` access | Use `app.vault.adapter` exclusively (works on both `FileSystemAdapter` and `CapacitorAdapter`) |
| No `child_process` | Never shell out. All sync is HTTP via `requestUrl()` |
| No SubtleCrypto? | Actually available on mobile — use `crypto.subtle.digest('SHA-256', ...)` for checksums |
| Background sync unreliable | Don't rely on `syncOnClose`. Use periodic interval sync instead |
| Battery/data | Respect auto-sync interval. Don't sync more often than every 5 min |
| Large files | Stream via WebDAV GET/PUT. For very large vaults, support incremental manifest (only changed since timestamp) |
| Network changes | Health check before every sync. Graceful fail with cached state |
| `Platform.isMobile` | Use to hide desktop-only features (like "ask" conflict strategy modals) |

### 9. Ribbon Icon & Status Bar

- **Ribbon**: Add a sync icon (🔄 or `refresh-cw`) next to the existing database icon. Click → sync now.
- **Status bar**: Update existing status bar to show sync state: `🐘 631 nodes · 5 tasks · ↕ synced 2m ago`

---

## Server-Side Enhancements Needed (clawvault CLI)

### Minimal (to make this work well):

1. **Incremental manifest** — Add `?since=<timestamp>` param to manifest endpoint. Returns only files modified after that time. Reduces payload from O(all files) to O(changed files).

2. **Deletion tracking** — Current manifest only shows existing files. Need a `.clawvault/deletions.json` file that logs deleted file paths + timestamps. Allows sync client to differentiate "file doesn't exist remotely because it was deleted" vs "file doesn't exist remotely because it's new locally."

3. **ETag/Last-Modified on WebDAV responses** — Already partially implemented. Ensure consistency for conditional requests.

### Nice-to-have (v2):

4. **WebSocket for push notifications** — Server pushes "file changed" events so client can sync immediately instead of polling. Uses Obsidian's `requestUrl` for initial connection, then WebSocket (available on mobile via Capacitor).

5. **Chunked transfer for large files** — For vaults with images/attachments.

6. **Sync lock** — Prevent two clients from syncing simultaneously. Simple advisory lock via `POST /.clawvault/lock`.

---

## Migration Path from Remotely Save

For users currently using Remotely Save:

1. Plugin detects if Remotely Save is installed + configured with a ClawVault server URL
2. Shows one-time migration notice: "ClawVault now has built-in sync. Disable Remotely Save for this vault?"
3. Imports server URL and auth from Remotely Save config (if accessible)
4. First sync does a full reconciliation

---

## Implementation Order

### Phase 1: Core Sync (MVP)
1. `SyncClient` — HTTP client with `requestUrl`
2. `SyncEngine` — Manifest fetch, local manifest build, diff, execute
3. Settings additions — Server URL, auth, test connection
4. "Sync Now" command
5. Basic status in sidebar

### Phase 2: Auto & Polish
6. Auto-sync (interval, on-open)
7. Conflict resolution (newest-wins default)
8. Category filtering
9. Ribbon icon + status bar updates
10. Pull/Push only commands

### Phase 3: Server Enhancements
11. Incremental manifest on server
12. Deletion tracking on server
13. Sync lock

### Phase 4: Advanced
14. WebSocket push notifications
15. Migration from Remotely Save
16. Sync history/log viewer

---

## Testing Strategy

- **Unit tests**: SyncEngine diffing logic (mock manifest data)
- **Integration**: Start `clawvault serve` on localhost, run sync against it
- **Mobile**: Test on iOS + Android with Tailscale connected
- **Edge cases**: Empty vault, large vault (1000+ files), rapid successive syncs, network drop mid-sync, conflict scenarios

---

## Open Questions

1. **Checksum algorithm**: SHA-256 (stronger, slower) vs CRC32 (fast, weaker)? Leaning SHA-256 since SubtleCrypto is async and non-blocking.
2. **Binary files**: Should we sync images/attachments? The WebDAV handler supports them. Probably yes with a size limit setting.
3. **`.obsidian/` sync**: Currently blocked by WebDAV. Should plugin settings sync? Probably not — each device has its own plugin config.
4. **Offline queue**: If sync fails, should we queue changes and retry? Or just re-diff on next sync attempt? Leaning toward re-diff (simpler, manifest-based).

---

## What Done Looks Like

1. `npm run build` succeeds with zero errors
2. New files in `src/sync/`: `sync-client.ts`, `sync-engine.ts`, `sync-resolver.ts`
3. Settings tab has a "Sync" section with server URL, auth, test connection, auto-sync toggle, category filter, conflict strategy
4. "Sync Now" command works — fetches remote manifest, diffs, pulls/pushes files
5. Status sidebar shows sync state (connected/disconnected, last sync time, file counts)
6. Ribbon icon for quick sync
7. Auto-sync on interval when enabled
8. All existing features still work (graph colors, task commands, decorations, status panel)
9. Works on mobile via `requestUrl()` + `app.vault.adapter` — no Node.js APIs used
