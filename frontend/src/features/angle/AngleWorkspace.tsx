import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { AlertCircle, Cloud, Copy, Download, ExternalLink, Image, Loader2, RefreshCw, RotateCcw, SlidersHorizontal, UploadCloud } from "lucide-react";
import type { ApiConfig, GenerateRecord, QueueStatus } from "../../lib/api";
import { generateAngleCloud, generateWorkflowImage, getAngleHistory, pollAngleCloud, uploadImageFile } from "../../lib/api";
import type { CreationTaskSummary } from "../../lib/creation-state";
import type { ProviderStatus } from "../../lib/provider-status";
import { getLocalValue, STORAGE_KEYS } from "../../lib/storage";
import { generatedResultKey, upsertGeneratedRecord } from "../../lib/result-dedupe";
import { Button } from "../../components/controls/Button";
import { IconButton } from "../../components/controls/IconButton";
import "../generate/generate.css";
import "./angle.css";

export type AngleTaskSummary = CreationTaskSummary;
export type AngleEngine = "local" | "cloud";

export interface AngleRailContext {
  sourceName?: string;
  sourcePreviewUrl?: string;
  engine: string;
  rotation: number;
  pitch: number;
  distance: number;
  prompt: string;
  status: string;
  taskId?: string;
  error?: string;
  lastOutputUrl?: string;
  detail: string;
}

interface AngleWorkspaceProps {
  clientId: string;
  apiConfig: ApiConfig | null;
  providerStatus: ProviderStatus;
  queueStatus: QueueStatus | null;
  taskMessage: unknown;
  onTaskChange: (task: AngleTaskSummary) => void;
  onOutputsChange: (outputs: GenerateRecord[]) => void;
  onContextChange: (context: AngleRailContext) => void;
}

const DEFAULT_PROMPT = "Keep the subject identity and outfit consistent while changing only the camera view.";
const MODEL_SCOPE_ANGLE_MODEL = "Qwen/Qwen-Image-Edit-2511";
const ENGINE_KEY = "angle_engine_mode";

function imageUrl(record?: GenerateRecord | null): string {
  return record?.images?.[0] || "";
}

function timestampLabel(timestamp?: number): string {
  if (!timestamp) return "";
  const value = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function angleCommand(rotation: number, pitch: number, distance: number): string {
  const parts: string[] = [];
  if (rotation !== 0) {
    parts.push(`${rotation > 0 ? "向右" : "向左"}旋转${Math.abs(rotation)}度`);
  }
  if (pitch !== 0) {
    parts.push(`${pitch > 0 ? "俯视" : "仰视"}${Math.abs(pitch)}度`);
  }
  let text = parts.length ? `将相机${parts.join("，")}` : "";
  const lens = distance > 4 ? "使用广角镜头" : distance < 4 ? "使用特写镜头" : "";
  if (lens) text += `${text ? "，" : "将相机"}${lens}`;
  return text;
}

function replaceAngleCommand(prompt: string, command: string): string {
  const withoutExisting = prompt.replace(/(^|\n)将相机.*?(?=\n|$)/g, "").trim();
  return [withoutExisting, command].filter(Boolean).join("\n") || command;
}

function recordFromCloud(response: { url?: string; task_id?: string; status?: string }, prompt: string, params: Record<string, unknown>): GenerateRecord {
  return {
    timestamp: Date.now(),
    prompt,
    images: response.url ? [response.url] : [],
    type: "angle",
    status: response.status || "succeeded",
    task_id: response.task_id,
    model: MODEL_SCOPE_ANGLE_MODEL,
    provider_id: "modelscope",
    params
  };
}

function isAngleBroadcast(message: unknown): message is { type: string; data: GenerateRecord } {
  if (!message || typeof message !== "object") return false;
  const candidate = message as { type?: unknown; data?: unknown };
  if (candidate.type !== "new_image" || !candidate.data || typeof candidate.data !== "object") return false;
  const data = candidate.data as GenerateRecord;
  return data.type === "angle" && Array.isArray(data.images);
}

function cloudReady(config: ApiConfig | null): boolean {
  return Boolean(config?.has_ms_key || getLocalValue(STORAGE_KEYS.modelscopeToken));
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the uploaded image."));
    reader.readAsDataURL(file);
  });
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

export function AngleWorkspace({
  clientId,
  apiConfig,
  providerStatus,
  queueStatus,
  taskMessage,
  onTaskChange,
  onOutputsChange,
  onContextChange
}: AngleWorkspaceProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [engine, setEngine] = useState<AngleEngine>(() => (localStorage.getItem(ENGINE_KEY) === "cloud" ? "cloud" : "local"));
  const [rotation, setRotation] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [distance, setDistance] = useState(4);
  const [prompt, setPrompt] = useState(() => replaceAngleCommand(DEFAULT_PROMPT, ""));
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState("");
  const [uploadedComfyName, setUploadedComfyName] = useState("");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "failed">("idle");
  const [records, setRecords] = useState<GenerateRecord[]>([]);
  const [preview, setPreview] = useState<GenerateRecord | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [statusText, setStatusText] = useState("Ready");
  const [errorText, setErrorText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cloudTaskId, setCloudTaskId] = useState("");

  const command = useMemo(() => angleCommand(rotation, pitch, distance), [distance, pitch, rotation]);
  const cloudConfigured = cloudReady(apiConfig);
  const latestRecords = useMemo(() => records.slice(0, 12), [records]);
  const latestOutputUrl = preview ? imageUrl(preview) : imageUrl(records[0]);
  const busy = isSubmitting || uploadStatus === "uploading" || Boolean(queueStatus?.position);

  const publishTask = useCallback((task: AngleTaskSummary) => {
    onTaskChange(task);
  }, [onTaskChange]);

  const publishOutputs = useCallback((nextRecords: GenerateRecord[]) => {
    onOutputsChange(nextRecords.slice(0, 12));
  }, [onOutputsChange]);

  const setControl = useCallback((next: Partial<{ rotation: number; pitch: number; distance: number }>) => {
    const nextRotation = next.rotation ?? rotation;
    const nextPitch = next.pitch ?? pitch;
    const nextDistance = next.distance ?? distance;
    setRotation(nextRotation);
    setPitch(nextPitch);
    setDistance(nextDistance);
    setPrompt((current) => replaceAngleCommand(current, angleCommand(nextRotation, nextPitch, nextDistance)));
  }, [distance, pitch, rotation]);

  const resetControls = useCallback(() => {
    setControl({ rotation: 0, pitch: 0, distance: 4 });
  }, [setControl]);

  const loadHistory = useCallback((signal?: AbortSignal) => {
    setLoadingHistory(true);
    getAngleHistory(signal)
      .then((history) => {
        const next = history
          .filter((record) => record.images?.length)
          .reduce<GenerateRecord[]>((acc, record) => upsertGeneratedRecord(acc, record, { limit: 48, sortByTimestamp: true }), []);
        setRecords(next);
        publishOutputs(next);
        setStatusText(next.length ? `Loaded ${next.length} Angle outputs` : "No Angle history yet");
      })
      .catch(() => {
        if (!signal?.aborted) setErrorText("Angle history unavailable. Check the backend and try again.");
      })
      .finally(() => {
        if (!signal?.aborted) setLoadingHistory(false);
      });
  }, [publishOutputs]);

  useEffect(() => {
    const abort = new AbortController();
    publishTask({ status: "idle", label: "Angle ready", detail: "No active Angle task" });
    loadHistory(abort.signal);
    return () => abort.abort();
  }, [loadHistory, publishTask]);

  useEffect(() => {
    localStorage.setItem(ENGINE_KEY, engine);
  }, [engine]);

  useEffect(() => () => {
    if (sourcePreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(sourcePreviewUrl);
  }, [sourcePreviewUrl]);

  useEffect(() => {
    if (!isAngleBroadcast(taskMessage)) return;
    setRecords((current) => {
      const next = upsertGeneratedRecord(current, taskMessage.data, { limit: 48, sortByTimestamp: true });
      publishOutputs(next);
      return next;
    });
    publishTask({
      status: "succeeded",
      label: "Angle finished",
      detail: `${taskMessage.data.images.length} image${taskMessage.data.images.length === 1 ? "" : "s"} available`,
      prompt: taskMessage.data.prompt
    });
    setStatusText("New Angle output received");
  }, [publishOutputs, publishTask, taskMessage]);

  useEffect(() => {
    const detail = sourceName
      ? `${engine === "cloud" ? "Cloud ModelScope" : "Local ComfyUI"} · ${sourceName}`
      : "Upload a source image to run Angle.";
    onContextChange({
      sourceName,
      sourcePreviewUrl,
      engine: engine === "cloud" ? "Cloud ModelScope" : "Local ComfyUI",
      rotation,
      pitch,
      distance,
      prompt,
      status: isSubmitting ? "running" : uploadStatus === "uploading" ? "uploading" : errorText ? "failed" : "idle",
      taskId: cloudTaskId,
      error: errorText,
      lastOutputUrl: latestOutputUrl,
      detail
    });
  }, [cloudTaskId, distance, engine, errorText, isSubmitting, latestOutputUrl, onContextChange, pitch, prompt, rotation, sourceName, sourcePreviewUrl, uploadStatus]);

  const applyFile = useCallback(async (file?: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    if (sourcePreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(sourcePreviewUrl);
    const localPreview = URL.createObjectURL(file);
    setSourceFile(file);
    setSourceName(file.name || "source image");
    setSourcePreviewUrl(localPreview);
    setUploadedComfyName("");
    setErrorText("");
    setUploadStatus("uploading");
    publishTask({ status: "pending", label: "Angle upload running", detail: file.name });
    try {
      const response = await uploadImageFile(file, file.name || "angle-source.png");
      const uploaded = response.files?.[0];
      if (!uploaded?.comfy_name) throw new Error("Upload did not return a ComfyUI input name.");
      setUploadedComfyName(uploaded.comfy_name);
      setUploadStatus("idle");
      setStatusText("Source uploaded");
      publishTask({ status: "idle", label: "Angle ready", detail: uploaded.name || uploaded.comfy_name });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Angle upload failed.";
      setUploadStatus("failed");
      setErrorText(message);
      publishTask({ status: "failed", label: "Angle upload failed", detail: message, error: message });
    }
  }, [publishTask, sourcePreviewUrl]);

  const onFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    void applyFile(file);
  }, [applyFile]);

  const onDrop = useCallback((event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    void applyFile(event.dataTransfer.files?.[0]);
  }, [applyFile]);

  const upsertResult = useCallback((record: GenerateRecord) => {
    setRecords((current) => {
      const next = upsertGeneratedRecord(current, record, { limit: 48, sortByTimestamp: true });
      publishOutputs(next);
      return next;
    });
    setPreview(record);
  }, [publishOutputs]);

  const handleCloudResponse = useCallback((response: { url?: string; task_id?: string; status?: string; message?: string }, cleanPrompt: string, params: Record<string, unknown>) => {
    if (response.url) {
      const record = recordFromCloud(response, cleanPrompt, params);
      upsertResult(record);
      setCloudTaskId(response.task_id || "");
      setStatusText("Cloud Angle complete");
      publishTask({ status: "succeeded", label: "Angle cloud complete", detail: MODEL_SCOPE_ANGLE_MODEL, prompt: cleanPrompt });
      return true;
    }
    if (String(response.status || "").toLowerCase() === "timeout") {
      setCloudTaskId(response.task_id || "");
      setStatusText("Cloud task is still running. Continue polling when ready.");
      publishTask({ status: "pending", label: "Angle cloud waiting", detail: response.task_id || "Task still pending", prompt: cleanPrompt });
      return false;
    }
    throw new Error(response.message || response.status || "Cloud Angle returned no image URL.");
  }, [publishTask, upsertResult]);

  const runLocal = useCallback(async (cleanPrompt: string) => {
    if (!uploadedComfyName) throw new Error("Upload a source image before running local Angle.");
    const seed = Math.floor(Math.random() * 1000000000000000);
    const result = await generateWorkflowImage({
      workflow_json: "2511.json",
      params: {
        "31": { image: uploadedComfyName },
        "11": { prompt: cleanPrompt },
        "14": { seed }
      },
      type: "angle",
      client_id: clientId
    });
    if (result.error || !result.images?.length) throw new Error(result.error || "Local Angle returned no image.");
    const record: GenerateRecord = {
      ...result,
      prompt: cleanPrompt,
      type: "angle",
      params: {
        ...(result.params || {}),
        engine: "local",
        rotation,
        pitch,
        distance,
        source_image: uploadedComfyName
      }
    };
    upsertResult(record);
    setStatusText("Local Angle complete");
    publishTask({ status: "succeeded", label: "Angle local complete", detail: "2511.json", prompt: cleanPrompt });
  }, [clientId, distance, pitch, publishTask, rotation, uploadedComfyName, upsertResult]);

  const runCloud = useCallback(async (cleanPrompt: string) => {
    if (!sourceFile) throw new Error("Upload a source image before running cloud Angle.");
    if (!cloudConfigured) throw new Error("ModelScope key missing. Add MODELSCOPE_API_KEY or a local ModelScope token.");
    const dataUri = await fileToDataUrl(sourceFile);
    const apiKey = getLocalValue(STORAGE_KEYS.modelscopeToken);
    const payload = {
      prompt: cleanPrompt,
      api_key: apiKey,
      type: "angle" as const,
      model: MODEL_SCOPE_ANGLE_MODEL,
      image_urls: [dataUri],
      client_id: clientId
    };
    const response = await generateAngleCloud(payload);
    handleCloudResponse(response, cleanPrompt, {
      engine: "cloud",
      model: MODEL_SCOPE_ANGLE_MODEL,
      rotation,
      pitch,
      distance,
      task_id: response.task_id || ""
    });
  }, [clientId, cloudConfigured, distance, handleCloudResponse, pitch, rotation, sourceFile]);

  const runAngle = useCallback(async () => {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      const message = "Prompt is required.";
      setErrorText(message);
      publishTask({ status: "failed", label: "Angle blocked", detail: message, error: message });
      return;
    }
    if (!sourceFile && !uploadedComfyName) {
      const message = "Upload a source image before generating.";
      setErrorText(message);
      publishTask({ status: "failed", label: "Angle blocked", detail: message, prompt: cleanPrompt, error: message });
      return;
    }
    setIsSubmitting(true);
    setErrorText("");
    setStatusText(engine === "cloud" ? "Submitting cloud Angle" : "Running local Angle");
    setCloudTaskId("");
    publishTask({
      status: "running",
      label: engine === "cloud" ? "Angle cloud running" : "Angle local running",
      detail: engine === "cloud" ? MODEL_SCOPE_ANGLE_MODEL : "2511.json",
      prompt: cleanPrompt,
      startedAt: Date.now()
    });
    try {
      if (engine === "cloud") {
        await runCloud(cleanPrompt);
      } else {
        await runLocal(cleanPrompt);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Angle generation failed.";
      setErrorText(message);
      setStatusText("Angle generation failed");
      publishTask({ status: "failed", label: "Angle failed", detail: message, prompt: cleanPrompt, error: message });
    } finally {
      setIsSubmitting(false);
    }
  }, [engine, prompt, publishTask, runCloud, runLocal, sourceFile, uploadedComfyName]);

  const continueCloudPoll = useCallback(async () => {
    if (!cloudTaskId) return;
    const cleanPrompt = prompt.trim();
    setIsSubmitting(true);
    setErrorText("");
    setStatusText("Polling cloud Angle task");
    publishTask({ status: "running", label: "Angle cloud polling", detail: cloudTaskId, prompt: cleanPrompt });
    try {
      const response = await pollAngleCloud({
        task_id: cloudTaskId,
        api_key: getLocalValue(STORAGE_KEYS.modelscopeToken),
        client_id: clientId
      });
      handleCloudResponse(response, cleanPrompt, {
        engine: "cloud",
        model: MODEL_SCOPE_ANGLE_MODEL,
        rotation,
        pitch,
        distance,
        task_id: cloudTaskId
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cloud Angle polling failed.";
      setErrorText(message);
      setStatusText("Cloud Angle polling failed");
      publishTask({ status: "failed", label: "Angle cloud failed", detail: message, prompt: cleanPrompt, error: message });
    } finally {
      setIsSubmitting(false);
    }
  }, [clientId, cloudTaskId, distance, handleCloudResponse, pitch, prompt, publishTask, rotation]);

  const copyMetadata = useCallback((record: GenerateRecord) => {
    void copyToClipboard([record.prompt, imageUrl(record), record.model || record.params?.model].filter(Boolean).join("\n"));
  }, []);

  return (
    <section className="qc-angle-workspace" aria-label="Native Angle workspace">
      <aside className="qc-angle-panel">
        <div className="qc-angle-panel__header">
          <div>
            <h2>Angle control</h2>
            <span>{providerStatus.label} · {statusText}</span>
          </div>
          <IconButton label="Refresh Angle history" onClick={() => loadHistory()}>
            <RefreshCw size={16} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        </div>

        <div className="qc-angle-engine" role="group" aria-label="Angle engine">
          <button type="button" className={engine === "local" ? "is-active" : ""} onClick={() => setEngine("local")}>
            <SlidersHorizontal size={15} strokeWidth={2} aria-hidden="true" />
            Local ComfyUI
          </button>
          <button type="button" className={engine === "cloud" ? "is-active" : ""} onClick={() => setEngine("cloud")}>
            <Cloud size={15} strokeWidth={2} aria-hidden="true" />
            Cloud ModelScope
          </button>
        </div>

        <button
          type="button"
          className={`qc-angle-upload${sourcePreviewUrl ? " has-image" : ""}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
        >
          <input ref={fileInputRef} type="file" accept="image/*" onChange={onFileChange} />
          {sourcePreviewUrl ? <img src={sourcePreviewUrl} alt={sourceName || "Angle source"} /> : <UploadCloud size={26} strokeWidth={1.8} aria-hidden="true" />}
          <span>{sourceName || "Upload source image"}</span>
          <small>{uploadStatus === "uploading" ? "Uploading..." : uploadedComfyName ? uploadedComfyName : "Click or drop an image"}</small>
        </button>

        <div className="qc-angle-controls" aria-label="Camera controls">
          <AngleSlider label="Rotation" value={rotation} min={-180} max={180} step={1} unit="deg" onChange={(value) => setControl({ rotation: value })} />
          <AngleSlider label="Pitch" value={pitch} min={-90} max={90} step={1} unit="deg" onChange={(value) => setControl({ pitch: value })} />
          <AngleSlider label="Distance" value={distance} min={0.1} max={8} step={0.1} unit="" onChange={(value) => setControl({ distance: Number(value.toFixed(1)) })} />
        </div>

        <div className="qc-angle-lens">
          <span>Lens</span>
          <strong>{distance > 4 ? "Wide angle" : distance < 4 ? "Close-up" : "Neutral"}</strong>
          <Button variant="ghost" icon={<RotateCcw size={14} strokeWidth={2} aria-hidden="true" />} onClick={resetControls}>Reset</Button>
        </div>

        <label className="qc-angle-field">
          <span>Prompt</span>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        </label>
        {command ? <div className="qc-angle-command">{command}</div> : null}

        {errorText ? (
          <div className="qc-angle-error" role="alert">
            <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />
            <span>{errorText}</span>
          </div>
        ) : null}

        <div className="qc-angle-actions">
          <Button
            variant="primary"
            icon={isSubmitting ? <Loader2 className="qc-spin" size={16} strokeWidth={2} aria-hidden="true" /> : <RotateCcw size={16} strokeWidth={2} aria-hidden="true" />}
            onClick={() => void runAngle()}
            disabled={busy}
          >
            Generate angle
          </Button>
          {cloudTaskId ? (
            <Button variant="secondary" icon={<Cloud size={15} strokeWidth={2} aria-hidden="true" />} onClick={() => void continueCloudPoll()} disabled={isSubmitting}>
              Continue polling
            </Button>
          ) : null}
        </div>
      </aside>

      <main className="qc-angle-main">
        <section className="qc-angle-preview" aria-label="Angle result preview">
          <div className="qc-angle-preview__head">
            <div>
              <h3>Preview</h3>
              <span>{engine === "cloud" ? MODEL_SCOPE_ANGLE_MODEL : "2511.json"} · {rotation} / {pitch} / {distance}</span>
            </div>
            {preview && imageUrl(preview) ? (
              <a href={imageUrl(preview)} target="_blank" rel="noreferrer">
                <ExternalLink size={15} strokeWidth={2} aria-hidden="true" />
                Open original
              </a>
            ) : null}
          </div>
          <div className="qc-angle-preview__stage">
            {isSubmitting ? (
              <div className="qc-angle-empty">
                <Loader2 className="qc-spin" size={28} strokeWidth={1.8} aria-hidden="true" />
                <strong>{engine === "cloud" ? "Cloud task running" : "Local render running"}</strong>
                <span>{statusText}</span>
              </div>
            ) : preview && imageUrl(preview) ? (
              <img src={imageUrl(preview)} alt={preview.prompt || "Angle output"} />
            ) : sourcePreviewUrl ? (
              <div className="qc-angle-source-preview">
                <img src={sourcePreviewUrl} alt={sourceName || "Angle source"} />
                <span>Source image ready</span>
              </div>
            ) : (
              <div className="qc-angle-empty">
                <Image size={30} strokeWidth={1.8} aria-hidden="true" />
                <strong>No source image</strong>
                <span>Upload a source and set the camera controls.</span>
              </div>
            )}
          </div>
        </section>

        <section className="qc-angle-history" aria-label="Angle history">
          <div className="qc-angle-history__head">
            <div>
              <h3>History</h3>
              <span>{loadingHistory ? "Loading..." : `${latestRecords.length} recent outputs`}</span>
            </div>
          </div>
          {loadingHistory ? (
            <div className="qc-angle-history-empty">
              <Loader2 className="qc-spin" size={18} strokeWidth={2} aria-hidden="true" />
              Loading Angle history
            </div>
          ) : latestRecords.length ? (
            <div className="qc-angle-grid">
              {latestRecords.map((record, index) => {
                const src = imageUrl(record);
                return (
                  <article className="qc-angle-card" key={generatedResultKey(record, index)}>
                    <button type="button" onClick={() => setPreview(record)}>
                      {src ? <img src={src} alt={record.prompt || "Angle output"} /> : <Image size={20} strokeWidth={1.8} aria-hidden="true" />}
                    </button>
                    <div>
                      <strong>{record.prompt || "Angle control"}</strong>
                      <span>{record.model || (record.params?.engine === "cloud" ? MODEL_SCOPE_ANGLE_MODEL : "2511.json")} · {timestampLabel(record.timestamp)}</span>
                    </div>
                    <div className="qc-angle-card__actions">
                      <IconButton label="Copy Angle metadata" onClick={() => copyMetadata(record)}>
                        <Copy size={14} strokeWidth={2} aria-hidden="true" />
                      </IconButton>
                      {src ? (
                        <a href={src} download={`Angle-${record.timestamp || Date.now()}.png`} aria-label="Download Angle output">
                          <Download size={14} strokeWidth={2} aria-hidden="true" />
                        </a>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="qc-angle-history-empty">
              <Image size={18} strokeWidth={1.8} aria-hidden="true" />
              No Angle history yet
            </div>
          )}
        </section>
      </main>
    </section>
  );
}

interface AngleSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}

function AngleSlider({ label, value, min, max, step, unit, onChange }: AngleSliderProps) {
  return (
    <label className="qc-angle-slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <input type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value) || 0)} />
      <small>{unit}</small>
    </label>
  );
}
