import type { AppRoute } from "../../app/routes";

interface SidebarProps {
  routes: AppRoute[];
  activeRoute: AppRoute;
  apiReady: boolean;
  onNavigate: (route: AppRoute) => void;
}

const GROUP_LABELS: Record<string, string> = {
  create: "Create",
  workspace: "Workspace",
  system: "System"
};

export function Sidebar({ routes, activeRoute, apiReady, onNavigate }: SidebarProps) {
  const groups = ["create", "workspace", "system"];

  return (
    <aside className="qc-sidebar" aria-label="Primary">
      <div className="qc-brand">
        <span className="qc-brand-mark" aria-hidden="true">F</span>
        <div className="qc-brand-copy">
          <strong>Feebee Studios</strong>
          <span>Creative OS</span>
        </div>
      </div>

      <nav className="qc-nav">
        {groups.map((group) => (
          <div className="qc-nav-group" key={group}>
            <div className="qc-nav-group__label">{GROUP_LABELS[group]}</div>
            {routes.filter((route) => route.group === group).map((route) => {
              const Icon = route.icon;
              const active = route.id === activeRoute.id;
              return (
                <button
                  className={`qc-nav-item${active ? " is-active" : ""}`}
                  key={route.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => onNavigate(route)}
                >
                  <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
                  <span className="qc-nav-item__label">{route.label}</span>
                  {route.id === "api-config" ? (
                    <span className={`qc-nav-item__status${apiReady ? " is-on" : ""}`} aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
