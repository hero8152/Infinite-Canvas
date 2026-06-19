export interface TaskStreamHandlers {
  onOnlineCount: (count: number) => void;
  onTaskMessage: (message: unknown) => void;
  onStateChange: (state: "connecting" | "open" | "closed" | "error") => void;
}

export function connectTaskStream(clientId: string, handlers: TaskStreamHandlers): () => void {
  if (!window.location.host) return () => undefined;

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${window.location.host}/ws/stats?client_id=${encodeURIComponent(clientId)}`);
  let closed = false;

  handlers.onStateChange("connecting");

  socket.addEventListener("open", () => {
    if (!closed) handlers.onStateChange("open");
  });

  socket.addEventListener("message", (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "stats") {
        handlers.onOnlineCount(Number(data.online_count || 0));
      } else {
        handlers.onTaskMessage(data);
      }
    } catch {
      // Ignore malformed legacy messages.
    }
  });

  socket.addEventListener("error", () => {
    if (!closed) handlers.onStateChange("error");
  });

  socket.addEventListener("close", () => {
    if (!closed) handlers.onStateChange("closed");
  });

  return () => {
    closed = true;
    socket.close();
  };
}
