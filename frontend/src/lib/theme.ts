import { STORAGE_KEYS } from "./storage";

export type ThemeName = "light" | "dark";

export function normalizeTheme(theme: string | null | undefined): ThemeName {
  return theme === "dark" ? "dark" : "light";
}

export function readStoredTheme(): ThemeName {
  try {
    return normalizeTheme(localStorage.getItem(STORAGE_KEYS.theme) || localStorage.getItem(STORAGE_KEYS.legacyTheme));
  } catch {
    return "light";
  }
}

export function applyTheme(theme: ThemeName, persist = false): void {
  const next = normalizeTheme(theme);
  const dark = next === "dark";
  document.documentElement.dataset.theme = next;
  document.documentElement.classList.toggle("studio-theme-dark", dark);
  if (document.body) {
    document.body.classList.toggle("studio-theme-dark", dark);
    document.body.classList.toggle("theme-dark", dark);
  }
  if (persist) {
    localStorage.setItem(STORAGE_KEYS.theme, next);
    localStorage.setItem(STORAGE_KEYS.legacyTheme, next);
  }
  window.dispatchEvent(new CustomEvent("studio-theme-change", { detail: { theme: next } }));
}

export function postThemeToFrame(frame: HTMLIFrameElement | null | undefined, theme: ThemeName): void {
  try {
    frame?.contentWindow?.postMessage({ type: "studio-theme", theme }, "*");
  } catch {
    // Cross-document postMessage can fail during iframe teardown.
  }
}
