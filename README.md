# Draw.io MCP Bridge Extension

A Chrome Manifest V3 extension that bridges AI/LLM agents to the draw.io canvas. It connects to the [drawio-mcp-server](https://github.com/Anuragkumarsah/drawio-mcp-server) via WebSocket and executes diagram manipulation commands directly on draw.io using the mxGraph API.

## How It Works

The extension has three layers, required by Chrome's security model:

```
MCP Server ──(WebSocket)──► Service Worker ──(chrome.messaging)──► Content Script ──(postMessage)──► Page Plugin ──(mxGraph API)──► draw.io
```

| Layer              | File                      | Purpose                                                      |
| ------------------ | ------------------------- | ------------------------------------------------------------ |
| **Service Worker** | `background.js`           | Manages WebSocket connection to the MCP server               |
| **Content Script** | `content.js`              | Message relay between service worker and page context        |
| **Page Plugin**    | `drawio-plugin.js`        | Injected into draw.io page, has direct access to mxGraph API |
| **Popup UI**       | `popup.html` + `popup.js` | Connection status display and port configuration             |

## Prerequisites

- **Google Chrome** v116 or later (Manifest V3 service worker support)
- The [drawio-mcp-server](https://github.com/Anuragkumarsah/drawio-mcp-server) must be running

## Setup & Installation

### 1. Get the Extension Files

Ensure you have the complete extension directory:

```
drawio-mcp-extension/
├── manifest.json
├── background.js
├── content.js
├── drawio-plugin.js
├── popup.html
├── popup.js
└── icons/
    └── icon128.png
```

### 2. Load in Chrome (Developer Mode)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **"Load unpacked"**
4. Select the `drawio-mcp-extension` folder
5. The extension should appear with the "Draw.io MCP Bridge" name

### 3. Verify Connection

1. Make sure the MCP server is running (it starts automatically with your MCP client)
2. Open [app.diagrams.net](https://app.diagrams.net) in Chrome
3. Click the extension icon in the toolbar — you should see a **green dot** with "Connected to MCP Server"

### 4. Configure Port (Optional)

If your MCP server uses a custom port (not the default `3333`):

1. Click the extension icon in the toolbar
2. Enter the port number in the **WebSocket Port** field
3. Click **Save**
4. The extension will reconnect automatically

> **Important:** The port must match the MCP server's WebSocket port.

## Features

### Supported Operations

The extension handles 4 types of MCP tool commands:

| Command             | What it does on the canvas                                           |
| ------------------- | -------------------------------------------------------------------- |
| `render_subgraph`   | Creates nodes and edges, applies auto-layout, optionally returns SVG |
| `export_diagram`    | Exports current diagram as SVG (base64 or raw XML)                   |
| `modify_subgraph`   | Adds/removes/updates nodes and edges incrementally                   |
| `get_diagram_state` | Returns JSON of all nodes (with geometry) and edges                  |

### Auto-Layout Algorithms

- **Hierarchical** — `mxHierarchicalLayout` (DAGs, flowcharts)
- **Organic** — `mxFastOrganicLayout` (force-directed)
- **Circle** — `mxCircleLayout`
- **Tree** — `mxCompactTreeLayout`

### Connection Management

- **Auto-connect** on extension load
- **Auto-reconnect** every 3 seconds if disconnected
- **Heartbeat** sent every 25 seconds to keep the service worker alive
- **Status indicator** in the popup (green/yellow/red)

## Debugging

### View Extension Logs

1. Go to `chrome://extensions/`
2. Find "Draw.io MCP Bridge"
3. Click **"Inspect views: service worker"** to open DevTools for `background.js`
4. Check the Console for WebSocket connection logs

### View Plugin Logs

1. Open [app.diagrams.net](https://app.diagrams.net)
2. Open browser DevTools (F12)
3. Look for `[drawio-plugin]` messages in the Console
4. You should see `MCP plugin loaded, graph available` when the plugin initializes

### View Content Script Logs

1. On the draw.io page, open DevTools (F12)
2. Look for `[content]` messages in the Console

### Common Log Messages

| Message                                               | Meaning                                       |
| ----------------------------------------------------- | --------------------------------------------- |
| `[bg] WebSocket connected to MCP server on port 3333` | Extension successfully connected to server    |
| `[bg] WebSocket disconnected`                         | Lost connection, will retry in 3 seconds      |
| `[drawio-plugin] MCP plugin loaded, graph available`  | Plugin initialized, ready to receive commands |
| `[drawio-plugin] Handling event: render_subgraph`     | Processing a tool command                     |

## Troubleshooting

| Issue                                    | Solution                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| Popup shows **"Disconnected"** (red dot) | Ensure the MCP server is running and the port matches                         |
| Plugin not loading                       | Refresh the draw.io tab; check that draw.io fully loaded before the extension |
| `Could not send to tab` warnings         | Normal if draw.io tab is still loading; the message will retry                |
| Extension not appearing                  | Ensure Developer mode is on in `chrome://extensions/`                         |
| SVG export returns null                  | Check the DevTools console for `[drawio-plugin] SVG export failed` errors     |

## How the Message Flow Works

```
1. MCP Server sends:   { __event: "render_subgraph", __request_id: "abc123", nodes: [...] }
2. background.js:      Receives via WebSocket → forwards to all draw.io tabs
3. content.js:         Receives via chrome.runtime → forwards to page via postMessage
4. drawio-plugin.js:   Receives via window.message → calls mxGraph API → creates diagram
5. drawio-plugin.js:   Sends reply: { __event: "render_subgraph.abc123", success: true, svg_base64: "..." }
6. content.js:         Receives via window.message → forwards to background via chrome.runtime
7. background.js:      Receives via chrome.runtime → sends to MCP server via WebSocket
```
