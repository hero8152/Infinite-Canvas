import { useEffect, useRef, useState } from "react";
import type { AppRoute } from "../../app/routes";
import { postThemeToFrame, type ThemeName } from "../../lib/theme";

interface EmbeddedWorkbenchProps {
  routes: AppRoute[];
  activeRoute: AppRoute;
  theme: ThemeName;
  taskMessage: unknown;
}

export function EmbeddedWorkbench({ routes, activeRoute, theme, taskMessage }: EmbeddedWorkbenchProps) {
  const [loadedIds, setLoadedIds] = useState<Set<string>>(() => new Set([activeRoute.id]));
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const pendingProviderEvent = useRef<unknown>(null);

  useEffect(() => {
    setLoadedIds((current) => {
      if (current.has(activeRoute.id)) return current;
      const next = new Set(current);
      next.add(activeRoute.id);
      return next;
    });
  }, [activeRoute.id]);

  useEffect(() => {
    frames.current.forEach((frame) => postThemeToFrame(frame, theme));
  }, [theme, loadedIds]);

  useEffect(() => {
    if (!taskMessage) return;
    const frame = frames.current.get(activeRoute.id);
    try {
      frame?.contentWindow?.postMessage(taskMessage, "*");
    } catch {
      // Ignore iframe teardown races.
    }
  }, [activeRoute.id, taskMessage]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.data?.type !== "providers-changed") return;
      pendingProviderEvent.current = event.data;
      const canvas = frames.current.get("canvas");
      try {
        canvas?.contentWindow?.postMessage(event.data, "*");
      } catch {
        // Canvas may not be loaded yet.
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);

  return (
    <div className="qc-workbench" aria-label="Embedded workspace frame">
      {routes.filter((route) => route.kind === "embedded").map((route) => {
        const active = route.id === activeRoute.id;
        const loaded = loadedIds.has(route.id);
        return (
          <iframe
            key={route.id}
            ref={(node) => {
              if (node) {
                frames.current.set(route.id, node);
              } else {
                frames.current.delete(route.id);
              }
            }}
            className={`qc-embedded-frame${active ? " is-active" : ""}`}
            title={route.label}
            src={loaded ? route.src : undefined}
            data-route={route.id}
            aria-hidden={active ? undefined : true}
            onLoad={(event) => {
              postThemeToFrame(event.currentTarget, theme);
              if (route.id === "canvas" && pendingProviderEvent.current) {
                try {
                  event.currentTarget.contentWindow?.postMessage(pendingProviderEvent.current, "*");
                } catch {
                  // Ignore.
                }
              }
            }}
          />
        );
      })}
    </div>
  );
}
