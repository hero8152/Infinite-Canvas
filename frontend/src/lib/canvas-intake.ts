import type { GalleryAsset, GenerateRecord } from "./api";

export const CANVAS_INTAKE_EVENT = "qcos:canvas-intake";
const CANVAS_INTAKE_STORAGE_KEY = "qcos_canvas_intake_items";

export interface CanvasIntakeItem {
  id?: string;
  url: string;
  title?: string;
  prompt?: string;
  source?: string;
  model?: string;
  type?: "image" | "output";
  width?: number;
  height?: number;
  created_at?: string | number;
}

interface StoredCanvasIntake {
  created_at: number;
  items: CanvasIntakeItem[];
}

function assetImage(asset: GalleryAsset): string {
  return asset.url || asset.thumb_url || asset.thumbnail || "";
}

function assetTitle(asset: GalleryAsset): string {
  return asset.title || asset.name || asset.filename || "Gallery asset";
}

function assetPrompt(asset: GalleryAsset): string {
  return asset.prompt || asset.phrase || "";
}

function sourceLabel(asset: GalleryAsset): string {
  return (asset.source_labels?.length ? asset.source_labels : [asset.source_label || asset.source || "Gallery"]).filter(Boolean).join(" + ");
}

function normalizeItems(items: CanvasIntakeItem[]): CanvasIntakeItem[] {
  return items
    .map((item): CanvasIntakeItem => {
      const type: CanvasIntakeItem["type"] = item.type === "output" ? "output" : "image";
      return {
        ...item,
        url: String(item.url || "").trim(),
        type
      };
    })
    .filter((item) => Boolean(item.url));
}

export function galleryAssetToCanvasIntakeItem(asset: GalleryAsset): CanvasIntakeItem | null {
  const url = assetImage(asset);
  if (!url) return null;
  return {
    id: asset.id,
    url,
    title: assetTitle(asset),
    prompt: assetPrompt(asset),
    source: sourceLabel(asset),
    model: asset.model,
    type: asset.artifact_type === "output" ? "output" : "image",
    width: asset.width,
    height: asset.height,
    created_at: asset.created_at
  };
}

export function generateRecordToCanvasIntakeItem(record: GenerateRecord, index = 0): CanvasIntakeItem | null {
  const url = record.images?.[0] || "";
  if (!url) return null;
  return {
    id: record.task_id || record.taskId || `${record.timestamp || Date.now()}-${index}`,
    url,
    title: record.prompt || `Generated output ${index + 1}`,
    prompt: record.prompt,
    source: record.type || "Generated output",
    model: record.model,
    type: "output",
    width: record.width,
    height: record.height,
    created_at: record.timestamp
  };
}

export function writeCanvasIntakeItems(items: CanvasIntakeItem[]): CanvasIntakeItem[] {
  const normalized = normalizeItems(items);
  if (!normalized.length) return [];
  const payload: StoredCanvasIntake = {
    created_at: Date.now(),
    items: normalized
  };
  localStorage.setItem(CANVAS_INTAKE_STORAGE_KEY, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent(CANVAS_INTAKE_EVENT, { detail: payload }));
  return normalized;
}

export function consumeCanvasIntakeItems(): CanvasIntakeItem[] {
  const raw = localStorage.getItem(CANVAS_INTAKE_STORAGE_KEY);
  if (!raw) return [];
  localStorage.removeItem(CANVAS_INTAKE_STORAGE_KEY);
  try {
    const parsed = JSON.parse(raw) as Partial<StoredCanvasIntake>;
    return normalizeItems(Array.isArray(parsed.items) ? parsed.items : []);
  } catch {
    return [];
  }
}
