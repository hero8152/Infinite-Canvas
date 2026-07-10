import type { LucideIcon } from "lucide-react";
import {
  Cloud,
  Image,
  Images,
  KeyRound,
  Layers,
  MessageSquare,
  Pencil,
  RotateCcw,
  Settings,
  Sparkles
} from "lucide-react";

export type RouteGroup = "create" | "workspace" | "system";
export type RouteKind = "native-generate" | "native-enhance" | "native-edit" | "native-online" | "native-angle" | "native-chat" | "native-gallery" | "native-canvas" | "native-api-models" | "native-comfyui" | "embedded";

export interface AppRoute {
  id: string;
  path: string;
  label: string;
  shortLabel: string;
  description: string;
  kind: RouteKind;
  src?: string;
  group: RouteGroup;
  icon: LucideIcon;
}

export const APP_ROUTES: AppRoute[] = [
  {
    id: "zimage",
    path: "generate",
    label: "Generate",
    shortLabel: "Gen",
    description: "Text to image",
    kind: "native-generate",
    group: "create",
    icon: Image
  },
  {
    id: "enhance",
    path: "enhance",
    label: "Enhance",
    shortLabel: "Enh",
    description: "Detail enhancement",
    kind: "native-enhance",
    group: "create",
    icon: Sparkles
  },
  {
    id: "klein",
    path: "edit",
    label: "Edit",
    shortLabel: "Edit",
    description: "Image editing",
    kind: "native-edit",
    group: "create",
    icon: Pencil
  },
  {
    id: "online",
    path: "online",
    label: "Online",
    shortLabel: "Cloud",
    description: "Hosted generation",
    kind: "native-online",
    group: "create",
    icon: Cloud
  },
  {
    id: "angle",
    path: "angle",
    label: "Angle",
    shortLabel: "Angle",
    description: "View control",
    kind: "native-angle",
    group: "create",
    icon: RotateCcw
  },
  {
    id: "gpt-chat",
    path: "chat",
    label: "Chat",
    shortLabel: "Chat",
    description: "Assistant workspace",
    kind: "native-chat",
    group: "workspace",
    icon: MessageSquare
  },
  {
    id: "gallery",
    path: "gallery",
    label: "Gallery",
    shortLabel: "Gallery",
    description: "Asset library",
    kind: "native-gallery",
    group: "workspace",
    icon: Images
  },
  {
    id: "canvas",
    path: "canvas",
    label: "Canvas",
    shortLabel: "Canvas",
    description: "Infinite board",
    kind: "native-canvas",
    group: "workspace",
    icon: Layers
  },
  {
    id: "api-config",
    path: "api-models",
    label: "API / Models",
    shortLabel: "API",
    description: "Provider setup",
    kind: "native-api-models",
    group: "system",
    icon: KeyRound
  },
  {
    id: "comfyui-settings",
    path: "comfyui",
    label: "ComfyUI",
    shortLabel: "Comfy",
    description: "Local instance settings",
    kind: "native-comfyui",
    group: "system",
    icon: Settings
  }
];

export const DEFAULT_ROUTE_ID = "zimage";

const REMOVED_ROUTE_REDIRECTS: Record<string, string> = {
  "legacy-generate": "zimage",
  "legacy-enhance": "enhance",
  "legacy-edit": "klein",
  "legacy-online": "online",
  "legacy-chat": "gpt-chat",
  "legacy-gallery": "gallery",
  flatlay: "gallery",
  "batch-tryon": "gallery"
};

function routeCandidateFromLocation(location: Location): string {
  const routeParam = new URLSearchParams(location.search).get("route");
  const pathSegments = location.pathname.split("/").filter(Boolean);
  return routeParam || (pathSegments[0] === "app" ? pathSegments[1] : "") || "";
}

export function routeById(routeId: string): AppRoute {
  return APP_ROUTES.find((route) => route.id === routeId) ?? APP_ROUTES[0];
}

export function routeFromLocation(location: Location = window.location): AppRoute {
  const candidate = routeCandidateFromLocation(location);
  const redirected = REMOVED_ROUTE_REDIRECTS[candidate] || candidate;
  return APP_ROUTES.find((route) => route.id === redirected || route.path === redirected) ?? routeById(DEFAULT_ROUTE_ID);
}

export function appPathForRoute(route: AppRoute): string {
  return route.id === DEFAULT_ROUTE_ID ? "/app" : `/app/${route.path}`;
}

export function normalizedAppPathForLocation(location: Location = window.location): string | null {
  const candidate = routeCandidateFromLocation(location);
  const redirected = REMOVED_ROUTE_REDIRECTS[candidate];
  if (!redirected) return null;
  return appPathForRoute(routeById(redirected));
}
