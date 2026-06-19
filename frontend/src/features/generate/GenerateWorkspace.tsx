import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Copy, Download, ExternalLink, Image, RefreshCw, X } from "lucide-react";
import type { ApiConfig, GenerateRecord, QueueStatus } from "../../lib/api";
import { generateCloudImage, generateLocalImage, getZImageHistory } from "../../lib/api";
import type { CreationTaskSummary } from "../../lib/creation-state";
import type { ProviderStatus } from "../../lib/provider-status";
import { getLocalValue, STORAGE_KEYS } from "../../lib/storage";
import { dedupeGeneratedRecords, generatedResultKey, upsertGeneratedRecord } from "../../lib/result-dedupe";
import { Button } from "../../components/controls/Button";
import { IconButton } from "../../components/controls/IconButton";
import "./generate.css";

export type GenerateEngine = "local" | "cloud";
export type GenerateTaskSummary = CreationTaskSummary;

interface GenerateWorkspaceProps {
  clientId: string;
  apiConfig: ApiConfig | null;
  providerStatus: ProviderStatus;
  queueStatus: QueueStatus | null;
  taskMessage: unknown;
  onTaskChange: (task: GenerateTaskSummary) => void;
  onOutputsChange: (outputs: GenerateRecord[]) => void;
}

const DEFAULT_TASK: GenerateTaskSummary = {
  status: "idle",
  label: "Generate ready",
  detail: "No active Generate task"
};

function timestampLabel(timestamp?: number): string {
  if (!timestamp) return "";
  const value = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function imageUrl(record: GenerateRecord): string {
  return record.images?.[0] || "";
}

function dimensions(record: GenerateRecord): string {
  const width = record.width || 1024;
  const height = record.height || 1024;
  return `${width}x${height}`;
}

function isGenerateBroadcast(message: unknown): message is { type: string; data: GenerateRecord } {
  if (!message || typeof message !== "object") return false;
  const candidate = message as { type?: unknown; data?: unknown };
  if (candidate.type !== "new_image" || !candidate.data || typeof candidate.data !== "object") return false;
  const data = candidate.data as GenerateRecord;
  return (data.type === "zimage" || data.type === "cloud") && Array.isArray(data.images);
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

function canUseCloud(apiConfig: ApiConfig | null): boolean {
  return Boolean(apiConfig?.has_ms_key || getLocalValue(STORAGE_KEYS.modelscopeToken));
}

export function GenerateWorkspace({
  clientId,
  apiConfig,
  providerStatus,
  queueStatus,
  taskMessage,
  onTaskChange,
  onOutputsChange
}: GenerateWorkspaceProps) {
  const [prompt, setPrompt] = useState("");
  const [engine, setEngine] = useState<GenerateEngine>(() => (
    localStorage.getItem("zimage_engine_mode") === "cloud" ? "cloud" : "local"
  ));
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [convertToJpg, setConvertToJpg] = useState(false);
  const [records, setRecords] = useState<GenerateRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusText, setStatusText] = useState("Ready");
  const [errorText, setErrorText] = useState("");
  const [preview, setPreview] = useState<GenerateRecord | null>(null);

  const cloudAvailable = canUseCloud(apiConfig);
  const busy = isSubmitting || Boolean(queueStatus?.position);
  const latestRecords = useMemo(() => records.slice(0, 8), [records]);

  const publishTask = useCallback((task: GenerateTaskSummary) => {
    onTaskChange(task);
  }, [onTaskChange]);

  const publishOutputs = useCallback((nextRecords: GenerateRecord[]) => {
    onOutputsChange(nextRecords.slice(0, 12));
  }, [onOutputsChange]);

  const loadHistory = useCallback((signal?: AbortSignal) => {
    setIsLoadingHistory(true);
    getZImageHistory(signal)
      .then((history) => {
        const next = dedupeGeneratedRecords(history, { limit: 48, sortByTimestamp: true });
        setRecords(next);
        publishOutputs(next);
        setStatusText(next.length ? `Loaded ${next.length} recent outputs` : "No zimage history yet");
      })
      .catch(() => {
        if (!signal?.aborted) {
          setErrorText("History unavailable. Check the backend and try again.");
        }
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
    localStorage.setItem("zimage_engine_mode", engine);
  }, [engine]);

  useEffect(() => {
    if (!isGenerateBroadcast(taskMessage)) return;
    setRecords((current) => {
      const next = upsertGeneratedRecord(current, taskMessage.data, { limit: 48, sortByTimestamp: true });
      publishOutputs(next);
      return next;
    });
    publishTask({
      status: "succeeded",
      label: "Generate finished",
      detail: `${taskMessage.data.images.length} image${taskMessage.data.images.length === 1 ? "" : "s"} available`,
      prompt: taskMessage.data.prompt
    });
    setStatusText("New output received");
  }, [publishOutputs, publishTask, taskMessage]);

  const stepNumber = useCallback((field: "width" | "height", delta: number) => {
    const setter = field === "width" ? setWidth : setHeight;
    setter((current) => Math.max(256, Math.min(2048, current + delta)));
  }, []);

  const submitGenerate = useCallback(async () => {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      setErrorText("Prompt is required.");
      return;
    }
    if (engine === "cloud" && !cloudAvailable) {
      const message = "ModelScope key missing. Add a key or switch to Local.";
      setErrorText(message);
      setStatusText("Cloud key missing");
      publishTask({ status: "failed", label: "Generate blocked", detail: message, prompt: cleanPrompt, error: message });
      return;
    }

    setIsSubmitting(true);
    setErrorText("");
    setStatusText(engine === "local" ? "Submitting to local ComfyUI" : "Submitting to ModelScope");
    publishTask({
      status: "running",
      label: engine === "local" ? "Local Generate running" : "Cloud Generate running",
      detail: `${width}x${height}`,
      prompt: cleanPrompt,
      startedAt: Date.now()
    });

    try {
      if (engine === "local") {
        const result = await generateLocalImage({
          prompt: cleanPrompt,
          width,
          height,
          type: "zimage",
          client_id: clientId,
          convert_to_jpg: convertToJpg
        });
        if (!result.images?.length || result.status === "failed") {
          throw new Error(result.error || "Local generation returned no images.");
        }
        setRecords((current) => {
          const next = upsertGeneratedRecord(current, result, { limit: 48, sortByTimestamp: true });
          publishOutputs(next);
          return next;
        });
        setStatusText("Generate complete");
        publishTask({
          status: "succeeded",
          label: "Generate complete",
          detail: `${result.images.length} image${result.images.length === 1 ? "" : "s"} saved`,
          prompt: cleanPrompt
        });
      } else {
        const apiKey = getLocalValue(STORAGE_KEYS.modelscopeToken);
        const result = await generateCloudImage({
          prompt: cleanPrompt,
          api_key: apiKey,
          resolution: `${width}x${height}`,
          type: "zimage",
          client_id: clientId
        });
        if (!result.url) {
          throw new Error(typeof result.detail === "string" ? result.detail : "Cloud generation returned no image.");
        }
        const record: GenerateRecord = {
          timestamp: Date.now(),
          prompt: cleanPrompt,
          images: [result.url],
          width,
          height,
          type: "cloud",
          status: result.status || "succeeded",
          task_id: result.task_id
        };
        setRecords((current) => {
          const next = upsertGeneratedRecord(current, record, { limit: 48, sortByTimestamp: true });
          publishOutputs(next);
          return next;
        });
        setStatusText("Cloud Generate complete");
        publishTask({
          status: "succeeded",
          label: "Cloud Generate complete",
          detail: "Image saved to output history",
          prompt: cleanPrompt
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generate failed.";
      setErrorText(message);
      setStatusText("Generate failed");
      publishTask({ status: "failed", label: "Generate failed", detail: message, prompt: cleanPrompt, error: message });
    } finally {
      setIsSubmitting(false);
    }
  }, [clientId, cloudAvailable, convertToJpg, engine, height, prompt, publishOutputs, publishTask, width]);

  const copyMetadata = useCallback((record: GenerateRecord) => {
    const text = [
      record.prompt,
      `${dimensions(record)} · seed ${record.seed || "n/a"}`,
      imageUrl(record)
    ].filter(Boolean).join("\n");
    void copyToClipboard(text);
  }, []);

  return (
    <div className="qc-generate-workspace">
      <aside className="qc-generate-panel" aria-label="Generate settings">
        <div className="qc-generate-panel__head">
          <div>
            <h2>Prompt</h2>
            <p>{providerStatus.configured ? providerStatus.detail : providerStatus.label}</p>
          </div>
        </div>

        <label className="qc-field">
          <span>Prompt</span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe the image to create..."
            rows={8}
          />
        </label>

        <fieldset className="qc-fieldset">
          <legend>Engine</legend>
          <div className="qc-segmented">
            <button
              className={engine === "local" ? "is-active" : ""}
              type="button"
              onClick={() => setEngine("local")}
            >
              Local ComfyUI
            </button>
            <button
              className={engine === "cloud" ? "is-active" : ""}
              type="button"
              onClick={() => setEngine("cloud")}
            >
              ModelScope
            </button>
          </div>
          {engine === "cloud" && !cloudAvailable ? (
            <p className="qc-field-hint is-warning">ModelScope key missing. Add one in API / Models or use Local.</p>
          ) : null}
        </fieldset>

        <div className="qc-size-grid">
          <label className="qc-number-field">
            <span>Width</span>
            <div>
              <button type="button" onClick={() => stepNumber("width", -64)} aria-label="Decrease width">-</button>
              <input value={width} onChange={(event) => setWidth(Number(event.target.value) || 1024)} type="number" min={256} max={2048} step={64} />
              <button type="button" onClick={() => stepNumber("width", 64)} aria-label="Increase width">+</button>
            </div>
          </label>
          <label className="qc-number-field">
            <span>Height</span>
            <div>
              <button type="button" onClick={() => stepNumber("height", -64)} aria-label="Decrease height">-</button>
              <input value={height} onChange={(event) => setHeight(Number(event.target.value) || 1024)} type="number" min={256} max={2048} step={64} />
              <button type="button" onClick={() => stepNumber("height", 64)} aria-label="Increase height">+</button>
            </div>
          </label>
        </div>

        <label className={`qc-check-row${engine === "cloud" ? " is-disabled" : ""}`}>
          <input
            checked={convertToJpg}
            disabled={engine === "cloud"}
            onChange={(event) => setConvertToJpg(event.target.checked)}
            type="checkbox"
          />
          <span>Convert output to JPG</span>
        </label>

        <div className="qc-generate-status" data-state={errorText ? "error" : busy ? "busy" : "idle"}>
          {errorText ? <AlertCircle size={16} strokeWidth={2} aria-hidden="true" /> : <Image size={16} strokeWidth={2} aria-hidden="true" />}
          <span>{errorText || statusText}</span>
        </div>

        <Button variant="primary" className="qc-generate-submit" disabled={isSubmitting} onClick={submitGenerate}>
          {isSubmitting ? "Generating..." : "Generate"}
        </Button>
      </aside>

      <main className="qc-generate-results" aria-label="Generate results">
        <div className="qc-results-head">
          <div>
            <h2>Results</h2>
            <p>{isLoadingHistory ? "Loading history..." : `${records.length} recent zimage output${records.length === 1 ? "" : "s"}`}</p>
          </div>
          <Button variant="ghost" icon={<RefreshCw size={15} strokeWidth={2} aria-hidden="true" />} onClick={() => loadHistory()}>
            Refresh
          </Button>
        </div>

        {isSubmitting ? (
          <div className="qc-render-card">
            <div className="qc-render-card__preview">
              <span />
            </div>
            <div>
              <strong>{engine === "local" ? "Local Generate running" : "Cloud Generate running"}</strong>
              <p>{width}x{height} · {prompt.trim() || "Untitled prompt"}</p>
            </div>
          </div>
        ) : null}

        {!isLoadingHistory && !records.length && !isSubmitting ? (
          <div className="qc-results-empty">
            <Image size={22} strokeWidth={1.8} aria-hidden="true" />
            <strong>No zimage outputs yet</strong>
            <span>Write a prompt and generate the first image.</span>
          </div>
        ) : (
          <div className="qc-result-grid">
            {latestRecords.map((record, index) => {
              const src = imageUrl(record);
              return (
                <article className="qc-result-card" key={generatedResultKey(record, index)}>
                  <button type="button" className="qc-result-card__image" onClick={() => setPreview(record)}>
                    {src ? <img src={src} alt={record.prompt || "Generated image"} /> : <Image size={22} strokeWidth={1.8} aria-hidden="true" />}
                  </button>
                  <div className="qc-result-card__body">
                    <p title={record.prompt}>{record.prompt || "Untitled prompt"}</p>
                    <span>{dimensions(record)} · seed {record.seed || "n/a"} · {timestampLabel(record.timestamp)}</span>
                  </div>
                  <div className="qc-result-card__actions">
                    <IconButton label="Copy prompt and metadata" onClick={() => copyMetadata(record)}>
                      <Copy size={15} strokeWidth={2} aria-hidden="true" />
                    </IconButton>
                    <a className="qc-icon-button" href={src} target="_blank" rel="noreferrer" aria-label="Open original" title="Open original">
                      <ExternalLink size={15} strokeWidth={2} aria-hidden="true" />
                    </a>
                    <a className="qc-icon-button" href={src} download aria-label="Download image" title="Download image">
                      <Download size={15} strokeWidth={2} aria-hidden="true" />
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {preview ? (
        <div className="qc-preview" role="dialog" aria-modal="true" aria-label="Generated image preview" onClick={() => setPreview(null)}>
          <div className="qc-preview__dialog" onClick={(event) => event.stopPropagation()}>
            <div className="qc-preview__bar">
              <div>
                <strong>{dimensions(preview)}</strong>
                <span>{preview.prompt}</span>
              </div>
              <IconButton label="Close preview" onClick={() => setPreview(null)}>
                <X size={17} strokeWidth={2} aria-hidden="true" />
              </IconButton>
            </div>
            <img src={imageUrl(preview)} alt={preview.prompt || "Generated preview"} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
