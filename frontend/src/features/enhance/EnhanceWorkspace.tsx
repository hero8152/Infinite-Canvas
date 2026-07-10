import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Copy, Download, ExternalLink, Image, RefreshCw, Trash2, UploadCloud, X } from "lucide-react";
import type { ApiConfig, GenerateRecord, QueueStatus } from "../../lib/api";
import { generateMsImage, generateWorkflowImage, getEnhanceHistory, getKleinHistory, uploadImageFile } from "../../lib/api";
import type { CreationTaskSummary } from "../../lib/creation-state";
import type { ProviderStatus } from "../../lib/provider-status";
import { getLocalValue, STORAGE_KEYS } from "../../lib/storage";
import { dedupeGeneratedRecords, generatedResultKey, upsertGeneratedRecord } from "../../lib/result-dedupe";
import { Button } from "../../components/controls/Button";
import { IconButton } from "../../components/controls/IconButton";
import "./enhance.css";

export type EnhanceEngine = "local" | "ms";
export type EnhanceTaskSummary = CreationTaskSummary;

interface EnhanceWorkspaceProps {
  clientId: string;
  apiConfig: ApiConfig | null;
  providerStatus: ProviderStatus;
  queueStatus: QueueStatus | null;
  taskMessage: unknown;
  onTaskChange: (task: EnhanceTaskSummary) => void;
  onOutputsChange: (outputs: GenerateRecord[]) => void;
}

const DEFAULT_TASK: EnhanceTaskSummary = {
  status: "idle",
  label: "Enhance ready",
  detail: "No active Enhance task"
};

const DEFAULT_PROMPT = "masterpiece, best quality, ultra-detailed, high resolution";
const KLEIN_MODEL = "black-forest-labs/FLUX.2-klein-9B";
const KLEIN_LORA = "Daniel8152/Klein-enhance";

function timestampLabel(timestamp?: number): string {
  if (!timestamp) return "";
  const value = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function imageUrl(record: GenerateRecord): string {
  return record.images?.[0] || "";
}

function recordPrompt(record: GenerateRecord): string {
  const params = record.params || {};
  const node204 = params["204"];
  if (node204 && typeof node204 === "object" && "prompt" in node204) {
    return String((node204 as { prompt?: unknown }).prompt || record.prompt || "Enhanced");
  }
  return record.prompt || "Enhanced";
}

function recordStrength(record: GenerateRecord): string {
  const node204 = record.params?.["204"];
  if (node204 && typeof node204 === "object" && "value" in node204) {
    const value = Number((node204 as { value?: unknown }).value);
    if (Number.isFinite(value)) return value.toFixed(2);
  }
  return "n/a";
}

function originalImageUrl(record: GenerateRecord): string {
  const node15 = record.params?.["15"];
  if (!node15 || typeof node15 !== "object" || !("image" in node15)) return "";
  const imageName = String((node15 as { image?: unknown }).image || "");
  if (!imageName) return "";
  if (imageName.startsWith("data:") || imageName.startsWith("/") || imageName.startsWith("http")) return imageName;
  return `/api/view?filename=${encodeURIComponent(imageName)}&type=input`;
}

function isEnhanceBroadcast(message: unknown): message is { type: string; data: GenerateRecord } {
  if (!message || typeof message !== "object") return false;
  const candidate = message as { type?: unknown; data?: unknown };
  if (candidate.type !== "new_image" || !candidate.data || typeof candidate.data !== "object") return false;
  const data = candidate.data as GenerateRecord;
  return (data.type === "enhance" || data.type === "klein") && Array.isArray(data.images);
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

function canUseModelScope(apiConfig: ApiConfig | null): boolean {
  return Boolean(apiConfig?.has_ms_key || getLocalValue(STORAGE_KEYS.modelscopeToken));
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

export function EnhanceWorkspace({
  clientId,
  apiConfig,
  providerStatus,
  queueStatus,
  taskMessage,
  onTaskChange,
  onOutputsChange
}: EnhanceWorkspaceProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [engine, setEngine] = useState<EnhanceEngine>(() => (
    localStorage.getItem("enhance_engine_mode") === "ms" ? "ms" : "local"
  ));
  const [prompt, setPrompt] = useState("");
  const [strength, setStrength] = useState(0.5);
  const [upscaleEnabled, setUpscaleEnabled] = useState(false);
  const [upscaleFactor, setUpscaleFactor] = useState<2048 | 4096>(2048);
  const [inputName, setInputName] = useState("");
  const [inputDataUrl, setInputDataUrl] = useState("");
  const [uploadedPath, setUploadedPath] = useState("");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "ready" | "failed">("idle");
  const [records, setRecords] = useState<GenerateRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusText, setStatusText] = useState("Awaiting source image");
  const [errorText, setErrorText] = useState("");
  const [preview, setPreview] = useState<GenerateRecord | null>(null);

  const cloudAvailable = canUseModelScope(apiConfig);
  const busy = isSubmitting || uploadStatus === "uploading" || Boolean(queueStatus?.position);
  const latestRecords = useMemo(() => records.slice(0, 8), [records]);

  const publishTask = useCallback((task: EnhanceTaskSummary) => {
    onTaskChange(task);
  }, [onTaskChange]);

  const publishOutputs = useCallback((nextRecords: GenerateRecord[]) => {
    onOutputsChange(nextRecords.slice(0, 12));
  }, [onOutputsChange]);

  const loadHistory = useCallback((signal?: AbortSignal) => {
    setIsLoadingHistory(true);
    Promise.allSettled([getEnhanceHistory(signal), getKleinHistory(signal)])
      .then((results) => {
        const next = results
          .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
          .filter((record) => record.images?.length);
        const deduped = dedupeGeneratedRecords(next, { limit: 48, sortByTimestamp: true });
        setRecords(deduped);
        publishOutputs(deduped);
        setStatusText(deduped.length ? `Loaded ${deduped.length} recent enhancements` : "No enhance history yet");
      })
      .catch(() => {
        if (!signal?.aborted) setErrorText("Enhance history unavailable. Check the backend and try again.");
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
    localStorage.setItem("enhance_engine_mode", engine);
  }, [engine]);

  useEffect(() => {
    if (!isEnhanceBroadcast(taskMessage)) return;
    setRecords((current) => {
      const next = upsertGeneratedRecord(current, taskMessage.data, { limit: 48, sortByTimestamp: true });
      publishOutputs(next);
      return next;
    });
    publishTask({
      status: "succeeded",
      label: "Enhance finished",
      detail: `${taskMessage.data.images.length} image${taskMessage.data.images.length === 1 ? "" : "s"} available`,
      prompt: recordPrompt(taskMessage.data)
    });
    setStatusText("New enhanced output received");
  }, [publishOutputs, publishTask, taskMessage]);

  const handleFile = useCallback(async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      const message = "Unsupported file type. Choose a PNG or JPG image.";
      setErrorText(message);
      publishTask({ status: "failed", label: "Enhance upload blocked", detail: message, error: message });
      return;
    }

    setInputName(file.name || "image");
    setUploadStatus("uploading");
    setUploadedPath("");
    setErrorText("");
    setStatusText("Uploading input image");
    publishTask({ status: "pending", label: "Enhance upload running", detail: file.name || "image" });

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setInputDataUrl(dataUrl);
      const upload = await uploadImageFile(file, file.name || "image");
      const comfyName = upload.files?.[0]?.comfy_name;
      if (!comfyName) throw new Error("Upload returned no ComfyUI image name.");
      setUploadedPath(comfyName);
      setUploadStatus("ready");
      setStatusText(`Input ready · ${comfyName.split("/").pop() || comfyName}`);
      publishTask({ status: "idle", label: "Enhance ready", detail: "Input image uploaded" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed.";
      setUploadStatus("failed");
      setErrorText(message);
      setStatusText("Upload failed");
      publishTask({ status: "failed", label: "Enhance upload failed", detail: message, error: message });
    }
  }, [publishTask]);

  const clearInput = useCallback(() => {
    setInputName("");
    setInputDataUrl("");
    setUploadedPath("");
    setUploadStatus("idle");
    setErrorText("");
    setStatusText("Awaiting source image");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const onDrop = useCallback((event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    void handleFile(event.dataTransfer.files?.[0]);
  }, [handleFile]);

  const submitEnhance = useCallback(async () => {
    const cleanPrompt = prompt.trim();
    const runPrompt = cleanPrompt || DEFAULT_PROMPT;
    if (!inputDataUrl) {
      const message = "Input image required. Upload an image to enhance.";
      setErrorText(message);
      setStatusText("Input required");
      publishTask({ status: "failed", label: "Enhance blocked", detail: message, error: message });
      return;
    }
    if (engine === "local" && !uploadedPath) {
      const message = uploadStatus === "uploading"
        ? "Input upload is still running."
        : "Input upload failed. Choose the image again.";
      setErrorText(message);
      setStatusText("Input upload required");
      publishTask({ status: "failed", label: "Enhance blocked", detail: message, prompt: runPrompt, error: message });
      return;
    }
    if (engine === "ms" && !cloudAvailable) {
      const message = "ModelScope key missing. Add a key or switch to Local.";
      setErrorText(message);
      setStatusText("Cloud key missing");
      publishTask({ status: "failed", label: "Enhance blocked", detail: message, prompt: runPrompt, error: message });
      return;
    }

    setIsSubmitting(true);
    setErrorText("");
    setStatusText(engine === "local" ? "Submitting to local Enhance workflow" : "Submitting to Klein cloud Enhance");
    publishTask({
      status: "running",
      label: engine === "local" ? "Local Enhance running" : "Klein Enhance running",
      detail: `Strength ${strength.toFixed(2)}${upscaleEnabled && engine === "local" ? ` · ${upscaleFactor}` : ""}`,
      prompt: runPrompt,
      startedAt: Date.now()
    });

    try {
      let finalRecord: GenerateRecord;
      if (engine === "ms") {
        const apiKey = getLocalValue(STORAGE_KEYS.modelscopeToken);
        const result = await generateMsImage({
          prompt: runPrompt,
          model: KLEIN_MODEL,
          api_key: apiKey,
          image_urls: [inputDataUrl],
          loras: { [KLEIN_LORA]: strength },
          client_id: clientId
        });
        if (!result.url) {
          throw new Error(typeof result.detail === "string" ? result.detail : "Klein Enhance returned no image.");
        }
        finalRecord = {
          timestamp: Date.now(),
          prompt: runPrompt,
          images: [result.url],
          type: "klein",
          model: KLEIN_MODEL,
          status: result.status || "succeeded",
          task_id: result.task_id,
          params: {
            "15": { image: uploadedPath || inputDataUrl },
            "204": { value: strength, prompt: runPrompt }
          }
        };
      } else {
        const params204: Record<string, unknown> = { value: strength };
        if (cleanPrompt) params204.prompt = cleanPrompt;
        const enhanceResult = await generateWorkflowImage({
          workflow_json: "Z-Image-Enhance.json",
          params: {
            "15": { image: uploadedPath },
            "204": params204
          },
          type: "enhance",
          client_id: clientId,
          prompt: cleanPrompt
        });
        if (!enhanceResult.images?.length || enhanceResult.status === "failed") {
          throw new Error(enhanceResult.error || "Enhance returned no images.");
        }
        finalRecord = enhanceResult;

        if (upscaleEnabled) {
          setStatusText("Uploading enhanced image for upscale");
          const source = await fetch(enhanceResult.images[0]);
          if (!source.ok) throw new Error(`Upscale preparation failed with ${source.status}.`);
          const blob = await source.blob();
          const upload = await uploadImageFile(blob, "temp_upscale_input.png");
          const upscaleInput = upload.files?.[0]?.comfy_name;
          if (!upscaleInput) throw new Error("Intermediate upscale upload returned no image name.");
          setStatusText("Running upscale workflow");
          const upscaleSeed = Math.floor(Math.random() * 4294967295);
          const upscaleResult = await generateWorkflowImage({
            workflow_json: "upscale.json",
            params: {
              "15": { image: upscaleInput },
              "172": { seed: upscaleSeed, resolution: upscaleFactor }
            },
            type: "enhance",
            client_id: clientId
          });
          if (!upscaleResult.images?.length || upscaleResult.status === "failed") {
            throw new Error(upscaleResult.error || "Upscale returned no images.");
          }
          finalRecord = upscaleResult;
        }
      }

      setRecords((current) => {
        const next = upsertGeneratedRecord(current, finalRecord, { limit: 48, sortByTimestamp: true });
        publishOutputs(next);
        return next;
      });
      setPreview(finalRecord);
      setStatusText("Enhance complete");
      publishTask({
        status: "succeeded",
        label: "Enhance complete",
        detail: `${finalRecord.images.length} image${finalRecord.images.length === 1 ? "" : "s"} saved`,
        prompt: recordPrompt(finalRecord)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Enhance failed.";
      setErrorText(message);
      setStatusText("Enhance failed");
      publishTask({ status: "failed", label: "Enhance failed", detail: message, prompt: runPrompt, error: message });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    clientId,
    cloudAvailable,
    engine,
    inputDataUrl,
    prompt,
    publishOutputs,
    publishTask,
    strength,
    uploadedPath,
    uploadStatus,
    upscaleEnabled,
    upscaleFactor
  ]);

  const copyMetadata = useCallback((record: GenerateRecord) => {
    const text = [
      recordPrompt(record),
      `engine ${record.type || "enhance"} · strength ${recordStrength(record)}`,
      imageUrl(record)
    ].filter(Boolean).join("\n");
    void copyToClipboard(text);
  }, []);

  return (
    <div className="qc-generate-workspace qc-enhance-workspace">
      <aside className="qc-generate-panel qc-enhance-panel" aria-label="Enhance settings">
        <div className="qc-generate-panel__head">
          <div>
            <h2>Input</h2>
            <p>{providerStatus.configured ? providerStatus.detail : providerStatus.label}</p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          accept="image/*"
          className="qc-enhance-file-input"
          onChange={(event) => void handleFile(event.target.files?.[0])}
          type="file"
        />
        <button
          className={`qc-enhance-dropzone${inputDataUrl ? " has-image" : ""}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
          type="button"
        >
          {inputDataUrl ? (
            <img src={inputDataUrl} alt={inputName || "Input image"} />
          ) : (
            <>
              <UploadCloud size={24} strokeWidth={1.8} aria-hidden="true" />
              <strong>Drop image or click</strong>
              <span>PNG / JPG source image</span>
            </>
          )}
        </button>
        {inputName ? (
          <div className="qc-enhance-input-row">
            <div>
              <strong>{inputName}</strong>
              <span>{uploadStatus === "ready" ? "ready" : uploadStatus}</span>
            </div>
            <IconButton label="Remove input image" onClick={clearInput}>
              <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
            </IconButton>
          </div>
        ) : null}

        <label className="qc-field qc-enhance-prompt">
          <span>Prompt <em>optional</em></span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={DEFAULT_PROMPT}
            rows={3}
          />
        </label>

        <label className="qc-range-field">
          <span>Refinement strength <strong>{strength.toFixed(2)}</strong></span>
          <input
            max={1}
            min={0.1}
            onChange={(event) => setStrength(Number(event.target.value))}
            step={0.01}
            type="range"
            value={strength}
          />
        </label>

        <fieldset className="qc-fieldset">
          <legend>Engine</legend>
          <div className="qc-segmented">
            <button className={engine === "local" ? "is-active" : ""} type="button" onClick={() => setEngine("local")}>
              Local ComfyUI
            </button>
            <button className={engine === "ms" ? "is-active" : ""} type="button" onClick={() => setEngine("ms")}>
              Klein cloud
            </button>
          </div>
          {engine === "ms" && !cloudAvailable ? (
            <p className="qc-field-hint is-warning">ModelScope key missing. Add one in API / Models or use Local.</p>
          ) : null}
        </fieldset>

        <label className={`qc-check-row${engine === "ms" ? " is-disabled" : ""}`}>
          <input
            checked={upscaleEnabled}
            disabled={engine === "ms"}
            onChange={(event) => setUpscaleEnabled(event.target.checked)}
            type="checkbox"
          />
          <span>Super resolution</span>
        </label>

        {upscaleEnabled && engine === "local" ? (
          <div className="qc-segmented qc-enhance-upscale">
            <button className={upscaleFactor === 2048 ? "is-active" : ""} type="button" onClick={() => setUpscaleFactor(2048)}>
              2K
            </button>
            <button className={upscaleFactor === 4096 ? "is-active" : ""} type="button" onClick={() => setUpscaleFactor(4096)}>
              4K
            </button>
          </div>
        ) : null}

        <div className="qc-generate-status" data-state={errorText ? "error" : busy ? "busy" : "idle"}>
          {errorText ? <AlertCircle size={16} strokeWidth={2} aria-hidden="true" /> : <Image size={16} strokeWidth={2} aria-hidden="true" />}
          <span>{errorText || statusText}</span>
        </div>

        <Button variant="primary" className="qc-generate-submit" disabled={isSubmitting || uploadStatus === "uploading"} onClick={submitEnhance}>
          {isSubmitting ? "Enhancing..." : "Enhance"}
        </Button>
      </aside>

      <main className="qc-generate-results qc-enhance-results" aria-label="Enhance results">
        <div className="qc-results-head">
          <div>
            <h2>Results</h2>
            <p>{isLoadingHistory ? "Loading history..." : `${records.length} recent enhancement${records.length === 1 ? "" : "s"}`}</p>
          </div>
          <Button variant="ghost" icon={<RefreshCw size={15} strokeWidth={2} aria-hidden="true" />} onClick={() => loadHistory()}>
            Refresh
          </Button>
        </div>

        {isSubmitting ? (
          <div className="qc-render-card">
            <div className="qc-render-card__preview"><span /></div>
            <div>
              <strong>{engine === "local" ? "Local Enhance running" : "Klein Enhance running"}</strong>
              <p>Strength {strength.toFixed(2)} · {inputName || "Untitled image"}</p>
            </div>
          </div>
        ) : null}

        {!isLoadingHistory && !records.length && !isSubmitting ? (
          <div className="qc-results-empty">
            <Image size={22} strokeWidth={1.8} aria-hidden="true" />
            <strong>No enhancements yet</strong>
            <span>Upload a source image to create an enhanced output.</span>
          </div>
        ) : (
          <div className="qc-result-grid">
            {latestRecords.map((record, index) => {
              const src = imageUrl(record);
              return (
                <article className="qc-result-card" key={generatedResultKey(record, index)}>
                  <button type="button" className="qc-result-card__image" onClick={() => setPreview(record)}>
                    {src ? <img src={src} alt={recordPrompt(record)} /> : <Image size={22} strokeWidth={1.8} aria-hidden="true" />}
                  </button>
                  <div className="qc-result-card__body">
                    <p title={recordPrompt(record)}>{recordPrompt(record)}</p>
                    <span>{record.type || "enhance"} · strength {recordStrength(record)} · {timestampLabel(record.timestamp)}</span>
                  </div>
                  <div className="qc-result-card__actions">
                    <IconButton label="Copy enhance metadata" onClick={() => copyMetadata(record)}>
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
        <div className="qc-preview" role="dialog" aria-modal="true" aria-label="Enhanced image preview" onClick={() => setPreview(null)}>
          <div className="qc-preview__dialog qc-enhance-preview" onClick={(event) => event.stopPropagation()}>
            <div className="qc-preview__bar">
              <div>
                <strong>{preview.type || "enhance"} · strength {recordStrength(preview)}</strong>
                <span>{recordPrompt(preview)}</span>
              </div>
              <IconButton label="Close preview" onClick={() => setPreview(null)}>
                <X size={17} strokeWidth={2} aria-hidden="true" />
              </IconButton>
            </div>
            <div className="qc-enhance-compare">
              {originalImageUrl(preview) ? (
                <figure>
                  <span>Before</span>
                  <img src={originalImageUrl(preview)} alt="Before enhancement" />
                </figure>
              ) : null}
              <figure>
                <span>After</span>
                <img src={imageUrl(preview)} alt={recordPrompt(preview)} />
              </figure>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
