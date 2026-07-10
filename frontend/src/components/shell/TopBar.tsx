import { Activity, Moon, PanelRightOpen, Plug, Sun, Wifi } from "lucide-react";
import type { AppRoute } from "../../app/routes";
import type { ApiConfig, QueueStatus } from "../../lib/api";
import type { ProviderStatus } from "../../lib/provider-status";
import type { ThemeName } from "../../lib/theme";
import { IconButton } from "../controls/IconButton";

interface TopBarProps {
  activeRoute: AppRoute;
  queueStatus: QueueStatus | null;
  onlineCount: number | null;
  wsState: string;
  apiConfig: ApiConfig | null;
  providerStatus: ProviderStatus;
  theme: ThemeName;
  onToggleTheme: () => void;
  onOpenRail: () => void;
}

export function TopBar({
  activeRoute,
  queueStatus,
  onlineCount,
  wsState,
  apiConfig,
  providerStatus,
  theme,
  onToggleTheme,
  onOpenRail
}: TopBarProps) {
  const queueLabel = queueStatus?.position
    ? `${queueStatus.position}/${queueStatus.total}`
    : `${queueStatus?.total ?? 0}`;
  const modelLabel = apiConfig?.image_model || "Image model";
  const ThemeIcon = theme === "dark" ? Sun : Moon;

  return (
    <header className="qc-topbar">
      <div className="qc-topbar__title">
        <div>
          <h1>{activeRoute.label}</h1>
          <p>{activeRoute.description}</p>
        </div>
      </div>

      <div className="qc-topbar__controls" aria-label="Workspace status">
        <div className="qc-model-chip">
          <span>Model</span>
          <strong>{modelLabel}</strong>
        </div>
        <div className={`qc-status-chip${providerStatus.configured ? " is-ready" : " is-muted"}`}>
          <Plug size={15} strokeWidth={2} aria-hidden="true" />
          <span>{providerStatus.label}</span>
        </div>
        <div className="qc-status-chip">
          <Activity size={15} strokeWidth={2} aria-hidden="true" />
          <span>Queue {queueLabel}</span>
        </div>
        <div className={`qc-status-chip${wsState === "open" ? " is-ready" : " is-muted"}`}>
          <Wifi size={15} strokeWidth={2} aria-hidden="true" />
          <span>{onlineCount ?? 0} online</span>
        </div>
        <IconButton label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} onClick={onToggleTheme}>
          <ThemeIcon size={17} strokeWidth={2} aria-hidden="true" />
        </IconButton>
        <IconButton label="Open Creation Rail" className="qc-rail-toggle" onClick={onOpenRail}>
          <PanelRightOpen size={17} strokeWidth={2} aria-hidden="true" />
        </IconButton>
      </div>
    </header>
  );
}
