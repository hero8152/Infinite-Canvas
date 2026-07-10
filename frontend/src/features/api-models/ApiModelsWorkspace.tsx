import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Database, KeyRound, ListPlus, Loader2, RefreshCw, Save, ShieldCheck, Trash2, Wifi } from "lucide-react";
import {
  fetchProviderModels,
  getProviders,
  probeProviderAsync,
  saveProviders,
  testProviderConnection,
  type ApiConfig,
  type ApiProvider,
  type ApiProviderSavePayload,
  type ProviderConnectionPayload
} from "../../lib/api";
import type { CreationTaskSummary } from "../../lib/creation-state";
import type { ProviderStatus } from "../../lib/provider-status";
import { Button } from "../../components/controls/Button";
import { IconButton } from "../../components/controls/IconButton";
import "./api-models.css";

export type ApiModelsTaskSummary = CreationTaskSummary;

export interface ApiModelsRailContext {
  providerName: string;
  providerId: string;
  enabled: boolean;
  primary: boolean;
  hasKey: boolean;
  keyPreview: string;
  protocol: string;
  baseUrl: string;
  imageModelCount: number;
  chatModelCount: number;
  videoModelCount: number;
  loraCount: number;
  lastAction: string;
  lastStatus: string;
  error?: string;
  detail: string;
}

interface ApiModelsWorkspaceProps {
  apiConfig: ApiConfig | null;
  providerStatus: ProviderStatus;
  onTaskChange: (task: ApiModelsTaskSummary) => void;
  onContextChange: (context: ApiModelsRailContext) => void;
  onSaved: () => void;
}

type ApiProviderDraft = ApiProvider & {
  id: string;
  name: string;
  base_url: string;
  protocol: string;
  enabled: boolean;
  primary: boolean;
  image_generation_endpoint: string;
  image_edit_endpoint: string;
  image_models: string[];
  chat_models: string[];
  video_models: string[];
  ms_loras: Record<string, unknown>;
  ms_defaults_version: string;
};

type ProviderAction = "load" | "save" | "test" | "fetch" | "probe" | "clear" | "delete" | "idle";

const DEFAULT_PROVIDER: ApiProviderDraft = {
  id: "",
  name: "",
  base_url: "",
  protocol: "openai",
  enabled: true,
  primary: false,
  image_generation_endpoint: "",
  image_edit_endpoint: "",
  image_models: [],
  chat_models: [],
  video_models: [],
  ms_loras: {},
  ms_defaults_version: "",
  has_key: false,
  key_preview: "",
  key_env: ""
};

function normalizeDraft(provider: ApiProvider): ApiProviderDraft {
  return {
    ...DEFAULT_PROVIDER,
    ...provider,
    id: String(provider.id || "").trim().toLowerCase(),
    name: String(provider.name || provider.id || "").trim(),
    base_url: String(provider.base_url || "").trim(),
    protocol: provider.protocol === "apimart" ? "apimart" : "openai",
    enabled: provider.enabled !== false,
    primary: Boolean(provider.primary),
    image_generation_endpoint: String(provider.image_generation_endpoint || "").trim(),
    image_edit_endpoint: String(provider.image_edit_endpoint || "").trim(),
    image_models: provider.image_models || [],
    chat_models: provider.chat_models || [],
    video_models: provider.video_models || [],
    ms_loras: provider.ms_loras && typeof provider.ms_loras === "object" ? provider.ms_loras : {},
    ms_defaults_version: String(provider.ms_defaults_version || ""),
    has_key: Boolean(provider.has_key),
    key_preview: provider.key_preview || "",
    key_env: provider.key_env || ""
  };
}

function listText(values: string[] | undefined): string {
  return (values || []).join("\n");
}

function parseList(value: string): string[] {
  return String(value || "")
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function loraText(provider: ApiProviderDraft): string {
  return provider.ms_loras && Object.keys(provider.ms_loras).length ? JSON.stringify(provider.ms_loras, null, 2) : "";
}

function loraCount(provider: ApiProviderDraft): number {
  return provider.ms_loras && typeof provider.ms_loras === "object" ? Object.keys(provider.ms_loras).length : 0;
}

function keyStatus(provider: ApiProviderDraft): string {
  return provider.key_preview || (provider.has_key ? "key set" : "no key");
}

function providerDetail(provider: ApiProviderDraft): string {
  return `${provider.id || "new"} · ${provider.protocol || "openai"} · ${keyStatus(provider)}`;
}

function publicProviderPayload(provider: ApiProviderDraft, loras: Record<string, unknown>): ApiProviderSavePayload {
  return {
    id: provider.id.trim().toLowerCase(),
    name: provider.name.trim() || provider.id.trim().toLowerCase(),
    base_url: provider.base_url.trim(),
    protocol: provider.protocol || "openai",
    enabled: provider.enabled,
    primary: provider.primary,
    image_generation_endpoint: provider.image_generation_endpoint.trim(),
    image_edit_endpoint: provider.image_edit_endpoint.trim(),
    image_models: provider.image_models,
    chat_models: provider.chat_models,
    video_models: provider.video_models,
    ms_loras: loras,
    ms_defaults_version: provider.ms_defaults_version.trim()
  };
}

function parseLoras(text: string): Record<string, unknown> {
  const clean = text.trim();
  if (!clean) return {};
  const parsed = JSON.parse(clean) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("ModelScope LoRA JSON must be an object.");
  }
  return parsed as Record<string, unknown>;
}

function safeProviderId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

export function ApiModelsWorkspace({ apiConfig, providerStatus, onTaskChange, onContextChange, onSaved }: ApiModelsWorkspaceProps) {
  const [providers, setProviders] = useState<ApiProviderDraft[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [newKey, setNewKey] = useState("");
  const [loraDrafts, setLoraDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [activeAction, setActiveAction] = useState<ProviderAction>("load");
  const [statusText, setStatusText] = useState("Loading providers");
  const [errorText, setErrorText] = useState("");
  const [lastAction, setLastAction] = useState("Load providers");

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedId) || providers[0] || null,
    [providers, selectedId]
  );
  const selectedLoras = selectedProvider ? loraDrafts[selectedProvider.id] ?? loraText(selectedProvider) : "";
  const busy = loading || activeAction !== "idle";
  const providerCounts = useMemo(() => ({
    total: providers.length,
    enabled: providers.filter((provider) => provider.enabled).length,
    keyed: providers.filter((provider) => provider.has_key).length
  }), [providers]);

  const setTask = useCallback((task: ApiModelsTaskSummary) => {
    onTaskChange(task);
  }, [onTaskChange]);

  const loadProviders = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    setActiveAction("load");
    setErrorText("");
    setStatusText("Loading providers");
    setTask({ status: "pending", label: "API providers loading", detail: "Reading saved provider config" });
    getProviders(signal)
      .then((response) => {
        const drafts = (response.providers || []).map(normalizeDraft);
        const primary = response.primary_provider_id || drafts.find((provider) => provider.primary)?.id || drafts[0]?.id || "";
        setProviders(drafts);
        setSelectedId(primary);
        setLoraDrafts(Object.fromEntries(drafts.map((provider) => [provider.id, loraText(provider)])));
        setStatusText(drafts.length ? `Loaded ${drafts.length} provider${drafts.length === 1 ? "" : "s"}` : "No providers configured");
        setTask({ status: "idle", label: "API providers ready", detail: `${drafts.length} provider${drafts.length === 1 ? "" : "s"} loaded` });
      })
      .catch((error) => {
        if (signal?.aborted) return;
        const message = error instanceof Error ? error.message : "Provider list failed to load.";
        setErrorText(message);
        setStatusText("Provider load failed");
        setTask({ status: "failed", label: "API providers failed", detail: message, error: message });
      })
      .finally(() => {
        if (!signal?.aborted) {
          setLoading(false);
          setActiveAction("idle");
        }
      });
  }, [setTask]);

  useEffect(() => {
    const abort = new AbortController();
    loadProviders(abort.signal);
    return () => abort.abort();
  }, [loadProviders]);

  useEffect(() => {
    if (!selectedProvider) {
      onContextChange({
        providerName: "No provider",
        providerId: "",
        enabled: false,
        primary: false,
        hasKey: false,
        keyPreview: "no key",
        protocol: "",
        baseUrl: "",
        imageModelCount: 0,
        chatModelCount: 0,
        videoModelCount: 0,
        loraCount: 0,
        lastAction,
        lastStatus: statusText,
        error: errorText,
        detail: "No API provider selected."
      });
      return;
    }
    onContextChange({
      providerName: selectedProvider.name || selectedProvider.id,
      providerId: selectedProvider.id,
      enabled: selectedProvider.enabled,
      primary: selectedProvider.primary,
      hasKey: Boolean(selectedProvider.has_key),
      keyPreview: keyStatus(selectedProvider),
      protocol: selectedProvider.protocol,
      baseUrl: selectedProvider.base_url,
      imageModelCount: selectedProvider.image_models.length,
      chatModelCount: selectedProvider.chat_models.length,
      videoModelCount: selectedProvider.video_models.length,
      loraCount: loraCount(selectedProvider),
      lastAction,
      lastStatus: statusText,
      error: errorText,
      detail: `${selectedProvider.name || selectedProvider.id} · ${selectedProvider.enabled ? "enabled" : "disabled"} · ${selectedProvider.primary ? "primary" : "secondary"}`
    });
  }, [errorText, lastAction, onContextChange, selectedProvider, statusText]);

  const updateSelected = useCallback((patch: Partial<ApiProviderDraft>) => {
    if (!selectedProvider) return;
    const nextId = patch.id !== undefined ? safeProviderId(patch.id) : selectedProvider.id;
    if (patch.id !== undefined) setSelectedId(nextId);
    setProviders((current) => current.map((provider) => (
      provider.id === selectedProvider.id
        ? {
            ...provider,
            ...patch,
            id: nextId,
            name: patch.name !== undefined ? patch.name : provider.name
          }
        : provider
    )));
  }, [selectedProvider]);

  const selectProvider = useCallback((providerId: string) => {
    setSelectedId(providerId);
    setNewKey("");
    setErrorText("");
  }, []);

  const buildSavePayload = useCallback((options: { clearKey?: boolean } = {}) => {
    if (!selectedProvider) throw new Error("Select a provider before saving.");
    const selected = selectedProvider.id;
    const payload = providers.map((provider) => {
      const loras = parseLoras(loraDrafts[provider.id] ?? loraText(provider));
      const item = publicProviderPayload(provider, loras);
      if (provider.id === selected && newKey.trim()) item.api_key = newKey.trim();
      if (provider.id === selected && options.clearKey) item.clear_key = true;
      return item;
    });
    return payload;
  }, [loraDrafts, newKey, providers, selectedProvider]);

  const applySavedProviders = useCallback((saved: ApiProvider[]) => {
    const drafts = saved.map(normalizeDraft);
    setProviders(drafts);
    setSelectedId((current) => drafts.some((provider) => provider.id === current) ? current : drafts.find((provider) => provider.primary)?.id || drafts[0]?.id || "");
    setLoraDrafts(Object.fromEntries(drafts.map((provider) => [provider.id, loraText(provider)])));
    setNewKey("");
  }, []);

  const runSave = useCallback(async (options: { clearKey?: boolean } = {}) => {
    setActiveAction(options.clearKey ? "clear" : "save");
    setLastAction(options.clearKey ? "Clear key" : "Save providers");
    setErrorText("");
    setStatusText(options.clearKey ? "Clearing key" : "Saving providers");
    setTask({ status: "running", label: options.clearKey ? "API key clearing" : "API providers saving", detail: selectedProvider?.name || "Provider config" });
    try {
      const response = await saveProviders(buildSavePayload(options));
      applySavedProviders(response.providers || []);
      setStatusText(options.clearKey ? "Key cleared" : "Saved");
      setTask({ status: "succeeded", label: options.clearKey ? "API key cleared" : "API providers saved", detail: response.primary_provider_id || selectedProvider?.id || "" });
      window.postMessage({ type: "providers-changed" }, "*");
      onSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Provider save failed.";
      setErrorText(message);
      setStatusText(options.clearKey ? "Clear key failed" : "Save failed");
      setTask({ status: "failed", label: options.clearKey ? "API key clear failed" : "API providers save failed", detail: message, error: message });
    } finally {
      setActiveAction("idle");
    }
  }, [applySavedProviders, buildSavePayload, onSaved, selectedProvider, setTask]);

  const actionPayload = useCallback((): ProviderConnectionPayload => {
    if (!selectedProvider) throw new Error("Select a provider first.");
    return {
      id: selectedProvider.id,
      provider_id: selectedProvider.id,
      name: selectedProvider.name,
      base_url: selectedProvider.base_url,
      protocol: selectedProvider.protocol,
      image_generation_endpoint: selectedProvider.image_generation_endpoint,
      image_edit_endpoint: selectedProvider.image_edit_endpoint,
      api_key: newKey.trim()
    };
  }, [newKey, selectedProvider]);

  const runProviderAction = useCallback(async (action: "test" | "fetch" | "probe") => {
    const actionLabel = action === "test" ? "Test connection" : action === "fetch" ? "Fetch models" : "Probe async";
    setActiveAction(action);
    setLastAction(actionLabel);
    setErrorText("");
    setStatusText(`${actionLabel} running`);
    setTask({ status: "running", label: actionLabel, detail: selectedProvider?.name || "Provider action" });
    try {
      const payload = actionPayload();
      if (action === "test") {
        const response = await testProviderConnection(payload);
        setStatusText(`Connected. ${response.raw_count || response.models?.length || 0} models found.`);
      } else if (action === "fetch") {
        const response = await fetchProviderModels(payload);
        if (response.image_models?.length || response.chat_models?.length || response.video_models?.length) {
          updateSelected({
            image_models: response.image_models || [],
            chat_models: response.chat_models || [],
            video_models: response.video_models || []
          });
        }
        setStatusText(`Fetched ${(response.models || []).length} models.`);
      } else {
        const response = await probeProviderAsync(payload);
        setStatusText(response.ok ? `Async protocol OK (${response.status_code || "ok"}).` : `Async protocol unavailable: ${response.detail || response.status_code || "unknown"}`);
      }
      setTask({ status: "succeeded", label: `${actionLabel} complete`, detail: selectedProvider?.name || "" });
    } catch (error) {
      const message = error instanceof Error ? error.message : `${actionLabel} failed.`;
      setErrorText(message);
      setStatusText(`${actionLabel} failed`);
      setTask({ status: "failed", label: `${actionLabel} failed`, detail: message, error: message });
    } finally {
      setActiveAction("idle");
    }
  }, [actionPayload, selectedProvider, setTask, updateSelected]);

  const addProvider = useCallback(() => {
    const id = `provider_${Date.now().toString(36)}`;
    const next = normalizeDraft({
      id,
      name: "New Provider",
      base_url: "",
      protocol: "openai",
      enabled: true,
      primary: false,
      image_generation_endpoint: "",
      image_edit_endpoint: "",
      image_models: [],
      chat_models: [],
      video_models: [],
      ms_loras: {},
      ms_defaults_version: ""
    });
    setProviders((current) => [...current, next]);
    setLoraDrafts((current) => ({ ...current, [id]: "" }));
    setSelectedId(id);
    setNewKey("");
    setStatusText("New provider added to draft. Save to apply.");
    setLastAction("Add provider");
  }, []);

  const deleteProvider = useCallback(() => {
    const target = providers.find((provider) => provider.id === selectedId) || selectedProvider;
    if (!target || target.id === "comfly" || target.id === "modelscope") return;
    const confirmed = window.confirm(`Delete ${target.name || target.id} from the saved provider list after the next save?`);
    if (!confirmed) return;
    const remaining = providers.filter((provider) => provider.id !== target.id);
    setProviders(remaining);
    setLoraDrafts((current) => {
      const next = { ...current };
      delete next[target.id];
      return next;
    });
    setSelectedId(remaining[0]?.id || "");
    setNewKey("");
    setStatusText("Deleted from draft. Save to apply.");
    setLastAction("Delete provider");
  }, [providers, selectedId, selectedProvider]);

  const toggleSelected = useCallback((field: "enabled" | "primary") => {
    if (!selectedProvider) return;
    setProviders((current) => current.map((provider) => {
      if (provider.id !== selectedProvider.id) {
        return field === "primary" ? { ...provider, primary: false } : provider;
      }
      return { ...provider, [field]: !provider[field] };
    }));
  }, [selectedProvider]);

  const modelCount = selectedProvider
    ? selectedProvider.image_models.length + selectedProvider.chat_models.length + selectedProvider.video_models.length
    : 0;

  return (
    <section className="qc-api-models-workspace" aria-label="Native API / Models workspace">
      <aside className="qc-api-providers-panel" aria-label="Provider list">
        <div className="qc-api-panel-head">
          <div>
            <h2>API / Models</h2>
            <span>{providerCounts.enabled} enabled · {providerCounts.keyed} keyed</span>
          </div>
          <IconButton label="Refresh providers" onClick={() => loadProviders()} disabled={busy}>
            <RefreshCw size={16} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        </div>

        <div className="qc-api-provider-list">
          {providers.map((provider) => (
            <button
              type="button"
              className={`qc-api-provider-item${provider.id === selectedProvider?.id ? " is-active" : ""}`}
              key={provider.id}
              onClick={() => selectProvider(provider.id)}
            >
              <span>{provider.name || provider.id}</span>
              <small>{providerDetail(provider)}</small>
              <em>{provider.primary ? "Primary" : provider.enabled ? "Enabled" : "Disabled"}</em>
            </button>
          ))}
          {!providers.length && !loading ? <div className="qc-api-empty">No providers configured</div> : null}
        </div>

        <div className="qc-api-provider-actions">
          <Button variant="secondary" icon={<ListPlus size={15} strokeWidth={2} aria-hidden="true" />} onClick={addProvider}>
            Add provider
          </Button>
        </div>
      </aside>

      <main className="qc-api-editor">
        <header className="qc-api-editor-head">
          <div>
            <h3>{selectedProvider?.name || "Provider"}</h3>
            <span>{selectedProvider ? providerDetail(selectedProvider) : "Select a provider"}</span>
          </div>
          <Button variant="primary" icon={activeAction === "save" ? <Loader2 className="qc-spin" size={16} strokeWidth={2} aria-hidden="true" /> : <Save size={16} strokeWidth={2} aria-hidden="true" />} onClick={() => void runSave()} disabled={!selectedProvider || busy}>
            Save changes
          </Button>
        </header>

        {selectedProvider ? (
          <div className="qc-api-editor-body">
            <section className="qc-api-section">
              <div className="qc-api-section-head">
                <h4>Provider</h4>
                <span>{selectedProvider.key_env || "provider key env"}</span>
              </div>
              <div className="qc-api-form-grid">
                <Field label="ID">
                  <input value={selectedProvider.id} spellCheck={false} onChange={(event) => updateSelected({ id: event.target.value })} />
                </Field>
                <Field label="Name">
                  <input value={selectedProvider.name} spellCheck={false} onChange={(event) => updateSelected({ name: event.target.value })} />
                </Field>
                <Field label="Base URL">
                  <input value={selectedProvider.base_url} spellCheck={false} placeholder="https://..." onChange={(event) => updateSelected({ base_url: event.target.value })} />
                </Field>
                <Field label="Protocol">
                  <select value={selectedProvider.protocol} onChange={(event) => updateSelected({ protocol: event.target.value })}>
                    <option value="openai">OpenAI compatible</option>
                    <option value="apimart">APIMart async</option>
                  </select>
                </Field>
                <Field label="Image generation endpoint">
                  <input value={selectedProvider.image_generation_endpoint} spellCheck={false} placeholder="/v1/images/generations" onChange={(event) => updateSelected({ image_generation_endpoint: event.target.value })} />
                </Field>
                <Field label="Image edit endpoint">
                  <input value={selectedProvider.image_edit_endpoint} spellCheck={false} placeholder="/v1/images/edits" onChange={(event) => updateSelected({ image_edit_endpoint: event.target.value })} />
                </Field>
              </div>
              <div className="qc-api-toggle-row">
                <button type="button" className={selectedProvider.enabled ? "is-active" : ""} onClick={() => toggleSelected("enabled")}>
                  <CheckCircle2 size={15} strokeWidth={2} aria-hidden="true" />
                  Enabled
                </button>
                <button type="button" className={selectedProvider.primary ? "is-active" : ""} onClick={() => toggleSelected("primary")}>
                  <ShieldCheck size={15} strokeWidth={2} aria-hidden="true" />
                  Primary
                </button>
              </div>
            </section>

            <section className="qc-api-section">
              <div className="qc-api-section-head">
                <h4>Key</h4>
                <span>{keyStatus(selectedProvider)}</span>
              </div>
              <Field label="API key">
                <input
                  value={newKey}
                  type="password"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="Leave blank to keep the saved key"
                  onChange={(event) => setNewKey(event.target.value)}
                />
              </Field>
              <div className="qc-api-key-note">
                <KeyRound size={15} strokeWidth={2} aria-hidden="true" />
                <span>Saved keys stay hidden. Typing a new key updates it on save; clearing sends the existing clear-key flag.</span>
              </div>
            </section>

            <section className="qc-api-section">
              <div className="qc-api-section-head">
                <h4>Models</h4>
                <span>{modelCount} total</span>
              </div>
              <div className="qc-api-model-grid">
                <Field label="Image models">
                  <textarea value={listText(selectedProvider.image_models)} spellCheck={false} onChange={(event) => updateSelected({ image_models: parseList(event.target.value) })} />
                </Field>
                <Field label="Chat models">
                  <textarea value={listText(selectedProvider.chat_models)} spellCheck={false} onChange={(event) => updateSelected({ chat_models: parseList(event.target.value) })} />
                </Field>
                <Field label="Video models">
                  <textarea value={listText(selectedProvider.video_models)} spellCheck={false} onChange={(event) => updateSelected({ video_models: parseList(event.target.value) })} />
                </Field>
              </div>
            </section>

            <section className="qc-api-section">
              <div className="qc-api-section-head">
                <h4>ModelScope</h4>
                <span>{loraCount(selectedProvider)} LoRA defaults</span>
              </div>
              <div className="qc-api-form-grid">
                <Field label="LoRA JSON">
                  <textarea className="qc-api-code-area" value={selectedLoras} spellCheck={false} placeholder='{"model/id":{"lora/id":1}}' onChange={(event) => setLoraDrafts((current) => ({ ...current, [selectedProvider.id]: event.target.value }))} />
                </Field>
                <Field label="Model defaults version">
                  <input value={selectedProvider.ms_defaults_version} spellCheck={false} placeholder="1" onChange={(event) => updateSelected({ ms_defaults_version: event.target.value })} />
                </Field>
              </div>
            </section>
          </div>
        ) : (
          <div className="qc-api-empty qc-api-empty--large">
            {loading ? <Loader2 className="qc-spin" size={24} strokeWidth={2} aria-hidden="true" /> : <Database size={24} strokeWidth={1.8} aria-hidden="true" />}
            <strong>{loading ? "Loading providers" : "No provider selected"}</strong>
            <span>{loading ? "Reading existing provider config." : "Add a provider or refresh the provider list."}</span>
          </div>
        )}
      </main>

      <aside className="qc-api-diagnostics" aria-label="Provider diagnostics">
        <div className="qc-api-diagnostic-card">
          <h3>Status</h3>
          <div className="qc-api-status" data-state={errorText ? "failed" : activeAction !== "idle" ? "running" : "idle"}>
            {activeAction !== "idle" ? <Loader2 className="qc-spin" size={16} strokeWidth={2} aria-hidden="true" /> : errorText ? <AlertCircle size={16} strokeWidth={2} aria-hidden="true" /> : <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" />}
            <span>{errorText || statusText}</span>
          </div>
          <dl className="qc-api-meta">
            <div><dt>Shell status</dt><dd>{providerStatus.label}</dd></div>
            <div><dt>Primary</dt><dd>{apiConfig?.primary_provider_id || "Unknown"}</dd></div>
            <div><dt>Providers</dt><dd>{providerCounts.total}</dd></div>
            <div><dt>Selected</dt><dd>{selectedProvider?.id || "None"}</dd></div>
          </dl>
        </div>

        <div className="qc-api-diagnostic-card">
          <h3>Actions</h3>
          <div className="qc-api-action-stack">
            <Button variant="secondary" icon={<Wifi size={15} strokeWidth={2} aria-hidden="true" />} onClick={() => void runProviderAction("test")} disabled={!selectedProvider || busy}>
              Test connection
            </Button>
            <Button variant="secondary" icon={<RefreshCw size={15} strokeWidth={2} aria-hidden="true" />} onClick={() => void runProviderAction("fetch")} disabled={!selectedProvider || busy}>
              Fetch models
            </Button>
            <Button variant="secondary" icon={<Database size={15} strokeWidth={2} aria-hidden="true" />} onClick={() => void runProviderAction("probe")} disabled={!selectedProvider || busy}>
              Probe async
            </Button>
            <Button variant="ghost" icon={<KeyRound size={15} strokeWidth={2} aria-hidden="true" />} onClick={() => void runSave({ clearKey: true })} disabled={!selectedProvider || busy || !selectedProvider.has_key}>
              Clear key
            </Button>
            <Button variant="ghost" icon={<Trash2 size={15} strokeWidth={2} aria-hidden="true" />} onClick={deleteProvider} disabled={!selectedProvider || busy || selectedProvider.id === "comfly" || selectedProvider.id === "modelscope"}>
              Delete draft
            </Button>
          </div>
        </div>
      </aside>
    </section>
  );
}

interface FieldProps {
  label: string;
  children: ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <label className="qc-api-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
