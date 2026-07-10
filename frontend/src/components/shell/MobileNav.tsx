import type { AppRoute } from "../../app/routes";

interface MobileNavProps {
  routes: AppRoute[];
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
}

const MOBILE_ROUTE_IDS = new Set(["zimage", "enhance", "klein", "online", "gpt-chat", "canvas", "gallery"]);

export function MobileNav({ routes, activeRoute, onNavigate }: MobileNavProps) {
  return (
    <nav className="qc-mobile-nav" aria-label="Mobile primary">
      {routes.filter((route) => MOBILE_ROUTE_IDS.has(route.id)).map((route) => {
        const Icon = route.icon;
        const active = route.id === activeRoute.id;
        return (
          <button
            className={`qc-mobile-nav__item${active ? " is-active" : ""}`}
            key={route.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onNavigate(route)}
          >
            <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
            <span>{route.shortLabel}</span>
          </button>
        );
      })}
    </nav>
  );
}
