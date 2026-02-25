// === Draw.io MCP Extension — Content Script (content.js) ===
// Bridges the service worker (background.js) and the draw.io page context.
// Injects drawio-plugin.js into the page because content scripts can't
// access mxGraph directly.

// === Inject the draw.io plugin into the page context ===

const script = document.createElement("script");
script.src = chrome.runtime.getURL("drawio-plugin.js");
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);

console.log("[content] draw.io MCP content script loaded, plugin injected");

// === Relay: Service Worker → Page ===

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "MCP_REQUEST") {
    // Forward to the injected plugin via postMessage
    window.postMessage(
      {
        source: "drawio-mcp-content",
        type: "MCP_REQUEST",
        payload: message.payload,
      },
      "*"
    );
  }
});

// === Relay: Page → Service Worker ===

window.addEventListener("message", (event) => {
  if (
    event.data?.source === "drawio-mcp-plugin" &&
    event.data?.type === "MCP_REPLY"
  ) {
    chrome.runtime.sendMessage({
      type: "MCP_REPLY",
      payload: event.data.payload,
    });
  }
});
