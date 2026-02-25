// === Draw.io MCP Extension — Service Worker (background.js) ===
// Manages WebSocket connection to MCP server and routes messages
// between the server and content scripts running in draw.io tabs.

let ws = null;
let heartbeatInterval = null;
let connectionState = "disconnected"; // "disconnected" | "connecting" | "connected"

// === WebSocket Management ===

function connect(port = 3333) {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  connectionState = "connecting";
  broadcastStatus();

  try {
    ws = new WebSocket(`ws://localhost:${port}`);
  } catch (err) {
    console.error("[bg] Failed to create WebSocket:", err);
    connectionState = "disconnected";
    broadcastStatus();
    scheduleReconnect(port);
    return;
  }

  ws.onopen = () => {
    console.log("[bg] WebSocket connected to MCP server on port", port);
    connectionState = "connected";
    broadcastStatus();

    // Start heartbeat to keep service worker alive (Chrome 116+ requirement)
    heartbeatInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ __event: "__ping" }));
      }
    }, 25_000);
  };

  ws.onmessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch (err) {
      console.error("[bg] Failed to parse message from server:", err);
      return;
    }

    console.log("[bg] Received from MCP server:", data.__event);

    // Forward to ALL draw.io tabs
    chrome.tabs.query({ url: "*://*.diagrams.net/*" }, (tabs) => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, {
          type: "MCP_REQUEST",
          payload: data,
        }).catch((err) => {
          // Tab may not have content script loaded yet
          console.warn("[bg] Could not send to tab", tab.id, err.message);
        });
      }
    });
  };

  ws.onclose = () => {
    console.log("[bg] WebSocket disconnected");
    connectionState = "disconnected";
    broadcastStatus();
    cleanup();
    scheduleReconnect(port);
  };

  ws.onerror = (err) => {
    console.error("[bg] WebSocket error:", err);
    // onclose will fire after onerror
  };
}

function cleanup() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

function scheduleReconnect(port) {
  setTimeout(() => connect(port), 3000);
}

function broadcastStatus() {
  // Notify popup if it's open
  chrome.runtime.sendMessage({
    type: "CONNECTION_STATUS",
    status: connectionState,
  }).catch(() => {
    // Popup not open, ignore
  });
}

// === Message Relay: Content Script → WebSocket ===

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "MCP_REPLY" && ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message.payload));
    sendResponse({ ok: true });
  } else if (message.type === "GET_STATUS") {
    sendResponse({ status: connectionState });
  } else if (message.type === "SET_PORT") {
    const newPort = parseInt(message.port, 10);
    if (!isNaN(newPort) && newPort > 0 && newPort < 65536) {
      chrome.storage.local.set({ mcpPort: newPort }, () => {
        cleanup();
        if (ws) {
          ws.close();
          ws = null;
        }
        connect(newPort);
        sendResponse({ ok: true });
      });
      return true; // async response
    } else {
      sendResponse({ ok: false, error: "Invalid port number" });
    }
  }
  return true; // keep channel open for async
});

// === Auto-connect on extension load ===

chrome.storage.local.get(["mcpPort"], (result) => {
  connect(result.mcpPort || 3333);
});
