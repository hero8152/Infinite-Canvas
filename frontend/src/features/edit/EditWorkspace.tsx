import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Copy, Download, ExternalLink, Image, RefreshCw, RotateCcw, Trash2, UploadCloud, X } from "lucide-react";
import type { ApiConfig, GenerateRecord, MsGeneratePayload, QueueStatus } from "../../lib/api";
import { deleteHistoryItem, generateMsImage, generateWorkflowImage, getKleinHistory, uploadImageFile } from "../../lib/api";
import type { CreationTaskSummary } from "../../lib/creation-state";
import type { ProviderStatus } from "../../lib/provider-status";
import { generatedResultKey, isSameGeneratedResult, upsertGeneratedRecord } from "../../lib/result-dedupe";
import { Button } from "../../components/controls/Button";
import { IconButton } from "../../components/controls/IconButton";
import "../generate/generate.css";
import "./edit.css";

export type EditTaskSummary = CreationTaskSummary;

export interface EditInputSummary {
  url: string;
  name?: string;
  comfyName?: string;
}

interface EditWorkspaceProps {
  clientId: string;
  apiConfig: ApiConfig | null;
  providerStatus: ProviderStatus;
  queueStatus: QueueStatus | null;
  taskMessage: unknown;
  onTaskChange: (task: EditTaskSummary) => void;
  onOutputsChange: (outputs: GenerateRecord[]) => void;
  onContextChange: (context: string) => void;
  onInputChange: (input: EditInputSummary | null) => void;
}

type EditEngine = "local" | "cloud";
type EditSlotKey = "main" | "auxA" | "auxB";
type UploadStatus = "idle" | "uploading" | "ready" | "failed";

interface EditSlotState {
  fileName: string;
  comfyName: string;
  dataUrl: string;
  previewUrl: string;
  uploadStatus: UploadStatus;
  error: string;
}

const DEFAULT_TASK: EditTaskSummary = {
  status: "idle",
  label: "Edit ready",
  detail: "No active Edit task"
};

const KLEIN_MODEL = "black-forest-labs/FLUX.2-klein-9B";
const KLEIN_LORA = "Daniel8152/Klein-enhance";

const SLOT_DEFS: Array<{ key: EditSlotKey; label: string; hint: string; required?: boolean }> = [
  { key: "main", label: "Main image", hint: "Required", required: true },
  { key: "auxA", label: "Aux A", hint: "Optional" },
  { key: "auxB", label: "Aux B", hint: "Optional" }
];

function emptySlot(): EditSlotState {
  return {
    fileName: "",
    comfyName: "",
    dataUrl: "",
    previewUrl: "",
    uploadStatus: "idle",
    error: ""
  };
}

function initialSlots(): Record<EditSlotKey, EditSlotState> {
  return {
    main: emptySlot(),
    auxA: emptySlot(),
    auxB: emptySlot()
  };
}

function timestampLabel(timestamp?: number): string {
  if (!timestamp) return "";
  const value = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function imageUrl(record: GenerateRecord): string {
  return record.images?.[0] || "";
}

function recordPrompt(record: GenerateRecord): string {
  const node168 = record.params?.["168"];
  if (node168 && typeof node168 === "object" && "text" in node168) {
    return String((node168 as { text?: unknown }).text || record.prompt || "Klein edit");
  }
  return record.prompt || "Klein edit";
}

function recordModel(record: GenerateRecord): string {
  return record.model?.split("/").pop() || record.type || "klein";
}

function nodeImage(record: GenerateRecord, nodeId: string): string {
  const node = record.params?.[nodeId];
  if (!node || typeof node !== "object" || !("image" in node)) return "";
  return String((node as { image?: unknown }).image || "");
}

function inputViewUrl(value: string): string {
  if (!value) return "";
  if (value.startsWith("data:") || value.startsWith("/") || value.startsWith("http")) return value;
  return `/api/view?filename=${encodeURIComponent(value)}&type=input`;
}

function originalMainImage(record: GenerateRecord): string {
  return inputViewUrl(nodeImage(record, "278"));
}

function isKleinBroadcast(message: unknown): message is { type: string; data: GenerateRecord } {
  if (!message || typeof message !== "object") return false;
  const candidate = message as { type?: unknown; data?: unknown };
  if (candidate.type !== "new_image" || !candidate.data || typeof candidate.data !== "object") return false;
  const data = candidate.data as GenerateRecord;
  return data.type === "klein" && Array.isArray(data.images);
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(blob);
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

function canUseModelScope(apiConfig: ApiConfig | null): boolean {
  return Boolean(apiConfig?.has_ms_key);
}

function slotLabel(slot: EditSlotState): string {
  return slot.comfyName || slot.fileName || "No image";
}

export function EditWorkspace({
  clientId,
  apiConfig,
  providerStatus,
  queueStatus,
  taskMessage,
  onTaskChange,
  onOutputsChange,
  onContextChange,
  onInputChange
}: EditWorkspaceProps) {
  const fileRefs = useRef<Record<EditSlotKey, HTMLInputElement | null>>({
    main: null,
    auxA: null,
    auxB: null
  });
  const hoveredSlotRef = useRef<EditSlotKey | null>(null);
  const [engine, setEngine] = useState<EditEngine>(() => (
    localStorage.getItem("edit_engine_mode") === "cloud" ? "cloud" : "local"
  ));
  const [slots, setSlots] = useState<Record<EditSlotKey, EditSlotState>>(() => initialSlots());
  const [prompt, setPrompt] = useState("");
  const [seed, setSeed] = useState("0");
  const [randomSeed, setRandomSeed] = useState(true);
  const [loraEnabled, setLoraEnabled] = useState(false);
  const [loraStrength, setLoraStrength] = useState(0.8);
  const [records, setRecords] = useState<GenerateRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusText, setStatusText] = useState("Awaiting main image");
  const [errorText, setErrorText] = useState("");
  const [preview, setPreview] = useState<GenerateRecord | null>(null);

  const cloudAvailable = canUseModelScope(apiConfig);
  const uploadBusy = Object.values(slots).some((slot) => slot.uploadStatus === "uploading");
  const busy = isSubmitting || uploadBusy || Boolean(queueStatus?.position);
  const latestRecords = useMemo(() => records.slice(0, 12), [records]);

  const publishTask = useCallback((task: EditTaskSummary) => {
    onTaskChange(task);
  }, [onTaskChange]);

  const publishOutputs = useCallback((nextRecords: GenerateRecord[]) => {
    onOutputsChange(nextRecords.slice(0, 12));
  }, [onOutputsChange]);

  const updateSlot = useCallback((key: EditSlotKey, next: Partial<EditSlotState>) => {
    setSlots((current) => ({
      ...current,
      [key]: {
        ...current[key],
        ...next
      }
    }));
  }, []);

  const clearSlot = useCallback((key: EditSlotKey) => {
    updateSlot(key, emptySlot());
    const input = fileRefs.current[key];
    if (input) input.value = "";
  }, [updateSlot]);

  const loadHistory = useCallback((signal?: AbortSignal) => {
    setIsLoadingHistory(true);
    getKleinHistory(signal)
      .then((history) => {
        const next = history
          .filter((record) => record.images?.length)
          .reduce<GenerateRecord[]>((acc, record) => upsertGeneratedRecord(acc, record, { limit: 72, sortByTimestamp: true }), []);
        setRecords(next);
        publishOutputs(next);
        setStatusText(next.length ? `Loaded ${next.length} Edit outputs` : "No Edit history yet");
      })
      .catch(() => {
        if (!signal?.aborted) setErrorText("Edit history unavailable. Check the backend and try again.");
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
    localStorage.setItem("edit_engine_mode", engine);
  }, [engine]);

  useEffect(() => {
    if (!isKleinBroadcast(taskMessage)) return;
    setRecords((current) => {
      const next = upsertGeneratedRecord(current, taskMessage.data, { limit: 72, sortByTimestamp: true });
      publishOutputs(next);
      return next;
    });
    publishTask({
      status: "succeeded",
      label: "Edit finished",
      detail: `${taskMessage.data.images.length} image${taskMessage.data.images.length === 1 ? "" : "s"} available`,
      prompt: recordPrompt(taskMessage.data)
    });
    setStatusText("New Edit output received");
  }, [publishOutputs, publishTask, taskMessage]);

  useEffect(() => {
    const main = slots.main;
    onInputChange(main.previewUrl ? {
      url: main.previewUrl,
      name: main.fileName || main.comfyName || "Main image",
      comfyName: main.comfyName
    } : null);
    const cleanPrompt = prompt.trim();
    const summary = [
      cleanPrompt || "No prompt yet",
      main.previewUrl ? `Main: ${slotLabel(main)}` : "Main image missing",
      engine === "cloud" ? `Cloud · LoRA ${loraEnabled ? loraStrength.toFixed(2) : "off"}` : `Local · seed ${randomSeed ? "random" : seed || "0"}`
    ];
    onContextChange(summary.join(" · "));
  }, [engine, loraEnabled, loraStrength, onContextChange, onInputChange, prompt, randomSeed, seed, slots.main]);

  const handleFile = useCallback(async (key: EditSlotKey, file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      const message = "Unsupported file type. Choose a PNG or JPG image.";
      updateSlot(key, { error: message, uploadStatus: "failed" });
      setErrorText(message);
      publishTask({ status: "failed", label: "Edit upload blocked", detail: message, error: message });
      return;
    }

    setErrorText("");
    setStatusText(`Uploading ${file.name || "image"}`);
    updateSlot(key, {
      fileName: file.name || "image",
      comfyName: "",
      dataUrl: "",
      previewUrl: "",
      uploadStatus: "uploading",
      error: ""
    });
    publishTask({ status: "pending", label: "Edit upload running", detail: file.name || "image" });

    try {
      const dataUrl = await readBlobAsDataUrl(file);
      updateSlot(key, { dataUrl, previewUrl: dataUrl });
      const upload = await uploadImageFile(file, file.name || "image");
      const comfyName = upload.files?.[0]?.comfy_name;
      if (!comfyName) throw new Error("Upload returned no ComfyUI image name.");
      updateSlot(key, {
        comfyName,
        uploadStatus: "ready",
        error: ""
      });
      setStatusText(`${SLOT_DEFS.find((slot) => slot.key === key)?.label || "Slot"} ready`);
      publishTask({ status: "idle", label: "Edit ready", detail: "Input image uploaded" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed.";
      updateSlot(key, { uploadStatus: "failed", error: message });
      setErrorText(message);
      setStatusText("Upload failed");
      publishTask({ status: "failed", label: "Edit upload failed", detail: message, error: message });
    } finally {
      const input = fileRefs.current[key];
      if (input) input.value = "";
    }
  }, [publishTask, updateSlot]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const targetSlot = hoveredSlotRef.current;
      if (!targetSlot) return;
      const imageItem = Array.from(event.clipboardData?.items || [])
        .find((item) => item.kind === "file" && item.type.startsWith("image/"));
      const file = imageItem?.getAsFile();
      if (file) {
        event.preventDefault();
        void handleFile(targetSlot, file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleFile]);

  const onDrop = useCallback((key: EditSlotKey, event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    void handleFile(key, event.dataTransfer.files?.[0]);
  }, [handleFile]);

  const setSeedValue = useCallback((value: string) => {
    const numeric = Math.max(0, Math.round(Number(value) || 0));
    setSeed(String(numeric));
    setRandomSeed(false);
  }, []);

  const nextSeed = useCallback(() => {
    if (randomSeed) {
      const value = Math.floor(Math.random() * 1000000);
      setSeed(String(value));
      return value;
    }
    return Math.max(0, Math.round(Number(seed) || 0));
  }, [randomSeed, seed]);

  const dataUrlForSlot = useCallback(async (slot: EditSlotState): Promise<string> => {
    if (slot.dataUrl) return slot.dataUrl;
    if (!slot.previewUrl) return "";
    const response = await fetch(slot.previewUrl);
    if (!response.ok) throw new Error(`Could not load ${slot.fileName || slot.comfyName || "reference image"}.`);
    return readBlobAsDataUrl(await response.blob());
  }, []);

  const validate = useCallback((cleanPrompt: string): string => {
    if (!cleanPrompt) return "Prompt is required.";
    if (!slots.main.previewUrl) return "Main image is required.";
    if (uploadBusy) return "Image upload is still running.";
    if (engine === "local" && !slots.main.comfyName) return "Main image upload is required for Local ComfyUI.";
    if (engine === "cloud" && !cloudAvailable) return "ModelScope key missing. Add one in API / Models or use Local.";
    return "";
  }, [cloudAvailable, engine, slots.main.comfyName, slots.main.previewUrl, uploadBusy]);

  const submitEdit = useCallback(async () => {
    const cleanPrompt = prompt.trim();
    const validation = validate(cleanPrompt);
    if (validation) {
      setErrorText(validation);
      setStatusText("Edit blocked");
      publishTask({ status: "failed", label: "Edit blocked", detail: validation, prompt: cleanPrompt, error: validation });
      return;
    }

    setIsSubmitting(true);
    setErrorText("");
    setStatusText(engine === "local" ? "Submitting local Klein workflow" : "Submitting cloud Klein workflow");
    publishTask({
      status: "running",
      label: engine === "local" ? "Local Edit running" : "Cloud Edit running",
      detail: engine === "local" ? "Flux2-Klein.json" : KLEIN_MODEL,
      prompt: cleanPrompt,
      startedAt: Date.now()
    });

    try {
      let finalRecord: GenerateRecord;
      if (engine === "local") {
        const seedValue = nextSeed();
        const params = {
          "168": { text: cleanPrompt },
          "158": { noise_seed: seedValue },
          "278": { image: slots.main.comfyName },
          "270": { image: slots.auxA.comfyName || "" },
          "292": { image: slots.auxB.comfyName || "" },
          "313": { value: Boolean(slots.auxA.comfyName) },
          "314": { value: Boolean(slots.auxB.comfyName) }
        };
        const result = await generateWorkflowImage({
          prompt: cleanPrompt,
          workflow_json: "Flux2-Klein.json",
          type: "klein",
          params,
          client_id: clientId
        });
        if (!result.images?.length || result.status === "failed") {
          throw new Error(result.error || "Local Edit returned no image.");
        }
        finalRecord = {
          ...result,
          prompt: result.prompt || cleanPrompt,
          type: result.type || "klein",
          params: result.params || params
        };
      } else {
        const imageUrls = (await Promise.all([
          dataUrlForSlot(slots.main),
          dataUrlForSlot(slots.auxA),
          dataUrlForSlot(slots.auxB)
        ])).filter(Boolean);
        const cloudPayload: MsGeneratePayload = {
          prompt: cleanPrompt,
          model: KLEIN_MODEL,
          image_urls: imageUrls,
          client_id: clientId
        };
        if (loraEnabled) {
          cloudPayload.loras = { [KLEIN_LORA]: loraStrength };
        }
        const result = await generateMsImage(cloudPayload);
        if (!result.url) {
          throw new Error(typeof result.detail === "string" ? result.detail : "Cloud Edit returned no image.");
        }
        const params = {
          "168": { text: cleanPrompt },
          "278": { image: slots.main.comfyName || slots.main.dataUrl },
          "270": { image: slots.auxA.comfyName || "" },
          "292": { image: slots.auxB.comfyName || "" },
          "313": { value: Boolean(slots.auxA.comfyName || slots.auxA.dataUrl) },
          "314": { value: Boolean(slots.auxB.comfyName || slots.auxB.dataUrl) },
          model: KLEIN_MODEL,
          image_urls: imageUrls,
          loras: loraEnabled ? { [KLEIN_LORA]: loraStrength } : undefined
        };
        finalRecord = {
          timestamp: Date.now(),
          prompt: cleanPrompt,
          images: [result.url],
          type: "klein",
          model: KLEIN_MODEL,
          status: result.status || "succeeded",
          task_id: result.task_id,
          params
        };
      }

      setRecords((current) => {
        const next = upsertGeneratedRecord(current, finalRecord, { limit: 72, sortByTimestamp: true });
        publishOutputs(next);
        return next;
      });
      setPreview(finalRecord);
      setStatusText("Edit complete");
      publishTask({
        status: "succeeded",
        label: "Edit complete",
        detail: `${finalRecord.images.length} image${finalRecord.images.length === 1 ? "" : "s"} saved`,
        prompt: recordPrompt(finalRecord)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Edit failed.";
      setErrorText(message);
      setStatusText("Edit failed");
      publishTask({ status: "failed", label: "Edit failed", detail: message, prompt: cleanPrompt, error: message });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    clientId,
    dataUrlForSlot,
    engine,
    loraEnabled,
    loraStrength,
    nextSeed,
    prompt,
    publishOutputs,
    publishTask,
    slots,
    validate
  ]);

  const copyMetadata = useCallback((record: GenerateRecord) => {
    const text = [
      recordPrompt(record),
      `${record.type || "klein"} - ${recordModel(record)}`,
      imageUrl(record)
    ].filter(Boolean).join("\n");
    void copyToClipboard(text);
  }, []);

  const reuseRecord = useCallback((record: GenerateRecord) => {
    setPrompt(recordPrompt(record));
    const seedValue = record.params?.["158"];
    if (seedValue && typeof seedValue === "object" && "noise_seed" in seedValue) {
      setSeed(String((seedValue as { noise_seed?: unknown }).noise_seed || 0));
      setRandomSeed(false);
    }
    const nextSlots = initialSlots();
    const applyNode = (key: EditSlotKey, nodeId: string) => {
      const value = nodeImage(record, nodeId);
      if (!value) return;
      const isDataUrl = value.startsWith("data:");
      nextSlots[key] = {
        fileName: value.split("/").pop() || key,
        comfyName: isDataUrl || value.startsWith("http") ? "" : value,
        dataUrl: isDataUrl ? value : "",
        previewUrl: inputViewUrl(value),
        uploadStatus: "ready",
        error: ""
      };
    };
    applyNode("main", "278");
    applyNode("auxA", "270");
    applyNode("auxB", "292");
    setSlots(nextSlots);
    setPreview(null);
    setStatusText("History settings reused");
  }, []);

  const deleteRecord = useCallback(async (record: GenerateRecord) => {
    if (!window.confirm("Delete this edit?")) return;
    try {
      const result = await deleteHistoryItem(record.timestamp);
      if (!result.success) throw new Error(result.message || "Delete failed.");
      setRecords((current) => {
        const next = current.filter((item) => !isSameGeneratedResult(item, record) && item.timestamp !== record.timestamp);
        publishOutputs(next);
        return next;
      });
      if (preview && isSameGeneratedResult(preview, record)) setPreview(null);
      setStatusText("Edit history item deleted");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Delete failed.");
    }
  }, [preview, publishOutputs]);

  return (
    <div className="qc-generate-workspace qc-edit-workspace">
      <aside className="qc-generate-panel qc-edit-panel" aria-label="Edit settings">
        <div className="qc-generate-panel__head">
          <div>
            <h2>Edit / Klein</h2>
            <p>{providerStatus.configured ? providerStatus.detail : providerStatus.label}</p>
          </div>
        </div>

        <div className="qc-edit-slots" aria-label="Reference layers">
          {SLOT_DEFS.map((slotDef) => {
            const slot = slots[slotDef.key];
            return (
              <div
                className="qc-edit-slot-card"
                key={slotDef.key}
                onMouseEnter={() => {
                  hoveredSlotRef.current = slotDef.key;
                }}
                onMouseLeave={() => {
                  if (hoveredSlotRef.current === slotDef.key) hoveredSlotRef.current = null;
                }}
              >
                <input
                  accept="image/*"
                  className="qc-edit-file-input"
                  data-slot={slotDef.key}
                  ref={(node) => {
                    fileRefs.current[slotDef.key] = node;
                  }}
                  onChange={(event) => void handleFile(slotDef.key, event.target.files?.[0])}
                  type="file"
                />
                <button
                  className={`qc-edit-slot${slot.previewUrl ? " has-image" : ""}${slot.error ? " has-error" : ""}`}
                  onClick={() => fileRefs.current[slotDef.key]?.click()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => onDrop(slotDef.key, event)}
                  type="button"
                >
                  {slot.previewUrl ? (
                    <img src={slot.previewUrl} alt={slot.fileName || slotDef.label} />
                  ) : (
                    <>
                      <UploadCloud size={20} strokeWidth={1.8} aria-hidden="true" />
                      <strong>{slotDef.label}</strong>
                      <span>{slotDef.hint}</span>
                    </>
                  )}
                  {slot.previewUrl ? <span className="qc-edit-slot__label">{slotDef.label}</span> : null}
                </button>
                {slot.previewUrl ? (
                  <IconButton className="qc-edit-slot__clear" label={`Clear ${slotDef.label}`} onClick={() => clearSlot(slotDef.key)}>
                    <X size={13} strokeWidth={2} aria-hidden="true" />
                  </IconButton>
                ) : null}
                <span className={`qc-edit-slot__status is-${slot.uploadStatus}`}>
                  {slot.error || (slot.uploadStatus === "ready" ? "ready" : slot.uploadStatus)}
                </span>
              </div>
            );
          })}
        </div>
        <p className="qc-field-hint">PNG / JPG. Drag, click, or paste while hovering a slot.</p>

        <label className="qc-field qc-edit-prompt">
          <span>Prompt</span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe the edit..."
            rows={5}
          />
        </label>

        <fieldset className="qc-fieldset">
          <legend>Engine</legend>
          <div className="qc-segmented">
            <button className={engine === "local" ? "is-active" : ""} type="button" onClick={() => setEngine("local")}>
              Local ComfyUI
            </button>
            <button className={engine === "cloud" ? "is-active" : ""} type="button" onClick={() => setEngine("cloud")}>
              Cloud ModelScope
            </button>
          </div>
          {engine === "cloud" && !cloudAvailable ? (
            <p className="qc-field-hint is-warning">ModelScope key missing. Add one in API / Models or use Local.</p>
          ) : null}
        </fieldset>

        {engine === "local" ? (
          <div className="qc-edit-local-controls">
            <label className="qc-number-field qc-edit-seed">
              <span>Seed</span>
              <div>
                <button type="button" onClick={() => setSeedValue(String((Number(seed) || 0) - 1))} aria-label="Decrease seed">-</button>
                <input value={seed} onChange={(event) => setSeedValue(event.target.value)} inputMode="numeric" />
                <button type="button" onClick={() => setSeedValue(String((Number(seed) || 0) + 1))} aria-label="Increase seed">+</button>
              </div>
            </label>
            <label className="qc-check-row">
              <input checked={randomSeed} onChange={(event) => setRandomSeed(event.target.checked)} type="checkbox" />
              <span>Random seed</span>
            </label>
          </div>
        ) : (
          <div className="qc-edit-cloud-controls">
            <label className="qc-check-row">
              <input checked={loraEnabled} onChange={(event) => setLoraEnabled(event.target.checked)} type="checkbox" />
              <span>Use Klein enhance LoRA</span>
            </label>
            <label className="qc-range-field">
              <span>LoRA strength <strong>{loraStrength.toFixed(2)}</strong></span>
              <input
                max={1}
                min={0.1}
                onChange={(event) => setLoraStrength(Number(event.target.value))}
                step={0.01}
                type="range"
                value={loraStrength}
              />
            </label>
          </div>
        )}

        <div className="qc-generate-status" data-state={errorText ? "error" : busy ? "busy" : "idle"}>
          {errorText ? <AlertCircle size={16} strokeWidth={2} aria-hidden="true" /> : <Image size={16} strokeWidth={2} aria-hidden="true" />}
          <span>{errorText || statusText}</span>
        </div>

        <Button variant="primary" className="qc-generate-submit" disabled={isSubmitting || uploadBusy} onClick={submitEdit}>
          {isSubmitting ? "Editing..." : "Edit image"}
        </Button>
      </aside>

      <main className="qc-generate-results qc-edit-results" aria-label="Edit results">
        <div className="qc-results-head">
          <div>
            <h2>Results</h2>
            <p>{isLoadingHistory ? "Loading history..." : `${records.length} recent edit${records.length === 1 ? "" : "s"}`}</p>
          </div>
          <Button variant="ghost" icon={<RefreshCw size={15} strokeWidth={2} aria-hidden="true" />} onClick={() => loadHistory()}>
            Refresh
          </Button>
        </div>

        {isSubmitting ? (
          <div className="qc-render-card">
            <div className="qc-render-card__preview"><span /></div>
            <div>
              <strong>{engine === "local" ? "Local Edit running" : "Cloud Edit running"}</strong>
              <p>{engine === "local" ? "Flux2-Klein.json" : KLEIN_MODEL} · {slotLabel(slots.main)}</p>
            </div>
          </div>
        ) : null}

        {!isLoadingHistory && !records.length && !isSubmitting ? (
          <div className="qc-results-empty">
            <Image size={22} strokeWidth={1.8} aria-hidden="true" />
            <strong>No edits yet</strong>
            <span>Add a main image and prompt to create a Klein edit.</span>
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
                    <span>{recordModel(record)} · {timestampLabel(record.timestamp)}</span>
                  </div>
                  <div className="qc-result-card__actions">
                    <IconButton label="Copy edit metadata" onClick={() => copyMetadata(record)}>
                      <Copy size={15} strokeWidth={2} aria-hidden="true" />
                    </IconButton>
                    <IconButton label="Reuse prompt and slots" onClick={() => reuseRecord(record)}>
                      <RotateCcw size={15} strokeWidth={2} aria-hidden="true" />
                    </IconButton>
                    <a className="qc-icon-button" href={src} target="_blank" rel="noreferrer" aria-label="Open original" title="Open original">
                      <ExternalLink size={15} strokeWidth={2} aria-hidden="true" />
                    </a>
                    <a className="qc-icon-button" href={src} download aria-label="Download image" title="Download image">
                      <Download size={15} strokeWidth={2} aria-hidden="true" />
                    </a>
                    <IconButton label="Delete edit history item" onClick={() => void deleteRecord(record)}>
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
        <div className="qc-preview" role="dialog" aria-modal="true" aria-label="Edit image preview" onClick={() => setPreview(null)}>
          <div className="qc-preview__dialog qc-edit-preview" onClick={(event) => event.stopPropagation()}>
            <div className="qc-preview__bar">
              <div>
                <strong>{recordModel(preview)}</strong>
                <span>{recordPrompt(preview)}</span>
              </div>
              <IconButton label="Close preview" onClick={() => setPreview(null)}>
                <X size={17} strokeWidth={2} aria-hidden="true" />
              </IconButton>
            </div>
            <div className="qc-edit-compare">
              {originalMainImage(preview) ? (
                <figure>
                  <span>Before</span>
                  <img src={originalMainImage(preview)} alt="Before edit" />
                </figure>
              ) : null}
              <figure>
                <span>After</span>
                <img src={imageUrl(preview)} alt={recordPrompt(preview)} />
              </figure>
            </div>
            <div className="qc-edit-preview-actions">
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
