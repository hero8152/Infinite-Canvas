import { getLocalValue, STORAGE_KEYS } from "./storage";

export interface ApiProvider {
  id: string;
  name: string;
  base_url?: string;
  protocol?: string;
  enabled?: boolean;
  primary?: boolean;
  has_key?: boolean;
  key_preview?: string;
  key_env?: string;
  image_generation_endpoint?: string;
  image_edit_endpoint?: string;
  image_models?: string[];
  chat_models?: string[];
  video_models?: string[];
  ms_loras?: Record<string, unknown>;
  ms_defaults_version?: string;
}

export interface ApiConfig {
  base_url: string;
  chat_model: string;
  image_model: string;
  chat_models: string[];
  ms_chat_models?: string[];
  image_models: string[];
  video_models: string[];
  has_api_key: boolean;
  has_ms_key: boolean;
  api_providers?: ApiProvider[];
  primary_provider_id?: string;
}

export interface QueueStatus {
  total: number;
  position: number;
  status: string;
}

export interface ProvidersResponse {
  providers: ApiProvider[];
  primary_provider_id?: string;
}

export type ApiProviderSavePayload = ApiProvider & {
  api_key?: string;
  clear_key?: boolean;
};

export interface ProviderConnectionPayload {
  id: string;
  provider_id?: string;
  name: string;
  base_url: string;
  protocol: string;
  image_generation_endpoint?: string;
  image_edit_endpoint?: string;
  api_key?: string;
}

export interface ProviderModelsResponse {
  ok?: boolean;
  models?: string[];
  image_models?: string[];
  chat_models?: string[];
  video_models?: string[];
  raw_count?: number;
}

export interface ProviderProbeResponse {
  ok: boolean;
  status_code?: number;
  protocol?: string;
  detail?: string;
}

export interface ComfyInstancesResponse {
  instances: string[];
  primary?: string;
}

export interface ComfyWorkflowSummary {
  name: string;
  title?: string;
  builtin?: boolean;
  field_count?: number;
}

export interface ComfyWorkflowsResponse {
  workflows: ComfyWorkflowSummary[];
}

export interface ComfyWorkflowField {
  id: string;
  node?: string;
  input?: string;
  name?: string;
  type?: string;
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

export interface ComfyWorkflowConfig extends Record<string, unknown> {
  title?: string;
  fields?: ComfyWorkflowField[];
  mini_cards?: Record<string, unknown>;
}

export type ComfyWorkflowNode = Record<string, unknown> & {
  class_type?: string;
  inputs?: Record<string, unknown>;
};

export interface ComfyWorkflowDetail {
  name: string;
  workflow: Record<string, ComfyWorkflowNode>;
  config?: ComfyWorkflowConfig;
  builtin?: boolean;
}

export interface ComfyWorkflowUploadPayload {
  name: string;
  workflow: Record<string, unknown>;
}

export interface ComfyWorkflowUploadResponse {
  name: string;
}

export interface ComfyWorkflowConfigResponse {
  config: ComfyWorkflowConfig;
}

export interface ComfyWorkflowRunPayload {
  prompt: string;
  width: number;
  height: number;
  type: string;
  fields: Record<string, unknown>;
  config: ComfyWorkflowConfig;
  client_id: string;
}

export interface ComfyWorkflowRunResponse extends Record<string, unknown> {
  images?: string[];
  error?: string;
  task_id?: string | number;
  status?: string;
}

export interface GalleryAsset {
  id?: string;
  url?: string;
  thumb_url?: string;
  thumbnail?: string;
  name?: string;
  title?: string;
  filename?: string;
  prompt?: string;
  phrase?: string;
  source?: string;
  sources?: string[];
  source_label?: string;
  source_labels?: string[];
  artifact_type?: string;
  artifact_label?: string;
  model?: string;
  status?: string;
  favorite?: boolean;
  hidden?: boolean;
  width?: number;
  height?: number;
  size_bytes?: number;
  batch_id?: string;
  batch_title?: string;
  task_id?: string;
  item_id?: string;
  canvas_id?: string;
  canvas_title?: string;
  conversation_id?: string;
  conversation_title?: string;
  source_images?: AIReference[];
  contexts?: Array<Record<string, string | number | boolean | null | undefined>>;
  created_at?: string | number;
  updated_at?: string | number;
}

export interface GalleryFacetOption {
  value: string;
  label: string;
  count?: number;
}

export interface GalleryFacets {
  sources?: GalleryFacetOption[];
  artifact_types?: GalleryFacetOption[];
  statuses?: GalleryFacetOption[];
  models?: GalleryFacetOption[];
  favorites?: number;
}

export interface GalleryResponse {
  assets: GalleryAsset[];
  total: number;
  page?: number;
  page_size?: number;
  pages?: number;
  facets?: GalleryFacets;
}

export interface GalleryQuery {
  q?: string;
  source?: string;
  artifact_type?: string;
  status?: string;
  favorite?: boolean | null;
  model?: string;
  date?: string;
  page?: number;
  page_size?: number;
}

export interface GalleryFavoriteResponse {
  ok: boolean;
  asset: GalleryAsset;
}

export interface GenerateRecord {
  timestamp: number;
  prompt: string;
  images: string[];
  type?: string;
  width?: number;
  height?: number;
  seed?: number | string;
  status?: string;
  error?: string;
  params?: Record<string, unknown>;
  model?: string;
  provider_id?: string;
  task_id?: string;
  taskId?: string;
  raw_usage?: unknown;
}

export type CanvasNode = Record<string, unknown> & {
  id?: string;
  type?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  url?: string;
  name?: string;
  text?: string;
  images?: Array<string | Record<string, unknown>>;
  items?: string[];
};

export type CanvasConnection = Record<string, unknown> & {
  id?: string;
  from?: string;
  to?: string;
};

export interface CanvasViewport {
  x?: number;
  y?: number;
  scale?: number;
  [key: string]: unknown;
}

export interface CanvasSummary {
  id: string;
  title?: string;
  icon?: string;
  kind?: string;
  created_at?: number;
  updated_at?: number;
  deleted_at?: number;
  node_count?: number;
}

export interface CanvasDocument extends Record<string, unknown> {
  id: string;
  title?: string;
  icon?: string;
  kind?: string;
  created_at?: number;
  updated_at?: number;
  deleted_at?: number;
  nodes?: CanvasNode[];
  connections?: CanvasConnection[];
  viewport?: CanvasViewport;
  logs?: Array<Record<string, unknown>>;
  settings?: Record<string, unknown>;
}

export interface CanvasListResponse {
  canvases: CanvasSummary[];
}

export interface CanvasTrashResponse {
  canvases: CanvasSummary[];
  retention_days?: number;
}

export interface CanvasResponse {
  canvas: CanvasDocument;
}

export interface CanvasAssetCheckResponse {
  exists: Record<string, boolean>;
}

export interface CanvasAssetDownloadPayload {
  urls: string[];
  filename?: string;
}

export interface CanvasCreatePayload {
  title: string;
  icon?: string;
  kind?: string;
}

export interface CanvasSavePayload {
  title: string;
  icon: string;
  nodes: CanvasNode[];
  connections: CanvasConnection[];
  viewport: CanvasViewport;
  logs: Array<Record<string, unknown>>;
  settings: Record<string, unknown>;
  client_id: string;
  base_updated_at: number;
}

export interface LocalGeneratePayload {
  prompt: string;
  width: number;
  height: number;
  type: "zimage";
  client_id: string;
  convert_to_jpg?: boolean;
}

export interface CloudGeneratePayload {
  prompt: string;
  api_key?: string;
  resolution: string;
  type?: "zimage";
  client_id?: string;
}

export interface CloudGenerateResponse {
  url?: string;
  task_id?: string;
  status?: string;
  detail?: unknown;
}

export interface UploadFileRecord {
  comfy_name: string;
  name?: string;
}

export interface UploadResponse {
  files: UploadFileRecord[];
}

export interface WorkflowGeneratePayload {
  workflow_json: string;
  params: Record<string, unknown>;
  type: "enhance" | "klein" | "angle";
  client_id: string;
  prompt?: string;
}

export interface CanvasWorkflowGeneratePayload {
  prompt?: string;
  width?: number;
  height?: number;
  workflow_json: string;
  params?: Record<string, unknown>;
  type: "zimage" | "enhance" | "klein" | "custom-workflow" | string;
  client_id: string;
  convert_to_jpg?: boolean;
}

export interface CanvasLLMMessage {
  role: string;
  content: string;
}

export interface CanvasLLMPayload {
  message: string;
  system_prompt?: string;
  model?: string;
  messages?: CanvasLLMMessage[];
  images?: string[];
  provider?: string;
  ms_model?: string;
  ms_api_key?: string;
  ms_base_url?: string;
}

export interface CanvasLLMResponse {
  text: string;
  model?: string;
  raw_usage?: unknown;
}

export interface CanvasVideoPayload {
  prompt: string;
  provider_id?: string;
  model?: string;
  duration?: number;
  aspect_ratio?: string;
  resolution?: string;
  size?: string;
  images?: AIReference[];
  videos?: string[];
  enhance_prompt?: boolean;
  enable_upsample?: boolean;
  watermark?: boolean;
  seed?: number;
  camera_fixed?: boolean;
  camerafixed?: boolean;
  return_last_frame?: boolean;
  generate_audio?: boolean;
}

export interface CanvasVideoResponse {
  videos: string[];
  task_id?: string;
  raw?: unknown;
}

export interface AngleCloudGeneratePayload {
  prompt: string;
  api_key?: string;
  base_url?: string;
  type: "angle";
  model?: string;
  image_urls: string[];
  client_id?: string;
}

export interface AngleCloudPollPayload {
  task_id: string;
  api_key?: string;
  base_url?: string;
  client_id?: string;
}

export interface AngleCloudResponse {
  url?: string;
  task_id?: string;
  status?: string;
  message?: string;
  detail?: unknown;
}

export interface MsGeneratePayload {
  prompt: string;
  model: string;
  api_key?: string;
  base_url?: string;
  image_urls: string[];
  width?: number;
  height?: number;
  loras?: unknown;
  client_id?: string;
}

export interface MsGenerateResponse {
  url?: string;
  task_id?: string;
  status?: string;
  detail?: unknown;
}

export interface AIReference {
  url: string;
  name?: string;
  role?: string;
  id?: string;
}

export interface AIUploadResponse {
  files: AIReference[];
}

export interface OnlineImagePayload {
  prompt: string;
  provider_id: string;
  model: string;
  size: string;
  quality?: string;
  reference_images: AIReference[];
}

export interface CanvasImageTaskCreateResponse {
  task_id: string;
  status: string;
}

export interface CanvasImageTaskStatus {
  id?: string;
  task_id?: string;
  type?: string;
  status: string;
  result?: GenerateRecord | null;
  error?: string;
  status_code?: number;
  created_at?: number;
  updated_at?: number;
}

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id?: string;
  role: ChatRole | string;
  content?: string;
  type?: string;
  image_url?: string;
  created_at?: number;
  attachments?: AIReference[];
  model?: string;
  mode?: string;
  raw_usage?: unknown;
  status?: string;
}

export interface ChatConversationSummary {
  id: string;
  title?: string;
  last_message?: string;
  created_at?: number;
  updated_at?: number;
}

export interface ChatConversation {
  id: string;
  title?: string;
  messages?: ChatMessage[];
  created_at?: number;
  updated_at?: number;
}

export interface ChatConversationsResponse {
  user_id?: string;
  conversations: ChatConversationSummary[];
}

export interface ChatConversationResponse {
  conversation: ChatConversation;
  message?: ChatMessage;
}

export interface ChatCreatePayload {
  title: string;
}

export interface ChatPayload {
  conversation_id?: string;
  message: string;
  model?: string;
  image_model?: string;
  mode?: "chat" | "image";
  size?: string;
  quality?: string;
  reference_images?: AIReference[];
  provider?: string;
  ms_model?: string;
  ms_api_key?: string;
  ms_base_url?: string;
}

export type ChatStreamEvent =
  | { type: "meta"; conversation: ChatConversation }
  | { type: "delta"; delta: string }
  | { type: "done"; conversation: ChatConversation; message: ChatMessage }
  | { type: "error"; detail?: string };

function headersWithLocalProvider(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers || {});
  const comflyToken = getLocalValue(STORAGE_KEYS.comflyToken);
  const comflyBaseUrl = getLocalValue(STORAGE_KEYS.comflyBaseUrl);
  if (comflyToken && !headers.has("X-Comfly-API-Key")) {
    headers.set("X-Comfly-API-Key", comflyToken);
  }
  if (comflyBaseUrl && !headers.has("X-Comfly-Base-URL")) {
    headers.set("X-Comfly-Base-URL", comflyBaseUrl);
  }
  return headers;
}

async function errorDetail(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const value = body?.detail ?? body?.error ?? body?.message;
    return typeof value === "string" ? value : value ? JSON.stringify(value) : "";
  } catch {
    try {
      return await response.text();
    } catch {
      return "";
    }
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: headersWithLocalProvider(init)
  });
  if (!response.ok) {
    const detail = await errorDetail(response);
    throw new Error(`${path} failed with ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  return response.json() as Promise<T>;
}

function userJsonHeaders(userId: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-User-ID": userId
  };
}

export function getApiConfig(signal?: AbortSignal): Promise<ApiConfig> {
  return apiFetch<ApiConfig>("/api/config", { signal });
}

export function getProviders(signal?: AbortSignal): Promise<ProvidersResponse> {
  return apiFetch<ProvidersResponse>("/api/providers", { signal });
}

export function saveProviders(payload: ApiProviderSavePayload[], signal?: AbortSignal): Promise<ProvidersResponse> {
  return apiFetch<ProvidersResponse>("/api/providers", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });
}

export function testProviderConnection(payload: ProviderConnectionPayload, signal?: AbortSignal): Promise<ProviderModelsResponse> {
  return apiFetch<ProviderModelsResponse>("/api/providers/test-connection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });
}

export function fetchProviderModels(payload: ProviderConnectionPayload, signal?: AbortSignal): Promise<ProviderModelsResponse> {
  return apiFetch<ProviderModelsResponse>("/api/providers/fetch-models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });
}

export function probeProviderAsync(payload: ProviderConnectionPayload, signal?: AbortSignal): Promise<ProviderProbeResponse> {
  return apiFetch<ProviderProbeResponse>("/api/providers/probe-async", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });
}

export function encodeWorkflowName(name: string): string {
  return String(name || "")
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function getComfyInstances(signal?: AbortSignal): Promise<ComfyInstancesResponse> {
  return apiFetch<ComfyInstancesResponse>("/api/comfyui/instances", { signal });
}

export function saveComfyInstances(instances: string[], signal?: AbortSignal): Promise<ComfyInstancesResponse> {
  return apiFetch<ComfyInstancesResponse>("/api/comfyui/instances", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instances }),
    signal
  });
}

export function getComfyWorkflows(signal?: AbortSignal): Promise<ComfyWorkflowsResponse> {
  return apiFetch<ComfyWorkflowsResponse>("/api/workflows", { signal });
}

export function getComfyWorkflow(name: string, signal?: AbortSignal): Promise<ComfyWorkflowDetail> {
  return apiFetch<ComfyWorkflowDetail>(`/api/workflows/${encodeWorkflowName(name)}`, { signal });
}

export function uploadComfyWorkflow(payload: ComfyWorkflowUploadPayload, signal?: AbortSignal): Promise<ComfyWorkflowUploadResponse> {
  return apiFetch<ComfyWorkflowUploadResponse>("/api/workflows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });
}

export function saveComfyWorkflowConfig(name: string, config: ComfyWorkflowConfig, signal?: AbortSignal): Promise<ComfyWorkflowConfigResponse> {
  return apiFetch<ComfyWorkflowConfigResponse>(`/api/workflows/${encodeWorkflowName(name)}/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
    signal
  });
}

export function deleteComfyWorkflow(name: string, signal?: AbortSignal): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/workflows/${encodeWorkflowName(name)}`, {
    method: "DELETE",
    signal
  });
}

export function runComfyWorkflow(name: string, payload: ComfyWorkflowRunPayload, signal?: AbortSignal): Promise<ComfyWorkflowRunResponse> {
  return apiFetch<ComfyWorkflowRunResponse>(`/api/workflows/${encodeWorkflowName(name)}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });
}

export function getQueueStatus(clientId: string, signal?: AbortSignal): Promise<QueueStatus> {
  return apiFetch<QueueStatus>(`/api/queue_status?client_id=${encodeURIComponent(clientId)}`, { signal });
}

export function getRecentAssets(signal?: AbortSignal): Promise<GalleryResponse> {
  return apiFetch<GalleryResponse>("/api/gallery/assets?page=1&page_size=6", { signal });
}

export function getCanvasList(signal?: AbortSignal): Promise<CanvasListResponse> {
  return apiFetch<CanvasListResponse>("/api/canvases", { signal });
}

export function getCanvasTrash(signal?: AbortSignal): Promise<CanvasTrashResponse> {
  return apiFetch<CanvasTrashResponse>("/api/canvases/trash", { signal });
}

export function createCanvasDocument(payload: CanvasCreatePayload, signal?: AbortSignal): Promise<CanvasResponse> {
  return apiFetch<CanvasResponse>("/api/canvases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });
}

export function getCanvasDocument(canvasId: string, signal?: AbortSignal): Promise<CanvasResponse> {
  return apiFetch<CanvasResponse>(`/api/canvases/${encodeURIComponent(canvasId)}`, { signal });
}

export function saveCanvasDocument(canvasId: string, payload: CanvasSavePayload, signal?: AbortSignal): Promise<CanvasResponse> {
  return apiFetch<CanvasResponse>(`/api/canvases/${encodeURIComponent(canvasId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });
}

export function deleteCanvasDocument(canvasId: string, signal?: AbortSignal): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/canvases/${encodeURIComponent(canvasId)}`, {
    method: "DELETE",
    signal
  });
}

export function restoreCanvasDocument(canvasId: string, signal?: AbortSignal): Promise<CanvasResponse> {
  return apiFetch<CanvasResponse>(`/api/canvases/${encodeURIComponent(canvasId)}/restore`, {
    method: "POST",
    signal
  });
}

export function purgeCanvasDocument(canvasId: string, signal?: AbortSignal): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/canvases/${encodeURIComponent(canvasId)}/purge`, {
    method: "DELETE",
    signal
  });
}

export function checkCanvasAssets(urls: string[], signal?: AbortSignal): Promise<CanvasAssetCheckResponse> {
  return apiFetch<CanvasAssetCheckResponse>("/api/canvas-assets/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls }),
    signal
  });
}

export async function downloadCanvasAssets(payload: CanvasAssetDownloadPayload, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch("/api/canvas-assets/download", {
    method: "POST",
    headers: headersWithLocalProvider({ headers: { "Content-Type": "application/json" } }),
    body: JSON.stringify(payload),
    signal
  });
  if (!response.ok) {
    const detail = await errorDetail(response);
    throw new Error(`/api/canvas-assets/download failed with ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  return response.blob();
}

export function canvasOutputDownloadUrl(url: string, name: string): string {
  return `/api/download-output?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name || "canvas-output")}`;
}

export function getGalleryAssets(query: GalleryQuery = {}, signal?: AbortSignal): Promise<GalleryResponse> {
  const params = new URLSearchParams({
    q: query.q || "",
    source: query.source || "all",
    artifact_type: query.artifact_type || "all",
    status: query.status || "all",
    model: query.model || "all",
    date: query.date || "all",
    page: String(query.page || 1),
    page_size: String(query.page_size || 36)
  });
  if (query.favorite !== undefined && query.favorite !== null) {
    params.set("favorite", query.favorite ? "true" : "false");
  }
  return apiFetch<GalleryResponse>(`/api/gallery/assets?${params.toString()}`, { signal });
}

export function updateGalleryFavorite(assetId: string, favorite: boolean, signal?: AbortSignal): Promise<GalleryFavoriteResponse> {
  return apiFetch<GalleryFavoriteResponse>(`/api/gallery/assets/${encodeURIComponent(assetId)}/favorite`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ favorite }),
    signal
  });
}

export function hideGalleryAsset(assetId: string, signal?: AbortSignal): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/gallery/assets/${encodeURIComponent(assetId)}`, {
    method: "DELETE",
    signal
  });
}

export function galleryDownloadUrl(asset: GalleryAsset): string {
  const url = asset.url || "";
  if (url.startsWith("/output/")) {
    return `/api/download-output?url=${encodeURIComponent(url)}&name=${encodeURIComponent(asset.filename || asset.name || "asset.png")}`;
  }
  return url || "#";
}

export async function downloadGalleryAssets(assetIds: string[], signal?: AbortSignal): Promise<Blob> {
  const response = await fetch("/api/gallery/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ asset_ids: assetIds }),
    signal
  });
  if (!response.ok) {
    const detail = await errorDetail(response);
    throw new Error(`/api/gallery/download failed with ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  return response.blob();
}

export function getZImageHistory(signal?: AbortSignal): Promise<GenerateRecord[]> {
  return apiFetch<GenerateRecord[]>("/api/history?type=zimage", { signal });
}

export function getEnhanceHistory(signal?: AbortSignal): Promise<GenerateRecord[]> {
  return apiFetch<GenerateRecord[]>("/api/history?type=enhance", { signal });
}

export function getKleinHistory(signal?: AbortSignal): Promise<GenerateRecord[]> {
  return apiFetch<GenerateRecord[]>("/api/history?type=klein", { signal });
}

export function getOnlineHistory(signal?: AbortSignal): Promise<GenerateRecord[]> {
  return apiFetch<GenerateRecord[]>("/api/history?type=online", { signal });
}

export function getAngleHistory(signal?: AbortSignal): Promise<GenerateRecord[]> {
  return apiFetch<GenerateRecord[]>("/api/history?type=angle", { signal });
}

export function generateLocalImage(payload: LocalGeneratePayload, signal?: AbortSignal): Promise<GenerateRecord> {
  return apiFetch<GenerateRecord>("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });
}

export function generateCloudImage(payload: CloudGeneratePayload, signal?: AbortSignal): Promise<CloudGenerateResponse> {
  return apiFetch<CloudGenerateResponse>("/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });
}

export function uploadImageFile(file: Blob, filename: string, signal?: AbortSignal): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("files", file, filename);
  return apiFetch<UploadResponse>("/api/upload", {
    method: "POST",
    body: formData,
    signal
  });
}

export async function uploadCanvasUrlToComfy(url: string, fallbackFilename = "canvas-input.png", signal?: AbortSignal): Promise<UploadFileRecord> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Canvas input image fetch failed with ${response.status}`);
  }
  const blob = await response.blob();
  const pathName = String(url || "").split(/[?#]/, 1)[0].split("/").filter(Boolean).pop();
  const filename = pathName ? decodeURIComponent(pathName) : fallbackFilename;
  const uploaded = await uploadImageFile(blob, filename || fallbackFilename, signal);
  const file = uploaded.files?.[0];
  if (!file?.comfy_name) {
    throw new Error("ComfyUI upload did not return a usable input filename.");
  }
  return file;
}

export function uploadAiReferenceImage(file: Blob, filename: string, signal?: AbortSignal): Promise<AIUploadResponse> {
  const formData = new FormData();
  formData.append("files", file, filename);
  return apiFetch<AIUploadResponse>("/api/ai/upload", {
    method: "POST",
    body: formData,
    signal
  });
}

export function generateWorkflowImage(payload: WorkflowGeneratePayload, signal?: AbortSignal): Promise<GenerateRecord> {
  return apiFetch<GenerateRecord>("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });
}

export function generateCanvasWorkflow(payload: CanvasWorkflowGeneratePayload, signal?: AbortSignal): Promise<GenerateRecord> {
  return apiFetch<GenerateRecord>("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });
}

export function runCanvasLLM(payload: CanvasLLMPayload, signal?: AbortSignal): Promise<CanvasLLMResponse> {
  return apiFetch<CanvasLLMResponse>("/api/canvas-llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });
}

export function runCanvasVideo(payload: CanvasVideoPayload, signal?: AbortSignal): Promise<CanvasVideoResponse> {
  return apiFetch<CanvasVideoResponse>("/api/canvas-video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });
}

export function generateAngleCloud(payload: AngleCloudGeneratePayload, signal?: AbortSignal): Promise<AngleCloudResponse> {
  return apiFetch<AngleCloudResponse>("/api/angle/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });
}

export function pollAngleCloud(payload: AngleCloudPollPayload, signal?: AbortSignal): Promise<AngleCloudResponse> {
  return apiFetch<AngleCloudResponse>("/api/angle/poll_status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });
}

export function generateMsImage(payload: MsGeneratePayload, signal?: AbortSignal): Promise<MsGenerateResponse> {
  return apiFetch<MsGenerateResponse>("/api/ms/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });
}

export function generateOnlineImage(payload: OnlineImagePayload, signal?: AbortSignal): Promise<GenerateRecord> {
  return apiFetch<GenerateRecord>("/api/online-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });
}

export function createCanvasImageTask(payload: OnlineImagePayload, signal?: AbortSignal): Promise<CanvasImageTaskCreateResponse> {
  return apiFetch<CanvasImageTaskCreateResponse>("/api/canvas-image-tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });
}

export function getCanvasImageTask(taskId: string, signal?: AbortSignal): Promise<CanvasImageTaskStatus> {
  return apiFetch<CanvasImageTaskStatus>(`/api/canvas-image-tasks/${encodeURIComponent(taskId)}`, { signal });
}

export function getConversations(userId: string, signal?: AbortSignal): Promise<ChatConversationsResponse> {
  return apiFetch<ChatConversationsResponse>("/api/conversations", {
    headers: { "X-User-ID": userId },
    signal
  });
}

export function createConversation(payload: ChatCreatePayload, userId: string, signal?: AbortSignal): Promise<ChatConversationResponse> {
  return apiFetch<ChatConversationResponse>("/api/conversations", {
    method: "POST",
    headers: userJsonHeaders(userId),
    body: JSON.stringify(payload),
    signal
  });
}

export function getConversation(conversationId: string, userId: string, signal?: AbortSignal): Promise<ChatConversationResponse> {
  return apiFetch<ChatConversationResponse>(`/api/conversations/${encodeURIComponent(conversationId)}`, {
    headers: { "X-User-ID": userId },
    signal
  });
}

export function deleteConversation(conversationId: string, userId: string, signal?: AbortSignal): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/conversations/${encodeURIComponent(conversationId)}`, {
    method: "DELETE",
    headers: { "X-User-ID": userId },
    signal
  });
}

export function sendChatMessage(payload: ChatPayload, userId: string, signal?: AbortSignal): Promise<ChatConversationResponse> {
  return apiFetch<ChatConversationResponse>("/api/chat", {
    method: "POST",
    headers: userJsonHeaders(userId),
    body: JSON.stringify(payload),
    signal
  });
}

export async function streamChatMessage(
  payload: ChatPayload,
  userId: string,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const headers = headersWithLocalProvider({
    headers: userJsonHeaders(userId)
  });
  const response = await fetch("/api/chat/stream", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal
  });

  if (!response.ok) {
    const detail = await errorDetail(response);
    throw new Error(`/api/chat/stream failed with ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  if (!response.body) {
    throw new Error("Chat stream response did not include a body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    for (const eventText of events) {
      const line = eventText.split("\n").find((item) => item.startsWith("data:"));
      if (!line) continue;
      const event = JSON.parse(line.slice(5).trim()) as ChatStreamEvent;
      if (event.type === "error") {
        throw new Error(event.detail || "Chat stream failed.");
      }
      onEvent(event);
    }
  }
}

export function deleteHistoryItem(timestamp: number | string, signal?: AbortSignal): Promise<{ success: boolean; message?: string }> {
  return apiFetch<{ success: boolean; message?: string }>("/api/history/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timestamp }),
    signal
  });
}
