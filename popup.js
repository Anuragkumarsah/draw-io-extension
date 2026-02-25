// === Draw.io MCP Extension — Popup Script (popup.js) ===

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const portInput = document.getElementById("portInput");
const saveBtn = document.getElementById("saveBtn");
const toast = document.getElementById("toast");

const STATUS_MAP = {
  connected: { dotClass: "connected", label: "Connected to MCP Server" },
  connecting: { dotClass: "connecting", label: "Connecting…" },
  disconnected: { dotClass: "disconnected", label: "Disconnected" },
};

function updateStatus(status) {
  const info = STATUS_MAP[status] || STATUS_MAP.disconnected;
  statusDot.className = `status-dot ${info.dotClass}`;
  statusText.textContent = info.label;
}

function showToast(message, type = "success") {
  toast.textContent = message;
  toast.className = `toast ${type}`;
  setTimeout(() => {
    toast.className = "toast";
  }, 3000);
}

// Load saved port
chrome.storage.local.get(["mcpPort"], (result) => {
  portInput.value = result.mcpPort || 3333;
});

// Get current connection status
chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
  if (response?.status) {
    updateStatus(response.status);
  }
});

// Listen for status updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "CONNECTION_STATUS") {
    updateStatus(message.status);
  }
});

// Save port
saveBtn.addEventListener("click", () => {
  const port = parseInt(portInput.value, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    showToast("Invalid port (1-65535)", "error");
    return;
  }

  chrome.runtime.sendMessage({ type: "SET_PORT", port }, (response) => {
    if (response?.ok) {
      showToast(`Port updated to ${port}`);
    } else {
      showToast(response?.error || "Failed to update port", "error");
    }
  });
});
