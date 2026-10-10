// Remembers which browser windows have the Glacier panel open.
// Each open panel keeps a connection to the background and the background
// records it here; the connection dropping means the panel closed.

export function createOpenPanels() {
  const connectionsByWindow = new Map();

  return {
    connect(windowId, connectionId) {
      if (!connectionsByWindow.has(windowId)) {
        connectionsByWindow.set(windowId, new Set());
      }
      connectionsByWindow.get(windowId).add(connectionId);
    },

    disconnect(windowId, connectionId) {
      const connections = connectionsByWindow.get(windowId);
      if (!connections) return;
      connections.delete(connectionId);
      if (connections.size === 0) connectionsByWindow.delete(windowId);
    },

    isOpen(windowId) {
      return connectionsByWindow.has(windowId);
    },
  };
}
