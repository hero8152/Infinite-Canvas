import type { ApiConfig } from "./api";
import { hasLocalProviderKeys } from "./storage";

export interface ProviderStatus {
  configured: boolean;
  label: string;
  detail: string;
}

export function providerStatusFromConfig(config: ApiConfig | null, configError: boolean): ProviderStatus {
  if (configError) {
    return {
      configured: false,
      label: "API offline",
      detail: "Config endpoint unavailable"
    };
  }

  const providerHasKey = Boolean(config?.api_providers?.some((provider) => provider.enabled !== false && provider.has_key));
  const configured = hasLocalProviderKeys() || Boolean(config?.has_api_key || config?.has_ms_key || providerHasKey);

  if (configured) {
    const primary = config?.api_providers?.find((provider) => provider.id === config.primary_provider_id)?.name;
    return {
      configured: true,
      label: "API ready",
      detail: primary || config?.base_url || "Provider key available"
    };
  }

  return {
    configured: false,
    label: "API not configured",
    detail: "Add a provider key to generate"
  };
}
