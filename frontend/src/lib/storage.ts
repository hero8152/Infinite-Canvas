export const STORAGE_KEYS = {
  clientId: "client_id",
  theme: "studio_theme",
  legacyTheme: "canvas_theme",
  comflyToken: "comfly_token",
  modelscopeToken: "modelscope_api_token",
  providerModelKeys: "provider_model_keys",
  comflyBaseUrl: "comfly_base_url"
} as const;

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    const digit = char === "x" ? value : (value & 0x3) | 0x8;
    return digit.toString(16);
  });
}

export function getLocalValue(key: string): string {
  try {
    return (localStorage.getItem(key) || "").trim();
  } catch {
    return "";
  }
}

export function getOrCreateClientId(): string {
  const existing = getLocalValue(STORAGE_KEYS.clientId);
  if (existing) return existing;
  const next = randomId();
  localStorage.setItem(STORAGE_KEYS.clientId, next);
  return next;
}

export function readProviderModelKeys(): Record<string, Record<string, string>> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.providerModelKeys) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function hasLocalProviderKeys(): boolean {
  if (getLocalValue(STORAGE_KEYS.comflyToken) || getLocalValue(STORAGE_KEYS.modelscopeToken)) {
    return true;
  }
  const groups = Object.values(readProviderModelKeys());
  return groups.some((group) => (
    group && typeof group === "object" && Object.values(group).some((value) => String(value || "").trim())
  ));
}
