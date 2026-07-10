import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Copy, Download, ExternalLink, Image, RefreshCw, RotateCcw, Trash2, UploadCloud, X } from "lucide-react";
import type { AIReference, ApiConfig, ApiProvider, GenerateRecord, QueueStatus } from "../../lib/api";
import { deleteHistoryItem, generateOnlineImage, getOnlineHistory, uploadAiReferenceImage } from "../../lib/api";
import type { CreationTaskSummary } from "../../lib/creation-state";
import type { ProviderStatus } from "../../lib/provider-status";
import { getLocalValue, STORAGE_KEYS } from "../../lib/storage";
import { generatedResultKey, isSameGeneratedResult, upsertGeneratedRecord } from "../../lib/result-dedupe";
import { Button } from "../../components/controls/Button";
import { IconButton } from "../../components/controls/IconButton";
import "../generate/generate.css";
import "./online.css";

export type OnlineTaskSummary = CreationTaskSummary;

interface OnlineWorkspaceProps {
  clientId: string;
  apiConfig: ApiConfig | null;
  providerStatus: ProviderStatus;
  queueStatus: QueueStatus | null;
  taskMessage: unknown;
  onTaskChange: (task: OnlineTaskSummary) => void;
  onOutputsChange: (outputs: GenerateRecord[]) => void;
}

type OnlineAspect = "square" | "portrait" | "landscape" | "story" | "wide" | "custom";
type OnlineResolution = "1k" | "2k" | "4k" | "custom";

const DEFAULT_TASK: OnlineTaskSummary = {
  status: "idle",
  label: "Online ready",
  detail: "No active Online task"
};

const SIZE_OPTIONS: Record<Exclude<OnlineAspect, "custom">, Array<[string, OnlineResolution]>> = {
  square: [["1024x1024", "1k"], ["1536x1536", "2k"], ["4096x4096", "4k"]],
  portrait: [["720x1080", "1k"], ["1024x1536", "2k"], ["2160x3240", "4k"]],
  landscape: [["1080x720", "1k"], ["1536x1024", "2k"], ["3240x2160", "4k"]],
  story: [["720x1280", "1k"], ["1080x1920", "2k"], ["2160x3840", "4k"]],
  wide: [["1280x720", "1k"], ["1920x1080", "2k"], ["3840x2160", "4k"]]
};

const RES_LONG_SIDE: Record<Exclude<OnlineResolution, "custom">, number> = {
  "1k": 1024,
  "2k": 1536,
  "4k": 4096
};

function imageUrl(record: GenerateRecord): string {
  return record.images?.[0] || "";
}

function timestampLabel(timestamp?: number): string {
  if (!timestamp) return "";
  const value = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function recordParams(record: GenerateRecord): Record<string, unknown> {
  return record.params || {};
}

function recordSize(record: GenerateRecord): string {
  const value = recordParams(record).size;
  return typeof value === "string" && value ? value : "";
}

function recordModel(record: GenerateRecord): string {
  const value = recordParams(record).model;
  return typeof value === "string" && value ? value : record.model || "";
}

function recordProvider(record: GenerateRecord): string {
  const value = recordParams(record).provider_id;
  return typeof value === "string" && value ? value : record.provider_id || "";
}

function isOnlineBroadcast(message: unknown): message is { type: string; data: GenerateRecord } {
  if (!message || typeof message !== "object") return false;
  const candidate = message as { type?: unknown; data?: unknown };
  if (candidate.type !== "new_image" || !candidate.data || typeof candidate.data !== "object") return false;
  const data = candidate.data as GenerateRecord;
  return data.type === "online" && Array.isArray(data.images);
}

function imageProviders(config: ApiConfig | null): ApiProvider[] {
  const configured = (config?.api_providers || []).filter((provider) => (
    provider.enabled !== false && Array.isArray(provider.image_models) && provider.image_models.length > 0
  ));
  if (configured.length) return configured;
  const fallbackModels = config?.image_models?.length ? config.image_models : [config?.image_model || "gpt-image-2"];
  return [{
    id: "comfly",
    name: "Comfly",
    enabled: true,
    has_key: config?.has_api_key,
    image_models: fallbackModels
  }];
}

function providerHasUsableKey(provider: ApiProvider | undefined, config: ApiConfig | null): boolean {
  if (!provider) return false;
  if (provider.has_key) return true;
  if (provider.id === "comfly") {
    return Boolean(config?.has_api_key || getLocalValue(STORAGE_KEYS.comflyToken));
  }
  if (provider.id === "modelscope") {
    return Boolean(config?.has_ms_key || getLocalValue(STORAGE_KEYS.modelscopeToken));
  }
  return false;
}

function parseSize(value: string): { width: string; height: string } | null {
  const match = value.trim().match(/^(\d+)\s*[xX*]\s*(\d+)$/);
  return match ? { width: match[1], height: match[2] } : null;
}

function sizeForPreset(aspect: OnlineAspect, resolution: OnlineResolution, ratioWidth: string, ratioHeight: string): string {
  if (resolution === "custom") return "";
  if (aspect === "custom") {
    const width = Number(ratioWidth);
    const height = Number(ratioHeight);
    if (width > 0 && height > 0) {
      const ratio = width / height;
      const longSide = RES_LONG_SIDE[resolution];
      const nextWidth = ratio >= 1 ? longSide : Math.round(longSide * ratio);
      const nextHeight = ratio >= 1 ? Math.round(longSide / ratio) : longSide;
      return `${Math.max(64, nextWidth)}x${Math.max(64, nextHeight)}`;
    }
    return SIZE_OPTIONS.square.find(([, label]) => label === resolution)?.[0] || "1024x1024";
  }
  return SIZE_OPTIONS[aspect].find(([, label]) => label === resolution)?.[0] || "1024x1024";
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (!navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function OnlineWorkspace({
  apiConfig,
  providerStatus,
  queueStatus,
  taskMessage,
  onTaskChange,
  onOutputsChange
}: OnlineWorkspaceProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [prompt, setPrompt] = useState("");
  const [providerId, setProviderId] = useState(() => localStorage.getItem("online_provider_id") || "");
  const [model, setModel] = useState(() => localStorage.getItem("online_image_model") || "");
  const [aspect, setAspect] = useState<OnlineAspect>("square");
  const [resolution, setResolution] = useState<OnlineResolution>("1k");
  const [ratioWidth, setRatioWidth] = useState("");
  const [ratioHeight, setRatioHeight] = useState("");
  const [customWidth, setCustomWidth] = useState("");
  const [customHeight, setCustomHeight] = useState("");
  const [refs, setRefs] = useState<AIReference[]>([]);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "failed">("idle");
  const [records, setRecords] = useState<GenerateRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusText, setStatusText] = useState("Ready");
  const [errorText, setErrorText] = useState("");
  const [preview, setPreview] = useState<GenerateRecord | null>(null);

  const providers = useMemo(() => imageProviders(apiConfig), [apiConfig]);
  const selectedProvider = useMemo(() => (
    providers.find((provider) => provider.id === providerId) || providers[0]
  ), [providerId, providers]);
  const modelOptions = selectedProvider?.image_models || [];
  const currentSize = useMemo(() => {
    if (resolution === "custom") {
      const width = Number(customWidth);
      const height = Number(customHeight);
      return width > 0 && height > 0 ? `${Math.round(width)}x${Math.round(height)}` : "";
    }
    return sizeForPreset(aspect, resolution, ratioWidth, ratioHeight);
  }, [aspect, customHeight, customWidth, ratioHeight, ratioWidth, resolution]);
  const providerReady = providerHasUsableKey(selectedProvider, apiConfig);
  const busy = isSubmitting || uploadStatus === "uploading" || Boolean(queueStatus?.position);
  const latestRecords = useMemo(() => records.slice(0, 8), [records]);

  const publishTask = useCallback((task: OnlineTaskSummary) => {
    onTaskChange(task);
  }, [onTaskChange]);

  const publishOutputs = useCallback((nextRecords: GenerateRecord[]) => {
    onOutputsChange(nextRecords.slice(0, 12));
  }, [onOutputsChange]);

  const loadHistory = useCallback((signal?: AbortSignal) => {
    setIsLoadingHistory(true);
    getOnlineHistory(signal)
      .then((history) => {
        const next = history
          .filter((record) => record.images?.length)
          .reduce<GenerateRecord[]>((acc, record) => upsertGeneratedRecord(acc, record, { limit: 48, sortByTimestamp: true }), []);
        setRecords(next);
        publishOutputs(next);
        setStatusText(next.length ? `Loaded ${next.length} online outputs` : "No online history yet");
      })
      .catch(() => {
        if (!signal?.aborted) setErrorText("Online history unavailable. Check the backend and try again.");
      })
      .finally(() => {
        if (!signal?.aborted) setIsLoadingHistory(false);
      });
  }, [publishOutputs]);

  useEffect(() => {
    const abort = new AbortController();
    publishTask(DEFAULT_TASK);
    loadHistory(abort.signal);
    return () => abort.abort();
  }, [loadHistory, publishTask]);

  useEffect(() => {
    const nextProvider = selectedProvider?.id || "";
    if (nextProvider && providerId !== nextProvider) setProviderId(nextProvider);
    if (modelOptions.length && !modelOptions.includes(model)) setModel(modelOptions[0]);
  }, [model, modelOptions, providerId, selectedProvider]);

  useEffect(() => {
    if (providerId) localStorage.setItem("online_provider_id", providerId);
  }, [providerId]);

  useEffect(() => {
    if (model) localStorage.setItem("online_image_model", model);
  }, [model]);

  useEffect(() => {
    if (!isOnlineBroadcast(taskMessage)) return;
    setRecords((current) => {
      const next = upsertGeneratedRecord(current, taskMessage.data, { limit: 48, sortByTimestamp: true });
      publishOutputs(next);
      return next;
    });
    publishTask({
      status: "succeeded",
      label: "Online finished",
      detail: `${taskMessage.data.images.length} image${taskMessage.data.images.length === 1 ? "" : "s"} available`,
      prompt: taskMessage.data.prompt
    });
    setStatusText("New online output received");
  }, [publishOutputs, publishTask, taskMessage]);

  const handleFiles = useCallback(async (fileList?: FileList | File[] | null) => {
    const files = Array.from(fileList || []).filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    setErrorText("");
    setUploadStatus("uploading");
    publishTask({ status: "pending", label: "Reference upload running", detail: `${Math.min(files.length, 3 - refs.length)} image(s)` });
    try {
      const remaining = Math.max(0, 3 - refs.length);
      const uploads = await Promise.all(files.slice(0, remaining).map(async (file) => {
        const response = await uploadAiReferenceImage(file, file.name || "reference.png");
        return response.files[0];
      }));
      const nextRefs = [...refs, ...uploads.filter(Boolean)].slice(0, 3);
      setRefs(nextRefs);
      setUploadStatus("idle");
      setStatusText(nextRefs.length ? `${nextRefs.length} reference image${nextRefs.length === 1 ? "" : "s"} ready` : "Ready");
      publishTask({ status: "idle", label: "Online ready", detail: "Reference images uploaded" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reference upload failed.";
      setUploadStatus("failed");
      setErrorText(message);
      publishTask({ status: "failed", label: "Reference upload failed", detail: message, error: message });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [publishTask, refs]);

  const onDrop = useCallback((event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    void handleFiles(event.dataTransfer.files);
  }, [handleFiles]);

  const removeRef = useCallback((index: number) => {
    setRefs((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }, []);

  const submitOnline = useCallback(async () => {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      setErrorText("Prompt is required.");
      publishTask({ status: "failed", label: "Online blocked", detail: "Prompt is required.", error: "Prompt is required." });
      return;
    }
    if (!selectedProvider || !model) {
      const message = "Image provider unavailable. Add an image model in API / Models.";
      setErrorText(message);
      publishTask({ status: "failed", label: "Online blocked", detail: message, prompt: cleanPrompt, error: message });
      return;
    }
    if (!providerReady) {
      const message = `${selectedProvider.name || selectedProvider.id} key missing. Add a key in API / Models.`;
      setErrorText(message);
      publishTask({ status: "failed", label: "Online blocked", detail: message, prompt: cleanPrompt, error: message });
      return;
    }
    if (!currentSize) {
      const message = "Size is required. Enter a custom width and height.";
      setErrorText(message);
      publishTask({ status: "failed", label: "Online blocked", detail: message, prompt: cleanPrompt, error: message });
      return;
    }

    setIsSubmitting(true);
    setErrorText("");
    setStatusText("Submitting hosted generation");
    publishTask({
      status: "running",
      label: "Online Generate running",
      detail: `${selectedProvider.name || selectedProvider.id} - ${currentSize}`,
      prompt: cleanPrompt,
      startedAt: Date.now()
    });

    try {
      const result = await generateOnlineImage({
        prompt: cleanPrompt,
        provider_id: selectedProvider.id,
        model,
        size: currentSize,
        quality: "auto",
        reference_images: refs
      });
      if (!result.images?.length || result.status === "failed") {
        throw new Error(result.error || "Online generation returned no image.");
      }
      setRecords((current) => {
        const next = upsertGeneratedRecord(current, result, { limit: 48, sortByTimestamp: true });
        publishOutputs(next);
        return next;
      });
      setPreview(result);
      setStatusText("Online Generate complete");
      publishTask({
        status: "succeeded",
        label: "Online Generate complete",
        detail: `${recordModel(result) || model} - ${recordSize(result) || currentSize}`,
        prompt: cleanPrompt
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Online generation failed.";
      setErrorText(message);
      setStatusText("Online generation failed");
      publishTask({ status: "failed", label: "Online Generate failed", detail: message, prompt: cleanPrompt, error: message });
    } finally {
      setIsSubmitting(false);
    }
  }, [currentSize, model, prompt, providerReady, publishOutputs, publishTask, refs, selectedProvider]);

  const copyMetadata = useCallback((record: GenerateRecord) => {
    const text = [
      record.prompt,
      `${recordProvider(record) || "provider"} - ${recordModel(record) || "model"} - ${recordSize(record) || "size n/a"}`,
      imageUrl(record)
    ].filter(Boolean).join("\n");
    void copyToClipboard(text);
  }, []);

  const reuseRecord = useCallback((record: GenerateRecord) => {
    setPrompt(record.prompt || "");
    const params = recordParams(record);
    const nextProvider = typeof params.provider_id === "string" ? params.provider_id : record.provider_id || "";
    const nextModel = typeof params.model === "string" ? params.model : record.model || "";
    if (nextProvider) setProviderId(nextProvider);
    if (nextModel) setModel(nextModel);
    const nextRefs = Array.isArray(params.reference_images) ? params.reference_images.filter((ref): ref is AIReference => (
      Boolean(ref && typeof ref === "object" && "url" in ref)
    )).slice(0, 3) : [];
    setRefs(nextRefs);
    const size = typeof params.size === "string" ? params.size : "";
    const matchedAspect = (Object.keys(SIZE_OPTIONS) as Array<Exclude<OnlineAspect, "custom">>)
      .find((key) => SIZE_OPTIONS[key].some(([value]) => value === size));
    const matchedResolution = matchedAspect
      ? SIZE_OPTIONS[matchedAspect].find(([value]) => value === size)?.[1]
      : undefined;
    if (matchedAspect && matchedResolution) {
      setAspect(matchedAspect);
      setResolution(matchedResolution);
      setCustomWidth("");
      setCustomHeight("");
    } else if (size) {
      const parsed = parseSize(size);
      setResolution("custom");
      setCustomWidth(parsed?.width || "");
      setCustomHeight(parsed?.height || "");
    }
    setPreview(null);
  }, []);

  const deleteRecord = useCallback(async (record: GenerateRecord) => {
    if (!window.confirm("Delete this history item?")) return;
    try {
      const result = await deleteHistoryItem(record.timestamp);
      if (!result.success) throw new Error(result.message || "Delete failed.");
      setRecords((current) => {
        const next = current.filter((item) => !isSameGeneratedResult(item, record));
        publishOutputs(next);
        return next;
      });
      if (preview && isSameGeneratedResult(preview, record)) setPreview(null);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Delete failed.");
    }
  }, [preview, publishOutputs]);

  const stepNumber = useCallback((field: "ratioWidth" | "ratioHeight" | "customWidth" | "customHeight", delta: number) => {
    const setters = {
      ratioWidth: setRatioWidth,
      ratioHeight: setRatioHeight,
      customWidth: setCustomWidth,
      customHeight: setCustomHeight
    };
    setters[field]((current) => String(Math.max(field.startsWith("ratio") ? 1 : 64, (Number(current) || 0) + delta)));
  }, []);

  return (
    <div className="qc-generate-workspace qc-online-workspace">
      <aside className="qc-generate-panel qc-online-panel" aria-label="Online settings">
        <div className="qc-generate-panel__head">
          <div>
            <h2>Hosted generation</h2>
            <p>{providerStatus.configured ? providerStatus.detail : providerStatus.label}</p>
          </div>
        </div>

        <label className="qc-field">
          <span>Prompt</span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe the hosted image to generate..."
            rows={7}
          />
        </label>

        <div className="qc-online-select-grid">
          <label className="qc-select-field">
            <span>Provider</span>
            <select value={selectedProvider?.id || ""} onChange={(event) => setProviderId(event.target.value)}>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.name || provider.id}</option>
              ))}
            </select>
          </label>
          <label className="qc-select-field">
            <span>Model</span>
            <select value={model} onChange={(event) => setModel(event.target.value)}>
              {modelOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>
        {selectedProvider && !providerReady ? (
          <p className="qc-field-hint is-warning">{selectedProvider.name || selectedProvider.id} key missing. Add one in API / Models.</p>
        ) : null}

        <div className="qc-online-select-grid">
          <label className="qc-select-field">
            <span>Aspect</span>
            <select
              disabled={resolution === "custom"}
              value={aspect}
              onChange={(event) => setAspect(event.target.value as OnlineAspect)}
            >
              <option value="square">1:1 square</option>
              <option value="portrait">2:3 portrait</option>
              <option value="landscape">3:2 landscape</option>
              <option value="story">9:16 story</option>
              <option value="wide">16:9 wide</option>
              <option value="custom">Custom ratio</option>
            </select>
          </label>
          <label className="qc-select-field">
            <span>Resolution</span>
            <select value={resolution} onChange={(event) => setResolution(event.target.value as OnlineResolution)}>
              <option value="1k">1K</option>
              <option value="2k">2K</option>
              <option value="4k">4K</option>
              <option value="custom">Custom size</option>
            </select>
          </label>
        </div>

        {aspect === "custom" && resolution !== "custom" ? (
          <div className="qc-size-grid">
            <label className="qc-number-field">
              <span>Ratio width</span>
              <div>
                <button type="button" onClick={() => stepNumber("ratioWidth", -1)} aria-label="Decrease ratio width">-</button>
                <input value={ratioWidth} onChange={(event) => setRatioWidth(event.target.value)} type="number" min={1} step={1} />
                <button type="button" onClick={() => stepNumber("ratioWidth", 1)} aria-label="Increase ratio width">+</button>
              </div>
            </label>
            <label className="qc-number-field">
              <span>Ratio height</span>
              <div>
                <button type="button" onClick={() => stepNumber("ratioHeight", -1)} aria-label="Decrease ratio height">-</button>
                <input value={ratioHeight} onChange={(event) => setRatioHeight(event.target.value)} type="number" min={1} step={1} />
                <button type="button" onClick={() => stepNumber("ratioHeight", 1)} aria-label="Increase ratio height">+</button>
              </div>
            </label>
          </div>
        ) : null}

        {resolution === "custom" ? (
          <div className="qc-size-grid">
            <label className="qc-number-field">
              <span>Width</span>
              <div>
                <button type="button" onClick={() => stepNumber("customWidth", -64)} aria-label="Decrease width">-</button>
                <input value={customWidth} onChange={(event) => setCustomWidth(event.target.value)} type="number" min={64} step={64} />
                <button type="button" onClick={() => stepNumber("customWidth", 64)} aria-label="Increase width">+</button>
              </div>
            </label>
            <label className="qc-number-field">
              <span>Height</span>
              <div>
                <button type="button" onClick={() => stepNumber("customHeight", -64)} aria-label="Decrease height">-</button>
                <input value={customHeight} onChange={(event) => setCustomHeight(event.target.value)} type="number" min={64} step={64} />
                <button type="button" onClick={() => stepNumber("customHeight", 64)} aria-label="Increase height">+</button>
              </div>
            </label>
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          accept="image/*"
          className="qc-online-file-input"
          multiple
          onChange={(event) => void handleFiles(event.target.files)}
          type="file"
        />
        <div className="qc-online-ref-list" aria-label="Reference images">
          {refs.map((ref, index) => (
            <div className="qc-online-ref-chip" key={`${ref.url}-${index}`}>
              <img src={ref.url} alt={ref.name || `Reference ${index + 1}`} />
              <button type="button" onClick={() => removeRef(index)} aria-label="Remove reference image">
                <X size={12} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        <button
          className="qc-online-dropzone"
          disabled={refs.length >= 3 || uploadStatus === "uploading"}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
          type="button"
        >
          <UploadCloud size={20} strokeWidth={1.8} aria-hidden="true" />
          <span>{refs.length >= 3 ? "Reference limit reached" : "Drop reference images or click"}</span>
        </button>

        <div className="qc-generate-status" data-state={errorText ? "error" : busy ? "busy" : "idle"}>
          {errorText ? <AlertCircle size={16} strokeWidth={2} aria-hidden="true" /> : <Image size={16} strokeWidth={2} aria-hidden="true" />}
          <span>{errorText || statusText}</span>
        </div>

        <Button variant="primary" className="qc-generate-submit" disabled={isSubmitting || uploadStatus === "uploading"} onClick={submitOnline}>
          {isSubmitting ? "Generating..." : "Generate online"}
        </Button>
      </aside>

      <main className="qc-generate-results qc-online-results" aria-label="Online results">
        <div className="qc-results-head">
          <div>
            <h2>Results</h2>
            <p>{isLoadingHistory ? "Loading history..." : `${records.length} recent online output${records.length === 1 ? "" : "s"}`}</p>
          </div>
          <Button variant="ghost" icon={<RefreshCw size={15} strokeWidth={2} aria-hidden="true" />} onClick={() => loadHistory()}>
            Refresh
          </Button>
        </div>

        {isSubmitting ? (
          <div className="qc-render-card">
            <div className="qc-render-card__preview"><span /></div>
            <div>
              <strong>Online Generate running</strong>
              <p>{selectedProvider?.name || "Provider"} - {model || "model"} - {currentSize || "custom size"}</p>
            </div>
          </div>
        ) : null}

        {!isLoadingHistory && !records.length && !isSubmitting ? (
          <div className="qc-results-empty">
            <Image size={22} strokeWidth={1.8} aria-hidden="true" />
            <strong>No online images yet</strong>
            <span>Write a prompt and use a hosted provider.</span>
          </div>
        ) : (
          <div className="qc-result-grid">
            {latestRecords.map((record, index) => {
              const src = imageUrl(record);
              return (
                <article className="qc-result-card" key={generatedResultKey(record, index)}>
                  <button type="button" className="qc-result-card__image" onClick={() => setPreview(record)}>
                    {src ? <img src={src} alt={record.prompt || "Online generated image"} /> : <Image size={22} strokeWidth={1.8} aria-hidden="true" />}
                  </button>
                  <div className="qc-result-card__body">
                    <p title={record.prompt}>{record.prompt || "Online image"}</p>
                    <span>{recordSize(record) || "size n/a"} - {recordModel(record) || "model n/a"} - {timestampLabel(record.timestamp)}</span>
                  </div>
                  <div className="qc-result-card__actions">
                    <IconButton label="Copy online metadata" onClick={() => copyMetadata(record)}>
                      <Copy size={15} strokeWidth={2} aria-hidden="true" />
                    </IconButton>
                    <IconButton label="Reuse prompt and settings" onClick={() => reuseRecord(record)}>
                      <RotateCcw size={15} strokeWidth={2} aria-hidden="true" />
                    </IconButton>
                    <a className="qc-icon-button" href={src} target="_blank" rel="noreferrer" aria-label="Open original" title="Open original">
                      <ExternalLink size={15} strokeWidth={2} aria-hidden="true" />
                    </a>
                    <a className="qc-icon-button" href={src} download aria-label="Download image" title="Download image">
                      <Download size={15} strokeWidth={2} aria-hidden="true" />
                    </a>
                    <IconButton label="Delete online history item" onClick={() => void deleteRecord(record)}>
                      <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
                    </IconButton>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {preview ? (
        <div className="qc-preview" role="dialog" aria-modal="true" aria-label="Online image preview" onClick={() => setPreview(null)}>
          <div className="qc-preview__dialog qc-online-preview" onClick={(event) => event.stopPropagation()}>
            <div className="qc-preview__bar">
              <div>
                <strong>{recordProvider(preview) || "online"} - {recordModel(preview) || "model"}</strong>
                <span>{preview.prompt}</span>
              </div>
              <IconButton label="Close preview" onClick={() => setPreview(null)}>
                <X size={17} strokeWidth={2} aria-hidden="true" />
              </IconButton>
            </div>
            <img src={imageUrl(preview)} alt={preview.prompt || "Online generated preview"} />
            <div className="qc-online-preview-actions">
              <Button variant="secondary" icon={<RotateCcw size={15} strokeWidth={2} aria-hidden="true" />} onClick={() => reuseRecord(preview)}>
                Reuse
              </Button>
              <Button variant="ghost" icon={<Copy size={15} strokeWidth={2} aria-hidden="true" />} onClick={() => copyMetadata(preview)}>
                Copy metadata
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
