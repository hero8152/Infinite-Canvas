import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import {
  ArchiveRestore,
  AlertCircle,
  BoxSelect,
  CheckCircle2,
  Download,
  FilePlus2,
  Grid2X2,
  Image,
  Images,
  Link2,
  Link2Off,
  Loader2,
  Maximize2,
  MessageSquare,
  Minus,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash,
  Trash2,
  Type,
  Upload,
  Video,
  Workflow,
  X
} from "lucide-react";
import { Button } from "../../components/controls/Button";
import { IconButton } from "../../components/controls/IconButton";
import type { AIReference, ApiConfig, ApiProvider, CanvasConnection, CanvasDocument, CanvasImageTaskStatus, CanvasLLMMessage, CanvasNode, CanvasSummary, CanvasVideoResponse, CanvasViewport, ComfyWorkflowDetail, ComfyWorkflowField, ComfyWorkflowSummary, GenerateRecord } from "../../lib/api";
import {
  canvasOutputDownloadUrl,
  checkCanvasAssets,
  createCanvasImageTask,
  createCanvasDocument,
  deleteCanvasDocument,
  downloadCanvasAssets as downloadCanvasAssetZip,
  generateAngleCloud,
  generateCloudImage,
  generateCanvasWorkflow,
  generateMsImage,
  getCanvasImageTask,
  getCanvasDocument,
  getCanvasList,
  getCanvasTrash,
  getComfyWorkflow,
  getComfyWorkflows,
  purgeCanvasDocument,
  restoreCanvasDocument,
  runCanvasLLM,
  runCanvasVideo,
  saveCanvasDocument,
  uploadCanvasUrlToComfy,
  uploadAiReferenceImage
} from "../../lib/api";
import type { CanvasIntakeItem } from "../../lib/canvas-intake";
import { CANVAS_INTAKE_EVENT, consumeCanvasIntakeItems } from "../../lib/canvas-intake";
import type { CreationTaskSummary } from "../../lib/creation-state";
import type { ProviderStatus } from "../../lib/provider-status";
import { getLocalValue, STORAGE_KEYS } from "../../lib/storage";
import "../generate/generate.css";
import "./canvas.css";

export type CanvasTaskSummary = CreationTaskSummary;

export interface CanvasRailContext {
  canvasId?: string;
  canvasTitle?: string;
  selectedNodeId?: string;
  selectedNodeTitle?: string;
  selectedNodeType?: string;
  saveState: string;
  nodeCount: number;
  connectionCount: number;
  linkState?: string;
  selectedConnectionId?: string;
  selectedConnectionLabel?: string;
  pendingConnectionState?: string;
  lastConnectionAction?: string;
  connectionWarning?: string;
  intakeState?: string;
  executionStatus?: string;
  executionTaskId?: string;
  executionProvider?: string;
  executionModel?: string;
  executionOutputCount?: number;
  executionLastUrl?: string;
  executionError?: string;
  selectedExecutionNodeKind?: string;
  graphPromptCount?: number;
  graphImageRefCount?: number;
  graphVideoRefCount?: number;
  graphTextRefCount?: number;
  graphInputWarnings?: string;
  executionDataReady?: boolean;
  selectedCanvasExecutionMode?: string;
  selectedCanvasWorkflow?: string;
  selectedCanvasRunStatus?: string;
  selectedCanvasRunError?: string;
  selectedCanvasOutputCount?: number;
  selectedCanvasLastOutput?: string;
  selectedLLMMode?: string;
  selectedLLMRunStatus?: string;
  selectedLLMRunError?: string;
  selectedLLMModel?: string;
  selectedLLMInputCount?: number;
  selectedLLMOutputPreview?: string;
  selectedVideoMode?: string;
  selectedVideoRunStatus?: string;
  selectedVideoRunError?: string;
  selectedVideoModel?: string;
  selectedVideoInputCount?: number;
  selectedVideoOutputPreview?: string;
  assetCount: number;
  downloadableAssetCount: number;
  selectedAssetUrl?: string;
  selectedAssetName?: string;
  assetActionStatus: string;
  lastAssetActionStatus?: string;
  detail: string;
}

interface CanvasWorkspaceProps {
  clientId: string;
  apiConfig: ApiConfig | null;
  providerStatus: ProviderStatus;
  taskMessage: unknown;
  onTaskChange: (task: CanvasTaskSummary) => void;
  onContextChange: (context: CanvasRailContext) => void;
}

type SaveState = "idle" | "dirty" | "saving" | "saved" | "failed" | "conflict";
type ExecutionStatus = "idle" | "pending" | "running" | "succeeded" | "failed";
type CanvasAssetActionStatus = "idle" | "pending" | "succeeded" | "failed" | "empty" | "partial";
type CanvasImageEditMode = "crop" | "mask" | "grid";
type NativeCanvasViewport = CanvasViewport & Required<Pick<CanvasViewport, "x" | "y" | "scale">>;
type CanvasNodeKind = "prompt" | "image" | "output" | "group" | "promptGroup" | "llm" | "video" | "workflow" | "generator" | "msgen" | "loop";
type CanvasExecutionNodeKind = "prompt" | "text" | "image" | "output" | "group" | "llm" | "video" | "workflow" | "unknown";
type CanvasNodeSemanticKind = CanvasExecutionNodeKind;
type BoardDropOffset = number | { x: number; y: number };
type DragState =
  | { kind: "pan"; sx: number; sy: number; viewport: NativeCanvasViewport }
  | { kind: "node"; id: string; sx: number; sy: number; x: number; y: number }
  | { kind: "link"; fromId: string };

interface CanvasMaskPoint {
  x: number;
  y: number;
}

interface CanvasMaskStroke {
  size: number;
  points: CanvasMaskPoint[];
}

interface CanvasImageEditorState {
  nodeId: string;
  url: string;
  name: string;
  mode: CanvasImageEditMode;
  crop: { x: number; y: number; w: number; h: number };
  brush: number;
  rows: number;
  cols: number;
  cutsX: string;
  cutsY: string;
  maskStrokes: CanvasMaskStroke[];
}

interface CanvasOutputLightboxState {
  url: string;
  title: string;
  sourceUrl: string;
  sourceTitle: string;
  isVideo: boolean;
  compareActive: boolean;
  comparePercent: number;
  resolution: string;
}

interface CanvasOutputMediaItem {
  url: string;
  name: string;
  sourceUrl: string;
  sourceTitle: string;
  isVideo: boolean;
}

interface CanvasExecutionContext {
  prompt: string;
  references: AIReference[];
  sourceNode: CanvasNode;
}

type CanvasExecutionRefRole = "selected" | "upstream" | "downstream";

interface CanvasExecutionRef {
  id: string;
  nodeId: string;
  nodeTitle: string;
  nodeKind: CanvasExecutionNodeKind;
  role: CanvasExecutionRefRole;
  field: string;
  label: string;
  text?: string;
  url?: string;
}

interface CanvasExecutionGraphContext {
  selectedNodeId: string;
  selectedNodeTitle: string;
  selectedNodeKind: CanvasExecutionNodeKind;
  promptText: string;
  promptRefs: CanvasExecutionRef[];
  imageRefs: CanvasExecutionRef[];
  outputRefs: CanvasExecutionRef[];
  videoRefs: CanvasExecutionRef[];
  textRefs: CanvasExecutionRef[];
  upstreamCount: number;
  downstreamCount: number;
  warnings: string[];
  ready: boolean;
}

interface CanvasLinkPreview {
  fromId: string;
  current: { x: number; y: number };
  targetId?: string;
  valid: boolean;
  reason?: string;
}

interface CanvasAssetItem {
  url: string;
  name: string;
  nodeId: string;
  nodeTitle: string;
  field: string;
  localCandidate: boolean;
}

interface CanvasWorkflowRunContext {
  prompt: string;
  references: AIReference[];
  sourceNode: CanvasNode;
}

interface CanvasLLMRunContext {
  message: string;
  images: string[];
  sourceNode: CanvasNode;
}

interface CanvasVideoRunContext {
  prompt: string;
  images: AIReference[];
  videos: string[];
  sourceNode: CanvasNode;
}

interface CanvasRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DEFAULT_VIEWPORT: NativeCanvasViewport = { x: 0, y: 0, scale: 1 };
const CANVAS_EMOJIS = ["🧩", "✦", "✎", "▦", "◎", "◧", "sparkles", "layers"];
const CANVAS_IMAGE_SIZES = ["1024x1024", "1024x1536", "1536x1024", "1536x1536"];
const CANVAS_IMAGE_QUALITIES = ["auto", "high", "medium", "low"];
const CANVAS_IMAGE_POLL_MS = 1200;
const CANVAS_IMAGE_MAX_POLLS = 120;
const CANVAS_WORKFLOW_MODES = ["text", "enhance", "edit", "custom"];
const CANVAS_MS_GEN_MODELS = {
  zimage: { label: "ZImage", modelId: "Tongyi-MAI/Z-Image-Turbo", supportsImage: false },
  qwen_edit: { label: "Qwen Edit", modelId: "Qwen/Qwen-Image-Edit-2511", supportsImage: true },
  klein_edit: { label: "Klein", modelId: "black-forest-labs/FLUX.2-klein-9B", supportsImage: true }
} as const;
type CanvasMsGenModelKey = keyof typeof CANVAS_MS_GEN_MODELS;
const NODE_DROP_SLOTS: Array<{ x: number; y: number }> = [
  { x: 0, y: 0 },
  { x: 320, y: 0 },
  { x: 0, y: 280 },
  { x: 320, y: 280 },
  { x: -320, y: 0 },
  { x: 0, y: -280 },
  { x: -320, y: 280 },
  { x: 320, y: -280 },
  { x: -320, y: -280 }
];

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === "number" ? value : Number(String(value || ""));
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function normalizedViewport(value?: CanvasViewport): NativeCanvasViewport {
  return {
    ...(value || {}),
    x: asNumber(value?.x, DEFAULT_VIEWPORT.x),
    y: asNumber(value?.y, DEFAULT_VIEWPORT.y),
    scale: Math.min(2.4, Math.max(0.28, asNumber(value?.scale, DEFAULT_VIEWPORT.scale)))
  };
}

function timestampLabel(value?: number): string {
  if (!value) return "No timestamp";
  const time = value < 1e12 ? value * 1000 : value;
  return new Date(time).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function canvasTitle(canvas?: CanvasDocument | CanvasSummary | null): string {
  return canvas?.title || "Untitled canvas";
}

function canvasIcon(canvas?: CanvasDocument | CanvasSummary | null): string {
  return canvas?.icon || "🧩";
}

function nodeId(node: CanvasNode): string {
  return String(node.id || "");
}

function connectionId(connection: CanvasConnection, index = 0): string {
  return String(connection.id || `link-${index}`);
}

function connectionSelectionKey(connection: CanvasConnection, index = 0): string {
  return `${connectionId(connection, index)}:${index}`;
}

function connectionFrom(connection: CanvasConnection): string {
  return String(connection.from || connection.source || connection.sourceId || connection.fromNodeId || "");
}

function connectionTo(connection: CanvasConnection): string {
  return String(connection.to || connection.target || connection.targetId || connection.toNodeId || "");
}

function nodeType(node: CanvasNode): string {
  return String(node.type || "unknown");
}

function nodeLabel(node: CanvasNode): string {
  const type = nodeType(node);
  if (type === "image") return "Image";
  if (type === "prompt") return "Prompt";
  if (type === "promptGroup") return "Prompt group";
  if (type === "group") return "Group";
  if (type === "output") return "Output";
  if (type === "llm") return "LLM";
  if (type === "comfy") return "ComfyUI";
  if (type === "msgen") return "ModelScope";
  if (type === "video") return "Video";
  if (type === "loop") return "Loop";
  if (type === "generator") return "Generator";
  return type === "unknown" ? "Unknown node" : type;
}

function nodeTitle(node: CanvasNode): string {
  const name = typeof node.name === "string" ? node.name : "";
  const text = typeof node.text === "string" ? node.text : "";
  const model = typeof node.model === "string" ? node.model : "";
  return name || text.slice(0, 64) || model || nodeLabel(node);
}

function nodeSize(node: CanvasNode): { w: number; h: number } {
  const type = nodeType(node);
  const width = asNumber(node.w, type === "output" ? 360 : type === "llm" || type === "video" ? 340 : type === "comfy" || type === "workflow" || type === "generator" || type === "msgen" ? 360 : type === "loop" ? 336 : 260);
  const height = asNumber(node.h, type === "image" ? 230 : type === "prompt" ? 180 : type === "output" ? 240 : type === "llm" ? 240 : type === "video" ? 220 : type === "comfy" || type === "workflow" || type === "generator" || type === "msgen" ? 230 : type === "loop" ? 240 : 170);
  return { w: Math.max(180, width), h: Math.max(120, height) };
}

function nodeSemanticKind(node: CanvasNode | undefined): CanvasNodeSemanticKind {
  if (!node) return "unknown";
  const type = nodeType(node).toLowerCase();
  if (type === "prompt" || type === "loop" || type === "promptgroup") return "prompt";
  if (type === "text" || type === "note") return "text";
  if (type === "image") return "image";
  if (type === "output") return "output";
  if (type === "llm") return "llm";
  if (type === "video") return "video";
  if (type === "comfy" || type === "workflow" || type === "generator" || type === "msgen") return "workflow";
  if (type === "group") return "group";
  return "unknown";
}

function canvasExecutionNodeKind(node: CanvasNode | undefined): CanvasExecutionNodeKind {
  return nodeSemanticKind(node);
}

function outputUrlValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  for (const key of ["url", "src", "href", "outputUrl", "output_url", "image", "video", "file", "path"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const nested = outputUrlValue(candidate);
      if (nested) return nested;
    }
  }
  return "";
}

function outputUrlValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(outputUrlValues);
  const direct = outputUrlValue(value);
  return direct ? [direct] : [];
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(?:[?#].*)?$/i.test(String(url || ""));
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function outputComparisonUrl(node: CanvasNode, url: string): { url: string; name: string } {
  const comparisons = objectRecord(node.imageComparisons);
  const source = comparisons[url];
  if (typeof source === "string") return { url: source, name: assetNameFromUrl(source, "input image") };
  if (source && typeof source === "object" && !Array.isArray(source)) {
    const sourceRecord = source as Record<string, unknown>;
    const sourceUrl = outputUrlValue(sourceRecord);
    return {
      url: sourceUrl,
      name: stringField(sourceRecord.name) || stringField(sourceRecord.title) || assetNameFromUrl(sourceUrl, "input image")
    };
  }
  return { url: "", name: "" };
}

function canvasOutputMediaItems(node: CanvasNode): CanvasOutputMediaItem[] {
  const fields: unknown[] = nodeType(node) === "output"
    ? [node.images, node.videos, node.generatedOutputs]
    : [node.generatedOutputs, node.images, node.videos];
  const seen = new Set<string>();
  return fields.flatMap(outputUrlValues)
    .map((url) => String(url || "").trim())
    .filter((url) => {
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .map((url) => {
      const comparison = outputComparisonUrl(node, url);
      return {
        url,
        name: assetNameFromUrl(url, "canvas output"),
        sourceUrl: comparison.url,
        sourceTitle: comparison.name,
        isVideo: isVideoUrl(url)
      };
    });
}

function imageComparisonPatch(images: string[], compareRef: AIReference | null): Record<string, unknown> {
  if (!compareRef?.url) return {};
  return Object.fromEntries(images
    .filter((url) => url && !isVideoUrl(url))
    .map((url) => [url, { url: compareRef.url, name: compareRef.name || assetNameFromUrl(compareRef.url, "input image") }]));
}

function mergeImageComparisons(current: unknown, patch: Record<string, unknown>): Record<string, unknown> {
  return { ...objectRecord(current), ...patch };
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function loopCount(node: CanvasNode): number {
  return clampInt(node.count, 1, 1, 100);
}

function loopStart(node: CanvasNode): number {
  return clampInt(node.loopStart, 1, 1, 999);
}

function renderLoopPrompt(node: CanvasNode, index = loopStart(node), total = loopCount(node)): string {
  const variable = stringField(node.variablePrompt) || stringField(node.text) || "生成第《计数》张图";
  const fixed = stringField(node.fixedPrompt);
  const progress = total > 1 ? `${index - loopStart(node) + 1}/${total}` : "1/1";
  return [variable, fixed]
    .filter(Boolean)
    .join("\n")
    .replaceAll("《计数》", String(index))
    .replaceAll("《总数》", String(total))
    .replaceAll("《进度》", progress)
    .trim();
}

function refLabel(ref: CanvasExecutionRef): string {
  return `${ref.nodeTitle} · ${ref.field}`;
}

function collectNodeTextRefs(node: CanvasNode, role: CanvasExecutionRefRole): CanvasExecutionRef[] {
  const id = nodeId(node);
  const kind = canvasExecutionNodeKind(node);
  if (nodeType(node) === "loop") {
    const text = renderLoopPrompt(node);
    return text ? [{
      id: `${id}:loopPrompt:${text}`,
      nodeId: id,
      nodeTitle: nodeTitle(node),
      nodeKind: kind,
      role,
      field: "loopPrompt",
      label: nodeTitle(node),
      text
    }] : [];
  }
  const llmOutputText = kind === "llm" ? stringField(node.outputText) : "";
  const fields: Array<[string, unknown]> = kind === "llm" && llmOutputText
    ? [["outputText", node.outputText]]
    : [
        ["text", node.text],
        ["prompt", node.prompt],
        ["outputText", node.outputText],
        ["chatInput", node.chatInput]
      ];
  return fields.flatMap(([field, value]) => {
    const text = stringField(value);
    if (!text) return [];
    if (field === "chatInput" && kind !== "llm") return [];
    return [{
      id: `${id}:${field}:${text}`,
      nodeId: id,
      nodeTitle: nodeTitle(node),
      nodeKind: kind,
      role,
      field,
      label: nodeTitle(node),
      text
    }];
  });
}

function collectNodeMediaRefs(node: CanvasNode, role: CanvasExecutionRefRole): { imageRefs: CanvasExecutionRef[]; outputRefs: CanvasExecutionRef[]; videoRefs: CanvasExecutionRef[] } {
  const id = nodeId(node);
  const kind = canvasExecutionNodeKind(node);
  const title = nodeTitle(node);
  const fields: Array<[string, unknown, "image" | "output" | "video" | "mixed"]> = [
    ["url", node.url, "mixed"],
    ["images", node.images, "output"],
    ["generatedOutputs", node.generatedOutputs, "mixed"],
    ["videos", node.videos, "video"]
  ];
  const imageRefs: CanvasExecutionRef[] = [];
  const outputRefs: CanvasExecutionRef[] = [];
  const videoRefs: CanvasExecutionRef[] = [];
  fields.forEach(([field, value, preferredKind]) => {
    outputUrlValues(value).forEach((url, index) => {
      const trimmed = url.trim();
      if (!trimmed) return;
      const mediaKind = preferredKind === "video" || isVideoUrl(trimmed) ? "video" : preferredKind === "output" ? "output" : "image";
      const ref: CanvasExecutionRef = {
        id: `${id}:${field}:${index}:${trimmed}`,
        nodeId: id,
        nodeTitle: title,
        nodeKind: kind,
        role,
        field,
        label: assetNameFromUrl(trimmed, `${title}-${field}-${index + 1}`),
        url: trimmed
      };
      if (mediaKind === "video") {
        videoRefs.push(ref);
      } else if (mediaKind === "output") {
        outputRefs.push(ref);
        imageRefs.push({ ...ref, id: `${ref.id}:image`, field: `${field} image` });
      } else {
        imageRefs.push(ref);
      }
    });
  });
  return { imageRefs, outputRefs, videoRefs };
}

function pushUniqueRef(target: CanvasExecutionRef[], ref: CanvasExecutionRef, seen: Set<string>, key: string): void {
  if (seen.has(key)) return;
  seen.add(key);
  target.push(ref);
}

function connectionNodePairs(
  selectedId: string,
  connections: CanvasConnection[],
  nodeMap: Map<string, CanvasNode>
): Array<{ node: CanvasNode; role: CanvasExecutionRefRole; index: number }> {
  const pairs: Array<{ node: CanvasNode; role: CanvasExecutionRefRole; index: number }> = [];
  connections.forEach((connection, index) => {
    const from = connectionFrom(connection);
    const to = connectionTo(connection);
    if (to === selectedId) {
      const node = nodeMap.get(from);
      if (node) pairs.push({ node, role: "upstream", index });
    }
    if (from === selectedId) {
      const node = nodeMap.get(to);
      if (node) pairs.push({ node, role: "downstream", index });
    }
  });
  return pairs.sort((a, b) => a.index - b.index || nodeId(a.node).localeCompare(nodeId(b.node)));
}

function collectCanvasExecutionContext(
  selectedNode: CanvasNode,
  nodes: CanvasNode[],
  connections: CanvasConnection[]
): CanvasExecutionGraphContext {
  const selectedId = nodeId(selectedNode);
  const nodeMap = new Map(nodes.map((node) => [nodeId(node), node]).filter(([id]) => Boolean(id)) as Array<[string, CanvasNode]>);
  const linkedNodes = [
    { node: selectedNode, role: "selected" as const, index: -1 },
    ...connectionNodePairs(selectedId, connections, nodeMap)
  ];
  const promptRefs: CanvasExecutionRef[] = [];
  const imageRefs: CanvasExecutionRef[] = [];
  const outputRefs: CanvasExecutionRef[] = [];
  const videoRefs: CanvasExecutionRef[] = [];
  const textRefs: CanvasExecutionRef[] = [];
  const seenPromptTexts = new Set<string>();
  const seenTextRefs = new Set<string>();
  const seenImageUrls = new Set<string>();
  const seenOutputUrls = new Set<string>();
  const seenVideoUrls = new Set<string>();

  linkedNodes.forEach(({ node, role }) => {
    const kind = canvasExecutionNodeKind(node);
    collectNodeTextRefs(node, role).forEach((ref) => {
      const text = ref.text || "";
      pushUniqueRef(textRefs, ref, seenTextRefs, `${ref.nodeId}:${ref.field}:${text}`);
      if (kind === "prompt" || kind === "text" || kind === "llm" || ref.field === "prompt") {
        pushUniqueRef(promptRefs, ref, seenPromptTexts, text);
      }
    });
    if (nodeType(node) === "promptGroup" && Array.isArray(node.items)) {
      node.items.forEach((item, itemIndex) => {
        const child = nodeMap.get(String(item || ""));
        const text = child ? stringField(child.text) || stringField(child.prompt) : "";
        if (!text) return;
        const ref: CanvasExecutionRef = {
          id: `${nodeId(node)}:promptGroup:${itemIndex}:${text}`,
          nodeId: nodeId(node),
          nodeTitle: nodeTitle(node),
          nodeKind: "prompt",
          role,
          field: "promptGroup",
          label: nodeTitle(child || node),
          text
        };
        pushUniqueRef(textRefs, ref, seenTextRefs, `${ref.nodeId}:${ref.field}:${itemIndex}:${text}`);
        pushUniqueRef(promptRefs, ref, seenPromptTexts, text);
      });
    }
    const media = collectNodeMediaRefs(node, role);
    media.imageRefs.forEach((ref) => pushUniqueRef(imageRefs, ref, seenImageUrls, ref.url || ""));
    media.outputRefs.forEach((ref) => pushUniqueRef(outputRefs, ref, seenOutputUrls, ref.url || ""));
    media.videoRefs.forEach((ref) => pushUniqueRef(videoRefs, ref, seenVideoUrls, ref.url || ""));
  });

  const upstreamCount = connections.filter((connection) => connectionTo(connection) === selectedId).length;
  const downstreamCount = connections.filter((connection) => connectionFrom(connection) === selectedId).length;
  const selectedKind = canvasExecutionNodeKind(selectedNode);
  const promptText = promptRefs.map((ref) => ref.text).filter(Boolean).join("\n\n");
  const warnings: string[] = [];
  if (selectedKind === "group") {
    warnings.push("Group nodes are organization-only until typed execution ports are added.");
  }
  if (selectedKind === "llm" && !promptText) {
    warnings.push("Connect a prompt/text node or enter text before LLM execution is enabled.");
  }
  if (selectedKind === "video" && !promptText) {
    warnings.push("Connect prompt text before running video execution.");
  }
  if (selectedKind === "workflow" && !promptText && !imageRefs.length && !videoRefs.length) {
    warnings.push("Workflow nodes need prompt or media context before execution wiring.");
  }
  const selectedType = nodeType(selectedNode);
  const selectedMode = String(selectedNode.mode || "text");
  const customWorkflowNeedsName = selectedKind === "workflow"
    && selectedType !== "generator"
    && selectedMode === "custom"
    && !stringField(selectedNode.comfyWorkflow)
    && !stringField(selectedNode.workflow_json);
  if (customWorkflowNeedsName) {
    warnings.push("Choose a workflow name before custom workflow execution is enabled.");
  }
  if ((selectedKind === "prompt" || selectedKind === "image" || selectedKind === "output") && !promptText && !imageRefs.length) {
    warnings.push("Add prompt text or connect an image/output reference before running image execution.");
  }

  return {
    selectedNodeId: selectedId,
    selectedNodeTitle: nodeTitle(selectedNode),
    selectedNodeKind: selectedKind,
    promptText,
    promptRefs,
    imageRefs,
    outputRefs,
    videoRefs,
    textRefs,
    upstreamCount,
    downstreamCount,
    warnings,
    ready: warnings.length === 0
  };
}

function firstComparableImageForNode(sourceNode: CanvasNode, nodes: CanvasNode[], connections: CanvasConnection[]): AIReference | null {
  const context = collectCanvasExecutionContext(sourceNode, nodes, connections);
  const ref = [...context.imageRefs, ...context.outputRefs]
    .filter((item) => item.url && !isVideoUrl(item.url))
    .filter((item) => item.role === "selected" || item.role === "upstream")[0];
  return ref?.url ? { url: ref.url, name: ref.label || assetNameFromUrl(ref.url, "input image"), id: ref.id, role: ref.role } : null;
}

function isCanvasWorkflowExecutionNode(node: CanvasNode | null): boolean {
  if (!node) return false;
  const type = nodeType(node);
  return type === "generator" || type === "msgen" || type === "comfy" || type === "workflow";
}

function canvasWorkflowMode(node: CanvasNode | null): string {
  if (!node) return "";
  const type = nodeType(node);
  if (type === "generator") return "generator";
  if (type === "msgen") return "msgen";
  const mode = String(node.mode || "text");
  return CANVAS_WORKFLOW_MODES.includes(mode) ? mode : "text";
}

function canvasWorkflowName(node: CanvasNode | null): string {
  if (!node) return "";
  if (nodeType(node) === "generator") return "Canvas generator";
  if (nodeType(node) === "msgen") {
    const key = String(node.msgenModel || "zimage") as CanvasMsGenModelKey;
    return CANVAS_MS_GEN_MODELS[key]?.label || "ModelScope";
  }
  return stringField(node.comfyWorkflow) || stringField(node.workflow_json) || "Z-Image.json";
}

function canvasGeneratorSize(node: CanvasNode): string {
  const direct = stringField(node.size);
  if (direct) return direct;
  const customSize = stringField(node.customSize);
  if (customSize) return customSize;
  const customWidth = clampInt(node.customWidth, 0, 0, 8192);
  const customHeight = clampInt(node.customHeight, 0, 0, 8192);
  if (customWidth && customHeight) return `${customWidth}x${customHeight}`;
  const ratio = String(node.ratio || "square");
  const resolution = String(node.resolution || "1k");
  if (resolution.includes("x")) return resolution;
  if (ratio === "portrait" || ratio === "vertical" || ratio === "2:3") return "1024x1536";
  if (ratio === "landscape" || ratio === "horizontal" || ratio === "3:2") return "1536x1024";
  return "1024x1024";
}

function canvasWorkflowDimensions(node: CanvasNode): { width: number; height: number } {
  return {
    width: clampInt(node.width, 1024, 64, 8192),
    height: clampInt(node.height, 1024, 64, 8192)
  };
}

function workflowGraphRunContext(sourceNode: CanvasNode, context: CanvasExecutionGraphContext | null): CanvasWorkflowRunContext {
  const promptParts = (context?.promptRefs || [])
    .filter((ref) => ref.role === "selected" || ref.role === "upstream")
    .map((ref) => ref.text?.trim())
    .filter(Boolean) as string[];
  const prompt = Array.from(new Set(promptParts)).join("\n\n");
  const referenceMap = new Map<string, AIReference>();
  const mediaRefs = [
    ...(context?.imageRefs || []),
    ...(context?.outputRefs || [])
  ].filter((ref) => ref.role === "upstream" && ref.url);
  mediaRefs.forEach((ref) => {
    const url = String(ref.url || "").trim();
    if (!url || referenceMap.has(url)) return;
    referenceMap.set(url, {
      url,
      name: ref.label || assetNameFromUrl(url, "canvas-input.png"),
      role: ref.field || ref.role,
      id: ref.nodeId
    });
  });
  return {
    prompt,
    references: Array.from(referenceMap.values()),
    sourceNode
  };
}

function canvasLLMMode(node: CanvasNode | null): string {
  if (!node) return "";
  return String(node.mode || "node") === "chat" ? "chat" : "node";
}

function normalizeCanvasLLMMessages(value: unknown): CanvasLLMMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const role = String(record.role || "");
    const content = String(record.content || "").trim();
    if (!content || !["user", "assistant", "system"].includes(role)) return [];
    return [{ role, content }];
  });
}

function llmGraphRunContext(sourceNode: CanvasNode, context: CanvasExecutionGraphContext | null): CanvasLLMRunContext {
  const mode = canvasLLMMode(sourceNode);
  const directParts = mode === "chat"
    ? [stringField(sourceNode.chatInput)]
    : [stringField(sourceNode.text), stringField(sourceNode.prompt), stringField(sourceNode.chatInput)];
  const upstreamParts = [
    ...(context?.promptRefs || []),
    ...(context?.textRefs || [])
  ]
    .filter((ref) => ref.role === "upstream")
    .map((ref) => ref.text?.trim())
    .filter(Boolean) as string[];
  const seenTexts = new Set<string>();
  const message = [...directParts, ...upstreamParts]
    .map((part) => part.trim())
    .filter((part) => {
      if (!part || seenTexts.has(part)) return false;
      seenTexts.add(part);
      return true;
    })
    .join("\n\n");
  const seenImages = new Set<string>();
  const images = [
    ...(context?.imageRefs || []),
    ...(context?.outputRefs || [])
  ]
    .filter((ref) => ref.role === "upstream" && ref.url)
    .map((ref) => String(ref.url || "").trim())
    .filter((url) => {
      if (!url || seenImages.has(url)) return false;
      seenImages.add(url);
      return true;
    })
    .slice(0, 12);
  return { message, images, sourceNode };
}

function videoGraphRunContext(sourceNode: CanvasNode, context: CanvasExecutionGraphContext | null): CanvasVideoRunContext {
  const promptParts = (context?.promptRefs || [])
    .filter((ref) => ref.role === "selected" || ref.role === "upstream")
    .map((ref) => ref.text?.trim())
    .filter(Boolean) as string[];
  const seenPrompts = new Set<string>();
  const prompt = promptParts
    .filter((part) => {
      if (!part || seenPrompts.has(part)) return false;
      seenPrompts.add(part);
      return true;
    })
    .join("\n\n");
  const seenImages = new Set<string>();
  const imageRefs = [
    ...(context?.imageRefs || []),
    ...(context?.outputRefs || [])
  ]
    .filter((ref) => ref.role === "upstream" && ref.url)
    .map((ref) => String(ref.url || "").trim())
    .filter((url) => {
      if (!url || seenImages.has(url)) return false;
      seenImages.add(url);
      return true;
    })
    .slice(0, 9)
    .map((url, index) => {
      const role = sourceNode.useFrameRoles
        ? index === 0
          ? "first_frame"
          : index === 1
          ? "last_frame"
          : "reference_image"
        : "reference_image";
      return {
        url,
        name: assetNameFromUrl(url, `video-input-${index + 1}`),
        role,
        id: `${nodeId(sourceNode)}:video-ref:${index}`
      };
    });
  const seenVideos = new Set<string>();
  const videos = (context?.videoRefs || [])
    .filter((ref) => ref.role === "upstream" && ref.url)
    .map((ref) => String(ref.url || "").trim())
    .filter((url) => {
      if (!url || seenVideos.has(url)) return false;
      seenVideos.add(url);
      return true;
    })
    .slice(0, 3);
  return { prompt, images: imageRefs, videos, sourceNode };
}

function assertCanvasWorkflowResult(result: GenerateRecord, fallback: string): string[] {
  if (result.error) throw new Error(result.error);
  const status = String(result.status || "").toLowerCase();
  if (status === "failed" || status === "error" || status === "timeout") {
    throw new Error(result.error || fallback);
  }
  const images = resultImages(result);
  if (!images.length) throw new Error(`${fallback}: no image output returned.`);
  return images;
}

function localCanvasAssetPath(url: string): string {
  const value = String(url || "").trim();
  if (!value || value.startsWith("data:") || value.startsWith("blob:")) return "";
  try {
    const origin = typeof window === "undefined" ? "http://127.0.0.1:3000" : window.location.origin;
    const parsed = new URL(value, origin);
    if ((parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.origin !== origin) return "";
    return decodeURIComponent(parsed.pathname);
  } catch {
    return "";
  }
}

function isLocalCanvasAssetUrl(url: string): boolean {
  const path = localCanvasAssetPath(url);
  return path.startsWith("/output/") || path.startsWith("/static/assets/") || path.startsWith("/assets/");
}

function isOutputCanvasAssetUrl(url: string): boolean {
  return localCanvasAssetPath(url).startsWith("/output/");
}

function assetNameFromUrl(url: string, fallback: string): string {
  const path = localCanvasAssetPath(url) || String(url || "").split(/[?#]/, 1)[0];
  const name = decodeURIComponent(path.split("/").filter(Boolean).pop() || "").trim();
  return name || fallback;
}

function safeDownloadFilename(name: string, fallback = "canvas-assets.zip"): string {
  const cleaned = String(name || "")
    .replace(/[\\/:*?"<>|\x00-\x1f]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[ ._-]+|[ ._-]+$/g, "");
  return cleaned || fallback;
}

function zipFilename(name: string, fallback = "canvas-assets.zip"): string {
  const cleaned = safeDownloadFilename(name, fallback);
  return cleaned.toLowerCase().endsWith(".zip") ? cleaned : `${cleaned}.zip`;
}

function collectCanvasNodeAssetItems(node: CanvasNode): CanvasAssetItem[] {
  const nodeKey = nodeId(node);
  const title = nodeTitle(node);
  const fields: Array<[string, unknown]> = [
    ["url", node.url],
    ["images", node.images],
    ["generatedOutputs", node.generatedOutputs],
    ["videos", node.videos]
  ];
  const seen = new Set<string>();
  const items: CanvasAssetItem[] = [];
  fields.forEach(([field, value]) => {
    outputUrlValues(value).forEach((rawUrl, index) => {
      const url = rawUrl.trim();
      if (!url || seen.has(url)) return;
      seen.add(url);
      items.push({
        url,
        name: assetNameFromUrl(url, `${title}-${field}-${index + 1}`),
        nodeId: nodeKey,
        nodeTitle: title,
        field,
        localCandidate: isLocalCanvasAssetUrl(url)
      });
    });
  });
  return items;
}

function collectCanvasAssetItems(nodes: CanvasNode[]): CanvasAssetItem[] {
  const seen = new Set<string>();
  const items: CanvasAssetItem[] = [];
  nodes.forEach((node) => {
    collectCanvasNodeAssetItems(node).forEach((item) => {
      if (seen.has(item.url)) return;
      seen.add(item.url);
      items.push(item);
    });
  });
  return items;
}

function saveBlobDownload(blob: Blob, filename: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
}

function nodeUnknownFieldCount(node: CanvasNode): number {
  const known = new Set([
    "id", "type", "x", "y", "w", "h", "url", "name", "text", "images", "generatedOutputs", "videos", "items", "model", "prompt", "source", "asset_id",
    "providerId", "provider_id", "llmProvider", "systemPrompt", "chatInput", "messages", "outputText", "llmInputHeight", "llmOutputHeight",
    "duration", "aspectRatio", "resolution", "enhancePrompt", "enableUpsample", "watermark", "cameraFixed", "generateAudio", "useFrameRoles",
    "inputs", "running", "runStatus", "runError", "comfyWorkflow", "comfyParams", "workflow_json", "mode", "width", "height", "task_id",
    "source_node_id", "status", "params", "count", "provider", "size", "quality", "ratio", "customRatio", "customSize",
    "customRatioWidth", "customRatioHeight", "customWidth", "customHeight", "enhanceStrength", "enhanceUpscale", "enhanceUpscaleRes",
    "editUpscale", "editUpscaleRes"
  ]);
  return Object.keys(node).filter((key) => !known.has(key)).length;
}

function nodeAnchorPoint(node: CanvasNode | undefined, side: "input" | "output"): { x: number; y: number } | null {
  if (!node) return null;
  const size = nodeSize(node);
  return {
    x: asNumber(node.x) + (side === "output" ? size.w : 0),
    y: asNumber(node.y) + size.h / 2
  };
}

function connectionPathBetweenPoints(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const x1 = from.x;
  const y1 = from.y;
  const x2 = to.x;
  const y2 = to.y;
  const dx = Math.max(80, Math.abs(x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function connectionPath(from: CanvasNode | undefined, to: CanvasNode | undefined): string {
  const fromPoint = nodeAnchorPoint(from, "output");
  const toPoint = nodeAnchorPoint(to, "input");
  return fromPoint && toPoint ? connectionPathBetweenPoints(fromPoint, toPoint) : "";
}

function connectionLabel(connection: CanvasConnection, index: number, nodeMap: Map<string, CanvasNode>): string {
  const from = connectionFrom(connection);
  const to = connectionTo(connection);
  const fromLabel = nodeMap.get(from) ? nodeTitle(nodeMap.get(from) as CanvasNode) : from || `source ${index + 1}`;
  const toLabel = nodeMap.get(to) ? nodeTitle(nodeMap.get(to) as CanvasNode) : to || `target ${index + 1}`;
  return `${fromLabel} -> ${toLabel}`;
}

function connectionSemanticWarning(from: CanvasNode | undefined, to: CanvasNode | undefined): string {
  const fromKind = nodeSemanticKind(from);
  const toKind = nodeSemanticKind(to);
  if (fromKind === "group" && toKind === "group") {
    return "Group-to-group links are allowed now, but future typed ports may require a more specific source or target node.";
  }
  return "";
}

function rectForNode(node: CanvasNode, margin = 28): CanvasRect {
  const size = nodeSize(node);
  return {
    x: asNumber(node.x) - margin,
    y: asNumber(node.y) - margin,
    w: size.w + margin * 2,
    h: size.h + margin * 2
  };
}

function rectsOverlap(a: CanvasRect, b: CanvasRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function findNonOverlappingOutputPosition(
  sourceNode: CanvasNode,
  nodes: CanvasNode[],
  width: number,
  height: number,
  fallback: { x: number; y: number }
): { x: number; y: number } {
  const sourceSize = nodeSize(sourceNode);
  const sourceX = typeof sourceNode.x === "number" ? asNumber(sourceNode.x) : fallback.x;
  const sourceY = typeof sourceNode.y === "number" ? asNumber(sourceNode.y) : fallback.y;
  const gapX = 96;
  const gapY = 52;
  const rightX = sourceX + sourceSize.w + gapX;
  const belowY = sourceY + sourceSize.h + gapY;
  const aboveY = sourceY - height - gapY;
  const leftX = sourceX - width - gapX;
  const occupied = nodes.map((node) => rectForNode(node));
  const candidates: Array<{ x: number; y: number }> = [
    { x: rightX, y: sourceY },
    { x: rightX, y: belowY },
    { x: rightX, y: aboveY },
    { x: sourceX, y: belowY },
    { x: sourceX, y: aboveY },
    { x: leftX, y: sourceY },
    { x: leftX, y: belowY },
    { x: leftX, y: aboveY },
    fallback
  ];
  const rowStep = height + gapY;
  const colStep = width + gapX;
  for (const row of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
    for (const col of [0, 1, 2, 3, -1, -2]) {
      candidates.push({ x: rightX + col * colStep, y: sourceY + row * rowStep });
    }
  }
  return candidates.find((candidate) => {
    const rect = { x: candidate.x - 28, y: candidate.y - 28, w: width + 56, h: height + 56 };
    return !occupied.some((nodeRect) => rectsOverlap(rect, nodeRect));
  }) || fallback;
}

function isTaskMessageCanvasUpdate(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const type = (message as { type?: unknown }).type;
  return type === "canvas_updated" || type === "canvas_saved";
}

function outputUrls(node: CanvasNode): string[] {
  return Array.isArray(node.images) ? node.images.map(outputUrlValue).filter(Boolean) : [];
}

function nodeImageUrl(node: CanvasNode): string {
  if (nodeType(node) === "output") return outputUrls(node)[0] || "";
  return typeof node.url === "string" ? node.url : "";
}

function nodeEditableText(node: CanvasNode): string {
  if (typeof node.text === "string") return node.text;
  if (typeof node.prompt === "string") return node.prompt;
  return "";
}

function imageProviders(config: ApiConfig | null): ApiProvider[] {
  const configured = (config?.api_providers || [])
    .filter((provider) => provider.enabled !== false && Array.isArray(provider.image_models) && provider.image_models.length > 0);
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

function capabilityProvider(config: ApiConfig | null, capability: "chat" | "video"): ApiProvider | undefined {
  const field = capability === "chat" ? "chat_models" : "video_models";
  return (config?.api_providers || []).find((provider) => (
    provider.enabled !== false && Array.isArray(provider[field]) && provider[field].length > 0
  ));
}

function capabilityModel(config: ApiConfig | null, provider: ApiProvider | undefined, capability: "chat" | "video"): string {
  if (capability === "chat") {
    return provider?.chat_models?.[0] || config?.chat_model || config?.chat_models?.[0] || "";
  }
  return provider?.video_models?.[0] || config?.video_models?.[0] || "veo3-fast";
}

function comfyFieldKind(field: ComfyWorkflowField): "image" | "prompt" | "setting" {
  if (field.type === "image") return "image";
  const key = `${field.input || ""} ${field.name || ""}`.toLowerCase();
  if (field.type === "textarea" || field.type === "prompt" || /prompt|text|提示词|正向|负向/.test(key)) return "prompt";
  return "setting";
}

function comfyParamRecord(node: CanvasNode): Record<string, unknown> {
  return node.comfyParams && typeof node.comfyParams === "object" && !Array.isArray(node.comfyParams)
    ? (node.comfyParams as Record<string, unknown>)
    : {};
}

function comfyParamValue(node: CanvasNode, field: ComfyWorkflowField): unknown {
  const params = comfyParamRecord(node);
  if (Object.prototype.hasOwnProperty.call(params, field.id)) return params[field.id];
  if (field.default !== undefined) return field.default;
  if (field.type === "boolean") return false;
  if (field.type === "number" || field.type === "slider") return 0;
  return "";
}

function comfyRandomEnabled(field: ComfyWorkflowField): boolean {
  const randomEnabled = (field as unknown as Record<string, unknown>).random_enabled;
  return randomEnabled === true && (field.type === "number" || field.type === "slider");
}

function comfyRandomActive(node: CanvasNode, fieldId: string): boolean {
  const randomState = node.comfyRandomActive && typeof node.comfyRandomActive === "object" && !Array.isArray(node.comfyRandomActive)
    ? (node.comfyRandomActive as Record<string, unknown>)
    : {};
  return randomState[fieldId] !== false;
}

function comfyRandomValue(field: ComfyWorkflowField): number {
  const step = Number(field.step);
  const isFloat = Number.isFinite(step) && step > 0 && step < 1;
  let min = Number(field.min);
  let max = Number(field.max);
  const name = `${field.input || ""} ${field.name || ""} ${field.id || ""}`.toLowerCase();
  const looksSeed = name.includes("seed") || name.includes("noise") || name.includes("随机") || name.includes("噪");
  if (!Number.isFinite(min)) min = looksSeed ? 1 : 0;
  if (!Number.isFinite(max) || max <= min) max = looksSeed ? 1000000000000000 : 999999;
  const value = min + Math.random() * (max - min);
  if (isFloat) {
    const precision = Math.min(8, Math.max(1, String(field.step).split(".")[1]?.length || 2));
    return Number(value.toFixed(precision));
  }
  return Math.floor(value);
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

function taskSucceeded(task: CanvasImageTaskStatus): boolean {
  const status = task.status.toLowerCase();
  return status === "succeeded" || status === "success" || status === "completed";
}

function taskFailed(task: CanvasImageTaskStatus): boolean {
  const status = task.status.toLowerCase();
  return status === "failed" || status === "error" || status === "timeout";
}

function taskRunningStatus(status: string): ExecutionStatus {
  const value = status.toLowerCase();
  if (value === "queued" || value === "pending") return "pending";
  if (value === "failed" || value === "error" || value === "timeout") return "failed";
  if (value === "succeeded" || value === "success" || value === "completed") return "succeeded";
  return "running";
}

function supportsNativeImageExecution(node: CanvasNode | null): boolean {
  if (!node) return false;
  const kind = canvasExecutionNodeKind(node);
  return kind === "prompt" || kind === "image" || kind === "output";
}

function resultImages(result?: GenerateRecord | null): string[] {
  return Array.isArray(result?.images) ? result.images.filter(Boolean) : [];
}

function responseImageUrls(result: { url?: string; images?: string[] } | null | undefined): string[] {
  if (!result) return [];
  return [
    result.url,
    ...(Array.isArray(result.images) ? result.images : [])
  ].map((url) => String(url || "").trim()).filter(Boolean);
}

function imageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1024, height: img.naturalHeight || 1024 });
    img.onerror = () => reject(new Error("Image dimensions unavailable."));
    img.src = url;
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas image export failed."));
    }, "image/png");
  });
}

async function loadCanvasEditableImage(url: string): Promise<{ image: HTMLImageElement; cleanup: () => void }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image source failed with ${response.status}.`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const image = new window.Image();
  image.decoding = "async";
  const cleanup = () => URL.revokeObjectURL(objectUrl);
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Image source could not be decoded."));
    image.src = objectUrl;
  });
  return { image, cleanup };
}

function parseSplitCutFraction(part: string): number | null {
  const raw = part.trim();
  if (!raw) return null;
  const value = Number(raw.replace(/%$/, "").trim());
  if (!Number.isFinite(value) || value <= 0) return null;
  const fraction = value > 0 && value < 1 ? value : value / 100;
  return fraction > 0 && fraction < 1 ? fraction : null;
}

function splitFractions(count: number, cutsText: string): number[] {
  const cuts = String(cutsText || "")
    .split(",")
    .map(parseSplitCutFraction)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  if (cuts.length) return [0, ...Array.from(new Set(cuts)), 1];
  const safeCount = Math.max(1, Math.min(12, Math.round(count) || 1));
  return Array.from({ length: safeCount + 1 }, (_, index) => index / safeCount);
}

function clampCropPercent(crop: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } {
  const w = Math.max(4, Math.min(100, crop.w));
  const h = Math.max(4, Math.min(100, crop.h));
  return {
    x: Math.max(0, Math.min(100 - w, crop.x)),
    y: Math.max(0, Math.min(100 - h, crop.y)),
    w,
    h
  };
}

function numberInputValue(value: unknown): string {
  const numeric = asNumber(value, NaN);
  return Number.isFinite(numeric) ? String(Math.round(numeric)) : "";
}

export function CanvasWorkspace({
  clientId,
  apiConfig,
  providerStatus,
  taskMessage,
  onTaskChange,
  onContextChange
}: CanvasWorkspaceProps) {
  const [canvases, setCanvases] = useState<CanvasSummary[]>([]);
  const [trash, setTrash] = useState<CanvasSummary[]>([]);
  const [trashRetentionDays, setTrashRetentionDays] = useState(30);
  const [trashOpen, setTrashOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCanvas, setActiveCanvas] = useState<CanvasDocument | null>(null);
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [connections, setConnections] = useState<CanvasConnection[]>([]);
  const [viewport, setViewport] = useState<NativeCanvasViewport>(DEFAULT_VIEWPORT);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftIcon, setDraftIcon] = useState("🧩");
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [statusText, setStatusText] = useState("Select or create a canvas.");
  const [errorText, setErrorText] = useState("");
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [pendingNodeDelete, setPendingNodeDelete] = useState("");
  const [linkSourceId, setLinkSourceId] = useState("");
  const [selectedConnectionKey, setSelectedConnectionKey] = useState("");
  const [hoveredConnectionKey, setHoveredConnectionKey] = useState("");
  const [linkPreview, setLinkPreview] = useState<CanvasLinkPreview | null>(null);
  const [lastConnectionAction, setLastConnectionAction] = useState("No connection action yet.");
  const [connectionWarning, setConnectionWarning] = useState("");
  const [pendingIntakeItems, setPendingIntakeItems] = useState<CanvasIntakeItem[]>([]);
  const [lastIntakeText, setLastIntakeText] = useState("");
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus>("idle");
  const [executionTaskId, setExecutionTaskId] = useState("");
  const [executionError, setExecutionError] = useState("");
  const [executionLastUrl, setExecutionLastUrl] = useState("");
  const [executionOutputCount, setExecutionOutputCount] = useState(0);
  const [assetAvailability, setAssetAvailability] = useState<Record<string, boolean>>({});
  const [assetActionStatus, setAssetActionStatus] = useState<CanvasAssetActionStatus>("idle");
  const [assetActionText, setAssetActionText] = useState("Check local asset availability before downloading.");
  const [assetActionError, setAssetActionError] = useState("");
  const [executionProviderId, setExecutionProviderId] = useState(() => localStorage.getItem("canvas_image_provider_id") || "");
  const [executionModel, setExecutionModel] = useState(() => localStorage.getItem("canvas_image_model") || "");
  const [executionSize, setExecutionSize] = useState(() => localStorage.getItem("canvas_image_size") || "1024x1024");
  const [executionQuality, setExecutionQuality] = useState(() => localStorage.getItem("canvas_image_quality") || "auto");
  const [executionUseConnectedContext, setExecutionUseConnectedContext] = useState(true);
  const [workflowSummaries, setWorkflowSummaries] = useState<ComfyWorkflowSummary[]>([]);
  const [workflowDetails, setWorkflowDetails] = useState<Record<string, ComfyWorkflowDetail>>({});
  const [workflowListStatus, setWorkflowListStatus] = useState<"idle" | "loading" | "failed">("idle");
  const [workflowDetailStatus, setWorkflowDetailStatus] = useState<Record<string, "loading" | "failed" | "ready">>({});
  const [imageEditor, setImageEditor] = useState<CanvasImageEditorState | null>(null);
  const [imageEditorBusy, setImageEditorBusy] = useState(false);
  const [imageEditorError, setImageEditorError] = useState("");
  const [outputLightbox, setOutputLightbox] = useState<CanvasOutputLightboxState | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [openingId, setOpeningId] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState("");
  const [pendingPurgeId, setPendingPurgeId] = useState("");
  const boardRef = useRef<HTMLDivElement | null>(null);
  const nodesRef = useRef(nodes);
  const connectionsRef = useRef(connections);
  const viewportRef = useRef(viewport);
  const dragRef = useRef<DragState | null>(null);
  const autoOpenedRef = useRef(false);
  const intakeRequiresTargetRef = useRef(false);
  const idCounterRef = useRef(0);
  const executionRunRef = useRef(0);
  const maskDrawingRef = useRef(false);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    connectionsRef.current = connections;
  }, [connections]);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  const selectedNode = useMemo(() => (
    nodes.find((node) => nodeId(node) === selectedNodeId) || null
  ), [nodes, selectedNodeId]);

  const nodeMap = useMemo(() => {
    const map = new Map<string, CanvasNode>();
    nodes.forEach((node) => {
      const id = nodeId(node);
      if (id) map.set(id, node);
    });
    return map;
  }, [nodes]);

  const selectedConnections = useMemo(() => {
    if (!selectedNodeId) return [];
    return connections
      .map((connection, index) => ({ connection, index }))
      .filter(({ connection }) => connectionFrom(connection) === selectedNodeId || connectionTo(connection) === selectedNodeId);
  }, [connections, selectedNodeId]);

  const selectedConnection = useMemo(() => (
    connections
      .map((connection, index) => ({ connection, index }))
      .find(({ connection, index }) => connectionSelectionKey(connection, index) === selectedConnectionKey) || null
  ), [connections, selectedConnectionKey]);

  const selectedConnectionLabel = useMemo(() => (
    selectedConnection ? connectionLabel(selectedConnection.connection, selectedConnection.index, nodeMap) : ""
  ), [nodeMap, selectedConnection]);

  const selectedConnectionWarning = useMemo(() => {
    if (!selectedConnection) return "";
    return connectionSemanticWarning(
      nodeMap.get(connectionFrom(selectedConnection.connection)),
      nodeMap.get(connectionTo(selectedConnection.connection))
    );
  }, [nodeMap, selectedConnection]);

  useEffect(() => {
    if (selectedConnectionKey && !selectedConnection) {
      setSelectedConnectionKey("");
    }
  }, [selectedConnection, selectedConnectionKey]);

  const assetItems = useMemo(() => collectCanvasAssetItems(nodes), [nodes]);
  const localAssetItems = useMemo(() => assetItems.filter((item) => item.localCandidate), [assetItems]);
  const downloadableAssetItems = useMemo(
    () => localAssetItems.filter((item) => assetAvailability[item.url]),
    [assetAvailability, localAssetItems]
  );
  const skippedAssetCount = assetItems.length - localAssetItems.length;
  const selectedAssetItems = useMemo(
    () => selectedNode ? collectCanvasNodeAssetItems(selectedNode) : [],
    [selectedNode]
  );
  const selectedAsset = useMemo(
    () => selectedAssetItems.find((item) => item.localCandidate) || selectedAssetItems[0] || null,
    [selectedAssetItems]
  );
  const selectedAssetAvailability = selectedAsset ? assetAvailability[selectedAsset.url] : undefined;
  const selectedGraphContext = useMemo(
    () => selectedNode ? collectCanvasExecutionContext(selectedNode, nodes, connections) : null,
    [connections, nodes, selectedNode]
  );

  useEffect(() => {
    const urls = new Set(assetItems.map((item) => item.url));
    setAssetAvailability((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([url]) => urls.has(url)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [assetItems]);

  const executionProviders = useMemo(() => imageProviders(apiConfig), [apiConfig]);
  const selectedExecutionProvider = useMemo(() => (
    executionProviders.find((provider) => provider.id === executionProviderId) || executionProviders[0]
  ), [executionProviderId, executionProviders]);
  const executionModelOptions = selectedExecutionProvider?.image_models || [];
  const executionProviderReady = providerStatus.configured && providerHasUsableKey(selectedExecutionProvider, apiConfig);

  useEffect(() => {
    const nextProvider = selectedExecutionProvider?.id || "";
    if (nextProvider && executionProviderId !== nextProvider) setExecutionProviderId(nextProvider);
    if (executionModelOptions.length && !executionModelOptions.includes(executionModel)) {
      setExecutionModel(executionModelOptions[0]);
    }
  }, [executionModel, executionModelOptions, executionProviderId, selectedExecutionProvider]);

  useEffect(() => {
    if (executionProviderId) localStorage.setItem("canvas_image_provider_id", executionProviderId);
  }, [executionProviderId]);

  useEffect(() => {
    if (executionModel) localStorage.setItem("canvas_image_model", executionModel);
  }, [executionModel]);

  useEffect(() => {
    if (executionSize) localStorage.setItem("canvas_image_size", executionSize);
  }, [executionSize]);

  useEffect(() => {
    if (executionQuality) localStorage.setItem("canvas_image_quality", executionQuality);
  }, [executionQuality]);

  useEffect(() => () => {
    executionRunRef.current += 1;
  }, []);

  const filteredCanvases = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return canvases;
    return canvases.filter((canvas) => canvasTitle(canvas).toLowerCase().includes(value));
  }, [canvases, search]);

  const publishTask = useCallback((task: CanvasTaskSummary) => {
    onTaskChange(task);
  }, [onTaskChange]);

  const refreshWorkflowSummaries = useCallback(async () => {
    setWorkflowListStatus("loading");
    try {
      const result = await getComfyWorkflows();
      setWorkflowSummaries(Array.isArray(result.workflows) ? result.workflows : []);
      setWorkflowListStatus("idle");
    } catch {
      setWorkflowSummaries([]);
      setWorkflowListStatus("failed");
    }
  }, []);

  const ensureWorkflowDetail = useCallback(async (name: string) => {
    const workflowName = name.trim();
    if (!workflowName || workflowDetails[workflowName]) return;
    setWorkflowDetailStatus((current) => ({ ...current, [workflowName]: "loading" }));
    try {
      const detail = await getComfyWorkflow(workflowName);
      setWorkflowDetails((current) => ({ ...current, [workflowName]: detail }));
      setWorkflowDetailStatus((current) => ({ ...current, [workflowName]: "ready" }));
    } catch {
      setWorkflowDetailStatus((current) => ({ ...current, [workflowName]: "failed" }));
    }
  }, [workflowDetails]);

  useEffect(() => {
    void refreshWorkflowSummaries();
  }, [refreshWorkflowSummaries]);

  useEffect(() => {
    if (!selectedNode || canvasExecutionNodeKind(selectedNode) !== "workflow") return;
    if (canvasWorkflowMode(selectedNode) !== "custom") return;
    const workflowName = stringField(selectedNode.comfyWorkflow) || stringField(selectedNode.workflow_json);
    if (workflowName) void ensureWorkflowDetail(workflowName);
  }, [ensureWorkflowDetail, selectedNode]);

  const markDirty = useCallback((detail = "Canvas has unsaved changes") => {
    setSaveState((current) => current === "saving" ? current : "dirty");
    setStatusText(detail);
    publishTask({ status: "pending", label: "Canvas unsaved", detail });
  }, [publishTask]);

  const nextStableId = useCallback((prefix: string) => {
    idCounterRef.current += 1;
    const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
    return `${prefix}-${Date.now().toString(36)}-${idCounterRef.current}-${suffix}`;
  }, []);

  const visibleBoardPoint = useCallback((width = 260, height = 180, offset: BoardDropOffset = 0) => {
    const rect = boardRef.current?.getBoundingClientRect();
    const current = viewportRef.current;
    const scale = current.scale || 1;
    const offsetX = typeof offset === "number" ? offset : offset.x;
    const offsetY = typeof offset === "number" ? offset : offset.y;
    if (!rect) {
      return {
        x: 80 + offsetX,
        y: 80 + offsetY
      };
    }
    return {
      x: Math.round((rect.width / 2 - current.x) / scale - width / 2 + offsetX),
      y: Math.round((rect.height / 2 - current.y) / scale - height / 2 + offsetY)
    };
  }, []);

  const boardPointFromClient = useCallback((clientX: number, clientY: number) => {
    const rect = boardRef.current?.getBoundingClientRect();
    const current = viewportRef.current;
    const scale = current.scale || 1;
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - current.x) / scale,
      y: (clientY - rect.top - current.y) / scale
    };
  }, []);

  const inputHandleTargetFromPoint = useCallback((clientX: number, clientY: number, fromId: string) => {
    const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const handle = target?.closest<HTMLElement>('[data-canvas-handle="input"]');
    const targetId = handle?.dataset.nodeId || "";
    if (!targetId) return { targetId: "", valid: false, reason: "" };
    if (targetId === fromId) return { targetId, valid: false, reason: "A node cannot connect to itself." };
    return { targetId, valid: true, reason: "" };
  }, []);

  const addNode = useCallback((node: CanvasNode, detail: string) => {
    const id = nodeId(node);
    setNodes((current) => [...current, node]);
    if (id) setSelectedNodeId(id);
    markDirty(detail);
  }, [markDirty]);

  const nodeAtViewportCenter = useCallback((kind: CanvasNodeKind, overrides: CanvasNode = {}, offset: BoardDropOffset = 0): CanvasNode => {
    const defaults = {
      prompt: { w: 280, h: 180 },
      image: { w: 280, h: 240 },
      output: { w: 360, h: 240 },
      group: { w: 360, h: 220 },
      promptGroup: { w: 360, h: 220 },
      llm: { w: 340, h: 240 },
      video: { w: 340, h: 220 },
      workflow: { w: 360, h: 230 },
      generator: { w: 360, h: 230 },
      msgen: { w: 380, h: 230 },
      loop: { w: 336, h: 240 }
    }[kind];
    const slot = NODE_DROP_SLOTS[(nodesRef.current.length + idCounterRef.current) % NODE_DROP_SLOTS.length];
    const extraOffset = typeof offset === "number" ? { x: offset, y: offset } : offset;
    const position = visibleBoardPoint(defaults.w, defaults.h, {
      x: slot.x + extraOffset.x,
      y: slot.y + extraOffset.y
    });
    const savedKind = kind === "workflow" ? "comfy" : kind;
    return {
      id: nextStableId(savedKind),
      type: savedKind,
      x: position.x,
      y: position.y,
      w: defaults.w,
      h: defaults.h,
      ...overrides
    };
  }, [nextStableId, visibleBoardPoint]);

  const addPromptNode = useCallback(() => {
    addNode(nodeAtViewportCenter("prompt", {
      name: "Prompt note",
      text: "Describe the image or reference here."
    }), "Prompt node added");
  }, [addNode, nodeAtViewportCenter]);

  const addGroupNode = useCallback(() => {
    addNode(nodeAtViewportCenter("group", {
      name: "Section",
      items: []
    }), "Group node added");
  }, [addNode, nodeAtViewportCenter]);

  const addPromptGroupNode = useCallback(() => {
    addNode(nodeAtViewportCenter("promptGroup", {
      name: "Prompt group",
      text: "Grouped prompt text",
      items: []
    }), "Prompt group node added");
  }, [addNode, nodeAtViewportCenter]);

  const addLoopNode = useCallback(() => {
    addNode(nodeAtViewportCenter("loop", {
      name: "Loop node",
      count: 3,
      loopStart: 1,
      imageBatchSize: 1,
      mode: "serial",
      showPrompt: true,
      imageInput: false,
      variablePrompt: "生成第《计数》张图",
      fixedPrompt: ""
    }), "Loop node added");
  }, [addNode, nodeAtViewportCenter]);

  const addLLMNode = useCallback(() => {
    const provider = capabilityProvider(apiConfig, "chat");
    addNode(nodeAtViewportCenter("llm", {
      name: "LLM node",
      model: capabilityModel(apiConfig, provider, "chat"),
      llmProvider: provider?.id || "comfly",
      mode: "node",
      systemPrompt: "You are a helpful assistant. Rewrite the input into a concise image prompt.",
      chatInput: "",
      messages: [],
      outputText: "",
      llmInputHeight: 110,
      llmOutputHeight: 150,
      running: false
    }), "LLM node added");
  }, [addNode, apiConfig, nodeAtViewportCenter]);

  const addVideoNode = useCallback(() => {
    const provider = capabilityProvider(apiConfig, "video");
    addNode(nodeAtViewportCenter("video", {
      name: "Video node",
      providerId: provider?.id || "comfly",
      model: capabilityModel(apiConfig, provider, "video"),
      duration: 5,
      aspectRatio: "16:9",
      resolution: "",
      enhancePrompt: false,
      enableUpsample: false,
      watermark: false,
      cameraFixed: false,
      generateAudio: false,
      useFrameRoles: false,
      inputs: [],
      videos: [],
      running: false
    }), "Video node added");
  }, [addNode, apiConfig, nodeAtViewportCenter]);

  const addGeneratorNode = useCallback(() => {
    const provider = imageProviders(apiConfig)[0];
    const model = provider?.image_models?.[0] || apiConfig?.image_model || apiConfig?.image_models?.[0] || "gpt-image-2";
    addNode(nodeAtViewportCenter("generator", {
      name: "Generator node",
      providerId: provider?.id || "comfly",
      model,
      ratio: "square",
      resolution: "1k",
      size: "1024x1024",
      quality: "auto",
      count: 1,
      generatedOutputs: [],
      inputs: [],
      running: false
    }), "Generator node added");
  }, [addNode, apiConfig, nodeAtViewportCenter]);

  const addMsGenNode = useCallback(() => {
    addNode(nodeAtViewportCenter("msgen", {
      name: "ModelScope node",
      msgenModel: "zimage",
      msWidth: 1024,
      msHeight: 1024,
      fitImage: false,
      kleinLora: false,
      kleinLoraStrength: 0.8,
      generatedOutputs: [],
      inputs: [],
      running: false
    }), "ModelScope node added");
  }, [addNode, nodeAtViewportCenter]);

  const addWorkflowNode = useCallback(() => {
    addNode(nodeAtViewportCenter("workflow", {
      name: "Workflow node",
      mode: "text",
      comfyWorkflow: "",
      comfyParams: {},
      width: 1024,
      height: 1024,
      generatedOutputs: [],
      inputs: [],
      running: false
    }), "Workflow node added");
  }, [addNode, nodeAtViewportCenter]);

  const addImageNodeFromUrl = useCallback((mode: "image" | "output" = "image", sourceUrl = imageUrlInput) => {
    const url = sourceUrl.trim();
    if (!url) {
      setErrorText("Enter an image URL before adding an image node.");
      return;
    }
    const kind = mode === "output" ? "output" : "image";
    const node = nodeAtViewportCenter(kind, mode === "output" ? {
      name: "Output reference",
      images: [url]
    } : {
      name: "Image reference",
      url
    });
    addNode(node, mode === "output" ? "Output node added" : "Image node added");
    setImageUrlInput("");
    setErrorText("");
  }, [addNode, imageUrlInput, nodeAtViewportCenter]);

  const addNodesFromIntake = useCallback((items: CanvasIntakeItem[], source = "Canvas intake") => {
    const validItems = items.filter((item) => item.url);
    if (!validItems.length) return;
    if (!activeCanvas) {
      intakeRequiresTargetRef.current = true;
      setPendingIntakeItems((current) => [...current, ...validItems]);
      setLastIntakeText(`${validItems.length} asset${validItems.length === 1 ? "" : "s"} waiting for an open canvas`);
      setStatusText("Choose a canvas or create a new one to place queued assets.");
      publishTask({ status: "pending", label: "Canvas intake queued", detail: "Open or create a canvas to place assets" });
      return;
    }
    const created = validItems.map((item, index) => {
      const mode = item.type === "output" ? "output" : "image";
      return nodeAtViewportCenter(mode, mode === "output" ? {
        name: item.title || "Output reference",
        images: [item.url],
        prompt: item.prompt || "",
        source: item.source || source,
        model: item.model || "",
        asset_id: item.id || ""
      } : {
        name: item.title || "Image reference",
        url: item.url,
        prompt: item.prompt || "",
        source: item.source || source,
        model: item.model || "",
        asset_id: item.id || ""
      }, index * 32);
    });
    setNodes((current) => [...current, ...created]);
    setSelectedNodeId(nodeId(created[created.length - 1]) || "");
    const detail = `${created.length} asset${created.length === 1 ? "" : "s"} added to canvas`;
    setLastIntakeText(detail);
    markDirty(detail);
  }, [activeCanvas, markDirty, nodeAtViewportCenter, publishTask]);

  const updateSelectedNode = useCallback((patch: CanvasNode, detail = "Node updated") => {
    if (!selectedNodeId) return;
    setNodes((current) => current.map((node) => nodeId(node) === selectedNodeId ? { ...node, ...patch } : node));
    markDirty(detail);
  }, [markDirty, selectedNodeId]);

  const updateSelectedNodeImageUrl = useCallback((url: string) => {
    if (!selectedNode) return;
    if (nodeType(selectedNode) === "output") {
      updateSelectedNode({ images: [url] }, "Output image updated");
    } else if (nodeType(selectedNode) === "video") {
      updateSelectedNode({ videos: url.trim() ? [url] : [] }, "Video media URL updated");
    } else {
      updateSelectedNode({ url }, "Image URL updated");
    }
  }, [selectedNode, updateSelectedNode]);

  const openImageEditor = useCallback((node: CanvasNode) => {
    const url = stringField(node.url) || outputUrlValues(node.images)[0] || outputUrlValues(node.generatedOutputs)[0] || "";
    if (!url || isVideoUrl(url)) return;
    setImageEditor({
      nodeId: nodeId(node),
      url,
      name: nodeTitle(node),
      mode: "crop",
      crop: { x: 10, y: 10, w: 80, h: 80 },
      brush: 36,
      rows: 2,
      cols: 2,
      cutsX: "",
      cutsY: "",
      maskStrokes: []
    });
    setImageEditorError("");
  }, []);

  const closeImageEditor = useCallback(() => {
    setImageEditor(null);
    setImageEditorError("");
    maskDrawingRef.current = false;
  }, []);

  const updateImageEditor = useCallback((patch: Partial<CanvasImageEditorState>) => {
    setImageEditor((current) => current ? { ...current, ...patch } : current);
  }, []);

  const appendMaskPoint = useCallback((event: ReactPointerEvent<SVGSVGElement>, startStroke = false) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const point = {
      x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100))
    };
    setImageEditor((current) => {
      if (!current) return current;
      if (startStroke || !current.maskStrokes.length) {
        return { ...current, maskStrokes: [...current.maskStrokes, { size: current.brush, points: [point] }] };
      }
      const strokes = current.maskStrokes.slice();
      const last = strokes[strokes.length - 1];
      strokes[strokes.length - 1] = { ...last, points: [...last.points, point] };
      return { ...current, maskStrokes: strokes };
    });
  }, []);

  const uploadEditedImageBlob = useCallback(async (blob: Blob, filename: string) => {
    const response = await uploadAiReferenceImage(blob, filename);
    const file = response.files?.[0];
    if (!file?.url) throw new Error("Image editor upload did not return a usable URL.");
    return { url: file.url, name: file.name || filename };
  }, []);

  const applyImageEditor = useCallback(async () => {
    if (!imageEditor || imageEditorBusy) return;
    const sourceNode = nodesRef.current.find((node) => nodeId(node) === imageEditor.nodeId);
    if (!sourceNode) {
      setImageEditorError("Source image node no longer exists.");
      return;
    }
    setImageEditorBusy(true);
    setImageEditorError("");
    let cleanup = () => {};
    try {
      const loaded = await loadCanvasEditableImage(imageEditor.url);
      cleanup = loaded.cleanup;
      const image = loaded.image;
      const base = safeDownloadFilename((imageEditor.name || "image").replace(/\.[^.]+$/, ""), "image");
      if (imageEditor.mode === "crop") {
        const crop = clampCropPercent(imageEditor.crop);
        const sx = Math.max(0, Math.round((crop.x / 100) * image.naturalWidth));
        const sy = Math.max(0, Math.round((crop.y / 100) * image.naturalHeight));
        const sw = Math.max(1, Math.round((crop.w / 100) * image.naturalWidth));
        const sh = Math.max(1, Math.round((crop.h / 100) * image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = sw;
        canvas.height = sh;
        canvas.getContext("2d")?.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
        const file = await uploadEditedImageBlob(await canvasToPngBlob(canvas), `${base}_crop.png`);
        setNodes((current) => current.map((node) => nodeId(node) === imageEditor.nodeId ? { ...node, url: file.url, name: file.name } : node));
        markDirty("Image crop applied");
        setStatusText("Image crop applied");
        closeImageEditor();
        return;
      }

      if (imageEditor.mode === "mask") {
        if (!imageEditor.maskStrokes.some((stroke) => stroke.points.length)) {
          throw new Error("Draw a mask stroke before applying.");
        }
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Mask canvas unavailable.");
        context.fillStyle = "#000";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.lineCap = "square";
        context.lineJoin = "miter";
        context.strokeStyle = "#fff";
        imageEditor.maskStrokes.forEach((stroke) => {
          if (!stroke.points.length) return;
          context.lineWidth = Math.max(1, (stroke.size / 100) * Math.max(canvas.width, canvas.height));
          context.beginPath();
          stroke.points.forEach((point, index) => {
            const x = (point.x / 100) * canvas.width;
            const y = (point.y / 100) * canvas.height;
            if (index) context.lineTo(x, y);
            else context.moveTo(x, y);
          });
          context.stroke();
        });
        const file = await uploadEditedImageBlob(await canvasToPngBlob(canvas), `${base}_mask.png`);
        const sourceSize = nodeSize(sourceNode);
        const maskNode: CanvasNode = {
          id: nextStableId("img"),
          type: "image",
          x: asNumber(sourceNode.x) + sourceSize.w + 40,
          y: asNumber(sourceNode.y),
          w: 260,
          h: 220,
          url: file.url,
          name: file.name,
          role: "mask",
          source_node_id: imageEditor.nodeId
        };
        setNodes((current) => [...current, maskNode]);
        setSelectedNodeId(nodeId(maskNode));
        markDirty("Mask image node created");
        setStatusText("Mask image node created");
        closeImageEditor();
        return;
      }

      const xs = splitFractions(imageEditor.cols, imageEditor.cutsX);
      const ys = splitFractions(imageEditor.rows, imageEditor.cutsY);
      const created: CanvasNode[] = [];
      let tileIndex = 1;
      for (let y = 0; y < ys.length - 1; y += 1) {
        for (let x = 0; x < xs.length - 1; x += 1) {
          const sx = Math.round(xs[x] * image.naturalWidth);
          const sy = Math.round(ys[y] * image.naturalHeight);
          const sw = Math.max(1, Math.round((xs[x + 1] - xs[x]) * image.naturalWidth));
          const sh = Math.max(1, Math.round((ys[y + 1] - ys[y]) * image.naturalHeight));
          const canvas = document.createElement("canvas");
          canvas.width = sw;
          canvas.height = sh;
          canvas.getContext("2d")?.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
          const file = await uploadEditedImageBlob(await canvasToPngBlob(canvas), `${base}_tile_${tileIndex}.png`);
          created.push({
            id: nextStableId("img"),
            type: "image",
            x: asNumber(sourceNode.x) + nodeSize(sourceNode).w + 40 + (x % 3) * 150,
            y: asNumber(sourceNode.y) + y * 150,
            w: 260,
            h: 220,
            url: file.url,
            name: file.name,
            source_node_id: imageEditor.nodeId,
            gridTile: `${y + 1}-${x + 1}`
          });
          tileIndex += 1;
        }
      }
      if (!created.length) throw new Error("Grid split did not produce any tiles.");
      setNodes((current) => [...current, ...created]);
      setSelectedNodeId(nodeId(created[created.length - 1]));
      markDirty(`${created.length} image tile${created.length === 1 ? "" : "s"} created`);
      setStatusText(`${created.length} image tile${created.length === 1 ? "" : "s"} created`);
      closeImageEditor();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image editor failed.";
      setImageEditorError(message);
      setStatusText("Image editor failed");
      publishTask({ status: "failed", label: "Canvas image editor failed", detail: message, error: message });
    } finally {
      cleanup();
      setImageEditorBusy(false);
    }
  }, [closeImageEditor, imageEditor, imageEditorBusy, markDirty, nextStableId, publishTask, uploadEditedImageBlob]);

  const openOutputLightbox = useCallback((item: CanvasOutputMediaItem) => {
    setOutputLightbox({
      url: item.url,
      title: item.name || "Canvas output",
      sourceUrl: item.sourceUrl,
      sourceTitle: item.sourceTitle || "input image",
      isVideo: item.isVideo,
      compareActive: false,
      comparePercent: 50,
      resolution: item.isVideo ? "video" : "--"
    });
  }, []);

  const closeOutputLightbox = useCallback(() => {
    setOutputLightbox(null);
  }, []);

  const updateOutputLightbox = useCallback((patch: Partial<CanvasOutputLightboxState>) => {
    setOutputLightbox((current) => current ? { ...current, ...patch } : current);
  }, []);

  const downloadLightboxOutput = useCallback(async () => {
    if (!outputLightbox?.url) return;
    try {
      const response = await fetch(outputLightbox.url);
      if (!response.ok) throw new Error(`Download failed with ${response.status}.`);
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = safeDownloadFilename(outputLightbox.title, "canvas-output.png");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
      setStatusText("Canvas output download started");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Canvas output download failed.";
      setStatusText("Canvas output download failed");
      publishTask({ status: "failed", label: "Canvas output download failed", detail: message, error: message });
    }
  }, [outputLightbox, publishTask]);

  const updateSelectedComfyParam = useCallback((field: ComfyWorkflowField, value: unknown) => {
    if (!selectedNode) return;
    updateSelectedNode({
      comfyParams: {
        ...comfyParamRecord(selectedNode),
        [field.id]: value
      }
    }, "Workflow parameter updated");
  }, [selectedNode, updateSelectedNode]);

  const toggleSelectedComfyRandom = useCallback((fieldId: string) => {
    if (!selectedNode) return;
    const current = selectedNode.comfyRandomActive && typeof selectedNode.comfyRandomActive === "object" && !Array.isArray(selectedNode.comfyRandomActive)
      ? (selectedNode.comfyRandomActive as Record<string, unknown>)
      : {};
    updateSelectedNode({
      comfyRandomActive: {
        ...current,
        [fieldId]: current[fieldId] === false
      }
    }, "Workflow random parameter toggled");
  }, [selectedNode, updateSelectedNode]);

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNodeId) return;
    setNodes((current) => current.filter((node) => nodeId(node) !== selectedNodeId));
    setConnections((current) => current.filter((connection) => (
      connectionFrom(connection) !== selectedNodeId && connectionTo(connection) !== selectedNodeId
    )));
    setSelectedNodeId("");
    setSelectedConnectionKey("");
    setHoveredConnectionKey("");
    setLinkPreview(null);
    setConnectionWarning("");
    setLastConnectionAction("Connections attached to deleted node were removed.");
    setPendingNodeDelete("");
    setLinkSourceId((current) => current === selectedNodeId ? "" : current);
    markDirty("Node deleted");
  }, [markDirty, selectedNodeId]);

  const selectConnection = useCallback((connection: CanvasConnection, index: number) => {
    const key = connectionSelectionKey(connection, index);
    setSelectedConnectionKey(key);
    setSelectedNodeId("");
    setPendingNodeDelete("");
    setLinkSourceId("");
    const label = connectionLabel(connection, index, nodeMap);
    const warning = connectionSemanticWarning(nodeMap.get(connectionFrom(connection)), nodeMap.get(connectionTo(connection)));
    setConnectionWarning(warning);
    setStatusText(`Selected link: ${label}`);
  }, [nodeMap]);

  const createLink = useCallback((from: string, to: string, source: "inspector" | "drag" = "inspector") => {
    if (!from || !to || from === to) {
      setLinkSourceId("");
      setLinkPreview(null);
      const detail = "Select two different nodes to create a link.";
      setConnectionWarning(from && to && from === to ? "A node cannot connect to itself." : "");
      setLastConnectionAction("Connection ignored.");
      setStatusText(detail);
      return false;
    }
    if (connections.some((connection) => connectionFrom(connection) === from && connectionTo(connection) === to)) {
      setLinkSourceId("");
      setLinkPreview(null);
      setConnectionWarning("");
      setLastConnectionAction("Duplicate connection ignored.");
      setStatusText("Connection already exists.");
      return false;
    }
    const warning = connectionSemanticWarning(nodeMap.get(from), nodeMap.get(to));
    const id = nextStableId("link");
    const nextConnection: CanvasConnection = { id, from, to };
    setConnections((current) => [...current, nextConnection]);
    setSelectedConnectionKey(connectionSelectionKey(nextConnection, connections.length));
    if (source === "drag") setSelectedNodeId("");
    setLinkSourceId("");
    setLinkPreview(null);
    setConnectionWarning(warning);
    setLastConnectionAction(warning ? "Connection created with a soft warning." : "Connection created.");
    markDirty(warning ? "Link created with warning" : "Link created");
    return true;
  }, [connections, markDirty, nextStableId, nodeMap]);

  const deleteLink = useCallback((id: string, index: number) => {
    setConnections((current) => current.filter((connection, connectionIndex) => (
      connectionId(connection, connectionIndex) !== id || connectionIndex !== index
    )));
    setSelectedConnectionKey((current) => current === `${id}:${index}` ? "" : current);
    setHoveredConnectionKey((current) => current === `${id}:${index}` ? "" : current);
    setConnectionWarning("");
    setLastConnectionAction("Connection deleted.");
    markDirty("Link deleted");
  }, [markDirty]);

  const deleteSelectedConnection = useCallback(() => {
    if (!selectedConnection) return;
    deleteLink(connectionId(selectedConnection.connection, selectedConnection.index), selectedConnection.index);
  }, [deleteLink, selectedConnection]);

  const selectNodeForAction = useCallback((id: string) => {
    if (linkSourceId) {
      createLink(linkSourceId, id);
    }
    setSelectedNodeId(id);
    setSelectedConnectionKey("");
  }, [createLink, linkSourceId]);

  const startLinkFromSelection = useCallback(() => {
    if (!selectedNodeId) return;
    setLinkSourceId(selectedNodeId);
    setSelectedConnectionKey("");
    setConnectionWarning("");
    setLastConnectionAction("Inspector link source set.");
    setStatusText("Select another node to create a link.");
    publishTask({ status: "pending", label: "Canvas linking", detail: `Link source: ${selectedNodeId}` });
  }, [publishTask, selectedNodeId]);

  const buildExecutionContext = useCallback((sourceNode: CanvasNode): CanvasExecutionContext | null => {
    const sourceId = nodeId(sourceNode);
    const references = new Map<string, AIReference>();
    let prompt = nodeEditableText(sourceNode).trim();
    const addReference = (node: CanvasNode, role: string) => {
      const url = nodeImageUrl(node).trim();
      if (!url || references.has(url)) return;
      references.set(url, {
        url,
        name: nodeTitle(node),
        role,
        id: nodeId(node)
      });
    };

    if (nodeType(sourceNode) === "image" || nodeType(sourceNode) === "output") {
      addReference(sourceNode, "selected");
    }

    if (executionUseConnectedContext && sourceId) {
      connections.forEach((connection) => {
        const from = connectionFrom(connection);
        const to = connectionTo(connection);
        if (from !== sourceId && to !== sourceId) return;
        const otherId = from === sourceId ? to : from;
        const other = nodeMap.get(otherId);
        if (!other) return;
        const otherText = nodeEditableText(other).trim();
        if (!prompt && otherText) prompt = otherText;
        if (nodeType(other) === "image" || nodeType(other) === "output") {
          addReference(other, from === sourceId ? "linked-target" : "linked-source");
        }
      });
    }

    if (!prompt && references.size) {
      prompt = "Edit the reference image.";
    }

    if (!prompt) {
      setExecutionError("Add prompt text to the selected node or connect it to a prompt node before running.");
      return null;
    }

    return {
      prompt,
      references: Array.from(references.values()).slice(0, 4),
      sourceNode
    };
  }, [connections, executionUseConnectedContext, nodeMap]);

  const insertExecutionOutputNode = useCallback((
    sourceNode: CanvasNode,
    result: GenerateRecord,
    taskId: string,
    fallbackProviderId: string,
    fallbackModel: string
  ) => {
    const images = resultImages(result);
    if (!images.length) throw new Error("Canvas image task finished without image output.");
    const fallbackPosition = visibleBoardPoint(360, 260, { x: 96, y: 0 });
    const outputPosition = findNonOverlappingOutputPosition(sourceNode, nodesRef.current, 360, 260, fallbackPosition);
    const sourceId = nodeId(sourceNode);
    const outputId = nextStableId("output");
    const outputIndex = nodesRef.current.filter((node) => nodeType(node) === "output").length + 1;
    const comparisonPatch = imageComparisonPatch(images, firstComparableImageForNode(sourceNode, nodesRef.current, connectionsRef.current));
    const outputNode: CanvasNode = {
      id: outputId,
      type: "output",
      x: Math.round(outputPosition.x),
      y: Math.round(outputPosition.y),
      w: 360,
      h: 260,
      name: `Canvas output ${outputIndex}`,
      images,
      prompt: result.prompt || nodeEditableText(sourceNode),
      model: result.model || fallbackModel,
      provider_id: result.provider_id || fallbackProviderId,
      task_id: taskId,
      source_node_id: sourceId,
      source: "Canvas image execution",
      status: result.status || "succeeded",
      ...(Object.keys(comparisonPatch).length ? { imageComparisons: comparisonPatch } : {}),
      params: {
        ...(result.params || {}),
        canvas_id: activeCanvas?.id || "",
        source_node_id: sourceId,
        task_id: taskId
      }
    };
    setNodes((current) => [...current, outputNode]);
    if (sourceId) {
      setConnections((current) => current.some((connection) => connectionFrom(connection) === sourceId && connectionTo(connection) === outputId)
        ? current
        : [...current, { id: nextStableId("link"), from: sourceId, to: outputId }]);
    }
    setSelectedNodeId(nodeId(outputNode));
    setExecutionLastUrl(images[0]);
    setExecutionOutputCount(images.length);
    markDirty(`${images.length} generated image${images.length === 1 ? "" : "s"} inserted as Canvas output`);
    return outputNode;
  }, [activeCanvas?.id, markDirty, nextStableId, visibleBoardPoint]);

  const waitForCanvasImageTask = useCallback(async (taskId: string, runId: number) => {
    for (let index = 0; index < CANVAS_IMAGE_MAX_POLLS; index += 1) {
      const task = await getCanvasImageTask(taskId);
      if (executionRunRef.current !== runId) return null;
      const nextStatus = taskRunningStatus(task.status);
      setExecutionStatus(nextStatus);
      if (taskSucceeded(task)) return task;
      if (taskFailed(task)) {
        throw new Error(task.error || `Canvas image task ${task.status}.`);
      }
      setStatusText(`Canvas image task ${task.status}`);
      publishTask({
        status: nextStatus === "pending" ? "pending" : "running",
        label: "Canvas image running",
        detail: `${task.status}${taskId ? ` · ${taskId}` : ""}`,
        startedAt: Date.now()
      });
      await delay(CANVAS_IMAGE_POLL_MS);
    }
    throw new Error("Canvas image task timed out before returning a result.");
  }, [publishTask]);

  const insertOrUpdateWorkflowOutputNode = useCallback((
    sourceNode: CanvasNode,
    result: GenerateRecord,
    images: string[],
    mode: string,
    workflowJson: string
  ) => {
    if (!images.length) throw new Error("Canvas workflow finished without image output.");
    const sourceId = nodeId(sourceNode);
    if (!sourceId) throw new Error("Selected workflow node has no id.");
    const currentConnections = connectionsRef.current;
    const currentNodes = nodesRef.current;
    const existingOutputId = currentConnections
      .filter((connection) => connectionFrom(connection) === sourceId)
      .map((connection) => connectionTo(connection))
      .find((targetId) => nodeType(currentNodes.find((node) => nodeId(node) === targetId) || {}) === "output");
    const outputId = existingOutputId || nextStableId("output");
    const taskId = result.task_id || result.taskId || "";
    const prompt = result.prompt || nodeEditableText(sourceNode);
    const comparisonPatch = imageComparisonPatch(images, firstComparableImageForNode(sourceNode, nodesRef.current, connectionsRef.current));
    const outputPatch: CanvasNode = {
      prompt,
      model: result.model || String(sourceNode.model || ""),
      provider_id: result.provider_id || String(sourceNode.providerId || sourceNode.provider_id || ""),
      task_id: taskId,
      source_node_id: sourceId,
      source: "Canvas workflow execution",
      status: "succeeded",
      params: {
        ...(result.params || {}),
        canvas_id: activeCanvas?.id || "",
        source_node_id: sourceId,
        workflow_json: workflowJson,
        mode,
        task_id: taskId
      }
    };
    if (!existingOutputId) {
      const createdConnection: CanvasConnection = { id: nextStableId("link"), from: sourceId, to: outputId };
      setConnections((current) => [...current, createdConnection]);
    }
    setNodes((current) => {
      let outputUpdated = false;
      const nextNodes = current.map((node) => {
        if (nodeId(node) === sourceId) {
          return {
            ...node,
            generatedOutputs: images.filter((url) => !isVideoUrl(url)),
            runStatus: "succeeded",
            runError: "",
            running: false,
            task_id: taskId,
            workflow_json: workflowJson || node.workflow_json,
            status: "succeeded"
          };
        }
        if (nodeId(node) === outputId) {
          outputUpdated = true;
          const currentImages = Array.isArray(node.images) ? node.images : [];
          return {
            ...node,
            ...outputPatch,
            images: [...currentImages, ...images],
            ...(Object.keys(comparisonPatch).length ? { imageComparisons: mergeImageComparisons(node.imageComparisons, comparisonPatch) } : {})
          };
        }
        return node;
      });
      if (!outputUpdated) {
        const fallbackPosition = visibleBoardPoint(360, 260, { x: 96, y: 0 });
        const outputPosition = findNonOverlappingOutputPosition(sourceNode, current, 360, 260, fallbackPosition);
        nextNodes.push({
          id: outputId,
          type: "output",
          x: Math.round(outputPosition.x),
          y: Math.round(outputPosition.y),
          w: 360,
          h: 260,
          name: `${nodeTitle(sourceNode)} output`,
          images,
          ...(Object.keys(comparisonPatch).length ? { imageComparisons: comparisonPatch } : {}),
          ...outputPatch
        });
      }
      return nextNodes;
    });
    setExecutionLastUrl(images[0]);
    setExecutionOutputCount(images.length);
    markDirty(`${images.length} workflow output image${images.length === 1 ? "" : "s"} updated`);
  }, [activeCanvas?.id, markDirty, nextStableId, visibleBoardPoint]);

  const insertOrUpdateVideoOutputNode = useCallback((
    sourceNode: CanvasNode,
    result: CanvasVideoResponse,
    videos: string[],
    context: CanvasVideoRunContext
  ) => {
    if (!videos.length) throw new Error("Canvas video finished without video output.");
    const sourceId = nodeId(sourceNode);
    if (!sourceId) throw new Error("Selected video node has no id.");
    const currentConnections = connectionsRef.current;
    const currentNodes = nodesRef.current;
    const existingOutputId = currentConnections
      .filter((connection) => connectionFrom(connection) === sourceId)
      .map((connection) => connectionTo(connection))
      .find((targetId) => nodeType(currentNodes.find((node) => nodeId(node) === targetId) || {}) === "output");
    const outputId = existingOutputId || nextStableId("output");
    const taskId = result.task_id || "";
    const providerId = String(sourceNode.providerId || sourceNode.provider_id || "");
    const model = String(sourceNode.model || "");
    const outputPatch: CanvasNode = {
      prompt: context.prompt,
      model,
      provider_id: providerId,
      task_id: taskId,
      source_node_id: sourceId,
      source: "Canvas video execution",
      status: "succeeded",
      params: {
        canvas_id: activeCanvas?.id || "",
        source_node_id: sourceId,
        task_id: taskId,
        provider_id: providerId,
        model,
        duration: clampInt(sourceNode.duration, 5, 1, 60),
        aspect_ratio: String(sourceNode.aspectRatio || "16:9"),
        resolution: String(sourceNode.resolution || ""),
        reference_images: context.images,
        videos: context.videos
      }
    };
    if (!existingOutputId) {
      const createdConnection: CanvasConnection = { id: nextStableId("link"), from: sourceId, to: outputId };
      setConnections((current) => [...current, createdConnection]);
    }
    setNodes((current) => {
      let outputUpdated = false;
      const nextNodes = current.map((node) => {
        if (nodeId(node) === sourceId) {
          const existingGeneratedImages = outputUrlValues(node.generatedOutputs).filter((url) => !isVideoUrl(url));
          return {
            ...node,
            videos,
            generatedOutputs: existingGeneratedImages,
            runStatus: "succeeded",
            runError: "",
            running: false,
            task_id: taskId,
            status: "succeeded"
          };
        }
        if (nodeId(node) === outputId) {
          outputUpdated = true;
          const currentImages = Array.isArray(node.images) ? node.images : [];
          const currentVideos = Array.isArray(node.videos) ? node.videos : [];
          return {
            ...node,
            ...outputPatch,
            images: [...currentImages, ...videos],
            videos: [...currentVideos, ...videos]
          };
        }
        return node;
      });
      if (!outputUpdated) {
        const fallbackPosition = visibleBoardPoint(360, 260, { x: 96, y: 0 });
        const outputPosition = findNonOverlappingOutputPosition(sourceNode, current, 360, 260, fallbackPosition);
        nextNodes.push({
          id: outputId,
          type: "output",
          x: Math.round(outputPosition.x),
          y: Math.round(outputPosition.y),
          w: 360,
          h: 260,
          name: `${nodeTitle(sourceNode)} video output`,
          images: videos,
          videos,
          ...outputPatch
        });
      }
      return nextNodes;
    });
    setExecutionLastUrl(videos[0]);
    setExecutionOutputCount(videos.length);
    markDirty(`${videos.length} generated video${videos.length === 1 ? "" : "s"} updated`);
  }, [activeCanvas?.id, markDirty, nextStableId, visibleBoardPoint]);

  const runCanvasGeneratorNode = useCallback(async (
    sourceNode: CanvasNode,
    context: CanvasWorkflowRunContext,
    runId: number
  ): Promise<{ result: GenerateRecord; images: string[]; workflowJson: string; mode: string }> => {
    const prompt = context.prompt || (context.references.length ? "Edit the reference images." : "");
    if (!prompt && !context.references.length) {
      throw new Error("Connect prompt text or an image/output reference before running the generator.");
    }
    const providerId = String(sourceNode.providerId || sourceNode.provider_id || selectedExecutionProvider?.id || "comfly");
    const model = String(sourceNode.model || executionModel || executionModelOptions[0] || apiConfig?.image_model || "gpt-image-2");
    const count = clampInt(sourceNode.count, 1, 1, 8);
    const payload = {
      prompt: prompt || "Edit the reference images.",
      provider_id: providerId,
      model,
      size: canvasGeneratorSize(sourceNode),
      quality: String(sourceNode.quality || executionQuality || "auto"),
      reference_images: context.references.slice(0, 4)
    };
    setExecutionProviderId((current) => current || providerId);
    setExecutionModel((current) => current || model);
    const created = await Promise.all(Array.from({ length: count }, () => createCanvasImageTask(payload)));
    if (executionRunRef.current !== runId) throw new Error("Canvas generator run was replaced.");
    setExecutionTaskId(created.map((task) => task.task_id).join(", "));
    const tasks = await Promise.all(created.map((task) => waitForCanvasImageTask(task.task_id, runId)));
    if (executionRunRef.current !== runId) throw new Error("Canvas generator run was replaced.");
    const images = tasks.flatMap((task) => resultImages(task?.result || null));
    if (!images.length) throw new Error("Canvas generator completed without image output.");
    const result: GenerateRecord = {
      ...(tasks.find((task) => task?.result)?.result || {}),
      timestamp: Date.now() / 1000,
      prompt: payload.prompt,
      images,
      type: "online",
      status: "succeeded",
      model,
      provider_id: providerId,
      task_id: created[0]?.task_id || "",
      params: {
        provider_id: providerId,
        model,
        size: payload.size,
        quality: payload.quality,
        reference_images: payload.reference_images,
        count
      }
    };
    return { result, images, workflowJson: "canvas-image-tasks", mode: "generator" };
  }, [apiConfig?.image_model, executionModel, executionModelOptions, executionQuality, selectedExecutionProvider, waitForCanvasImageTask]);

  const runCanvasMsGenNode = useCallback(async (
    sourceNode: CanvasNode,
    context: CanvasWorkflowRunContext
  ): Promise<{ result: GenerateRecord; images: string[]; workflowJson: string; mode: string }> => {
    const prompt = context.prompt;
    const refs = context.references;
    const modelKey = String(sourceNode.msgenModel || "zimage") as CanvasMsGenModelKey;
    const modelInfo = CANVAS_MS_GEN_MODELS[modelKey] || CANVAS_MS_GEN_MODELS.zimage;
    if (!prompt) throw new Error("Connect prompt text before running ModelScope generation.");
    if (modelInfo.supportsImage && !refs.length) throw new Error("Connect an image or output reference before running this ModelScope mode.");
    let width = clampInt(sourceNode.msWidth, 1024, 64, 8192);
    let height = clampInt(sourceNode.msHeight, 1024, 64, 8192);
    if (sourceNode.fitImage && refs[0]?.url) {
      try {
        const dimensions = await imageDimensions(refs[0].url);
        width = dimensions.width;
        height = dimensions.height;
      } catch {
        // Keep configured dimensions when the browser cannot read the reference image size.
      }
    }
    const imageUrls = refs.slice(0, 3).map((ref) => ref.url).filter(Boolean);
    let raw: { url?: string; images?: string[]; task_id?: string; status?: string; detail?: unknown };
    if (modelKey === "zimage") {
      raw = await generateCloudImage({
        prompt,
        resolution: `${width}x${height}`,
        type: "zimage",
        client_id: clientId
      });
    } else if (modelKey === "qwen_edit") {
      raw = await generateAngleCloud({
        prompt,
        type: "angle",
        model: modelInfo.modelId,
        image_urls: imageUrls,
        client_id: clientId
      });
    } else {
      raw = await generateMsImage({
        prompt,
        model: modelInfo.modelId,
        image_urls: imageUrls,
        width,
        height,
        loras: sourceNode.kleinLora ? { "Daniel8152/Klein-enhance": Number(sourceNode.kleinLoraStrength ?? 0.8) } : undefined,
        client_id: clientId
      });
    }
    const images = responseImageUrls(raw);
    if (!images.length) throw new Error("ModelScope generation completed without image output.");
    const result: GenerateRecord = {
      ...raw,
      timestamp: Date.now() / 1000,
      prompt,
      images,
      type: modelKey,
      status: raw.status || "succeeded",
      model: modelInfo.modelId,
      task_id: raw.task_id || "",
      params: {
        model_key: modelKey,
        model: modelInfo.modelId,
        width,
        height,
        reference_images: refs,
        fitImage: Boolean(sourceNode.fitImage),
        kleinLora: Boolean(sourceNode.kleinLora),
        kleinLoraStrength: Number(sourceNode.kleinLoraStrength ?? 0.8)
      }
    };
    return { result, images, workflowJson: modelKey, mode: "msgen" };
  }, [clientId]);

  const runCanvasComfyNode = useCallback(async (
    sourceNode: CanvasNode,
    context: CanvasWorkflowRunContext
  ): Promise<{ result: GenerateRecord; images: string[]; workflowJson: string; mode: string }> => {
    const mode = canvasWorkflowMode(sourceNode);
    const prompt = context.prompt;
    const refs = context.references;
    const uploadRef = async (ref: AIReference, index: number) => {
      const uploaded = await uploadCanvasUrlToComfy(ref.url, ref.name || `canvas-input-${index + 1}.png`);
      return uploaded.comfy_name;
    };
    let workflowJson = "Z-Image.json";
    let result: GenerateRecord;
    if (mode === "text") {
      if (!prompt) throw new Error("Connect prompt text before running ComfyUI text mode.");
      const dimensions = canvasWorkflowDimensions(sourceNode);
      result = await generateCanvasWorkflow({
        prompt,
        width: dimensions.width,
        height: dimensions.height,
        workflow_json: workflowJson,
        type: "zimage",
        client_id: clientId
      });
    } else if (mode === "enhance") {
      if (!refs.length) throw new Error("Connect an image or output reference before running enhance mode.");
      workflowJson = "Z-Image-Enhance.json";
      const inputName = await uploadRef(refs[0], 0);
      result = await generateCanvasWorkflow({
        workflow_json: workflowJson,
        params: {
          "15": { image: inputName },
          "204": { value: Number(sourceNode.enhanceStrength ?? 0.5) }
        },
        type: "enhance",
        client_id: clientId
      });
    } else if (mode === "edit") {
      if (!prompt) throw new Error("Connect prompt text before running edit mode.");
      if (!refs.length) throw new Error("Connect an image or output reference before running edit mode.");
      workflowJson = "Flux2-Klein.json";
      const names = await Promise.all(refs.slice(0, 3).map((ref, index) => uploadRef(ref, index)));
      result = await generateCanvasWorkflow({
        prompt,
        workflow_json: workflowJson,
        type: "klein",
        params: {
          "168": { text: prompt },
          "158": { noise_seed: Math.floor(Math.random() * 1000000) },
          "278": { image: names[0] || "" },
          "270": { image: names[1] || "" },
          "292": { image: names[2] || "" },
          "313": { value: Boolean(names[1]) },
          "314": { value: Boolean(names[2]) }
        },
        client_id: clientId
      });
    } else {
      workflowJson = stringField(sourceNode.comfyWorkflow) || stringField(sourceNode.workflow_json);
      if (!workflowJson) throw new Error("Choose a custom workflow name before running custom mode.");
      const workflowDetail = workflowDetails[workflowJson] || await getComfyWorkflow(workflowJson);
      if (!workflowDetails[workflowJson]) {
        setWorkflowDetails((current) => ({ ...current, [workflowJson]: workflowDetail }));
        setWorkflowDetailStatus((current) => ({ ...current, [workflowJson]: "ready" }));
      }
      const fields = workflowDetail.config?.fields || [];
      const params: Record<string, Record<string, unknown>> = {};
      let customPrompt = prompt;
      const setParam = (field: ComfyWorkflowField, value: unknown) => {
        const nodeKey = String(field.node || "").trim();
        const inputKey = String(field.input || "").trim();
        if (!nodeKey || !inputKey) return;
        params[nodeKey] = params[nodeKey] || {};
        params[nodeKey][inputKey] = value;
      };
      if (fields.length) {
        const imageFields = fields.filter((field) => comfyFieldKind(field) === "image");
        for (let index = 0; index < imageFields.length; index += 1) {
          const ref = refs[index];
          if (ref?.url) {
            const inputName = await uploadRef(ref, index);
            setParam(imageFields[index], inputName);
          }
        }
        const promptFields = fields.filter((field) => comfyFieldKind(field) === "prompt");
        const configuredPrompt = promptFields.map((field) => String(comfyParamValue(sourceNode, field) || "").trim()).filter(Boolean).join("\n\n");
        const promptValue = prompt || configuredPrompt;
        customPrompt = promptValue;
        promptFields.forEach((field) => setParam(field, String(comfyParamValue(sourceNode, field) || promptValue || "")));
        fields.filter((field) => comfyFieldKind(field) === "setting").forEach((field) => {
          const value = comfyRandomEnabled(field) && comfyRandomActive(sourceNode, field.id)
            ? comfyRandomValue(field)
            : comfyParamValue(sourceNode, field);
          setParam(field, value);
        });
      } else {
        Object.entries(comfyParamRecord(sourceNode)).forEach(([key, value]) => {
          if (value && typeof value === "object" && !Array.isArray(value)) {
            params[key] = value as Record<string, unknown>;
          }
        });
      }
      result = await generateCanvasWorkflow({
        prompt: customPrompt,
        workflow_json: workflowJson,
        type: "custom-workflow",
        params,
        client_id: clientId
      });
    }
    const images = assertCanvasWorkflowResult(result, `ComfyUI ${mode} failed`);
    return { result, images, workflowJson, mode };
  }, [clientId, workflowDetails]);

  const runSelectedWorkflowNode = useCallback(async () => {
    const sourceNode = selectedNode;
    if (!activeCanvas || !sourceNode || !isCanvasWorkflowExecutionNode(sourceNode)) {
      const message = "Open a canvas and select a generator or workflow node before running.";
      setExecutionError(message);
      publishTask({ status: "failed", label: "Canvas workflow blocked", detail: message, error: message });
      return;
    }
    const sourceId = nodeId(sourceNode);
    const runId = executionRunRef.current + 1;
    executionRunRef.current = runId;
    const context = workflowGraphRunContext(sourceNode, selectedGraphContext);
    const mode = canvasWorkflowMode(sourceNode);
    setExecutionStatus("pending");
    setExecutionTaskId("");
    setExecutionError("");
    setExecutionOutputCount(0);
    setExecutionLastUrl("");
    setStatusText(`Running Canvas ${mode}`);
    setNodes((current) => current.map((node) => nodeId(node) === sourceId ? {
      ...node,
      running: true,
      runStatus: "running",
      runError: ""
    } : node));
    publishTask({
      status: "running",
      label: "Canvas workflow running",
      detail: `${nodeTitle(sourceNode)} · ${mode}`,
      prompt: context.prompt,
      startedAt: Date.now()
    });
    try {
      const execution = nodeType(sourceNode) === "generator"
        ? await runCanvasGeneratorNode(sourceNode, context, runId)
        : nodeType(sourceNode) === "msgen"
        ? await runCanvasMsGenNode(sourceNode, context)
        : await runCanvasComfyNode(sourceNode, context);
      if (executionRunRef.current !== runId) return;
      insertOrUpdateWorkflowOutputNode(sourceNode, execution.result, execution.images, execution.mode, execution.workflowJson);
      setExecutionStatus("succeeded");
      setExecutionError("");
      setStatusText("Canvas workflow output updated");
      publishTask({
        status: "succeeded",
        label: "Canvas workflow complete",
        detail: `${execution.images.length} output image${execution.images.length === 1 ? "" : "s"} updated`,
        prompt: context.prompt
      });
    } catch (error) {
      if (executionRunRef.current !== runId) return;
      const message = error instanceof Error ? error.message : "Canvas workflow execution failed.";
      setExecutionStatus("failed");
      setExecutionError(message);
      setStatusText("Canvas workflow execution failed");
      setNodes((current) => current.map((node) => nodeId(node) === sourceId ? {
        ...node,
        running: false,
        runStatus: "failed",
        runError: message
      } : node));
      markDirty("Canvas workflow run failed");
      publishTask({ status: "failed", label: "Canvas workflow failed", detail: message, prompt: context.prompt, error: message });
    }
  }, [
    activeCanvas,
    insertOrUpdateWorkflowOutputNode,
    markDirty,
    publishTask,
    runCanvasComfyNode,
    runCanvasGeneratorNode,
    runCanvasMsGenNode,
    selectedGraphContext,
    selectedNode
  ]);

  const runSelectedLLMNode = useCallback(async () => {
    const sourceNode = selectedNode;
    if (!activeCanvas || !sourceNode || nodeType(sourceNode) !== "llm") {
      const message = "Open a canvas and select an LLM node before running.";
      setExecutionError(message);
      publishTask({ status: "failed", label: "Canvas LLM blocked", detail: message, error: message });
      return;
    }
    const context = llmGraphRunContext(sourceNode, selectedGraphContext);
    const sourceId = nodeId(sourceNode);
    if (!context.message) {
      const message = canvasLLMMode(sourceNode) === "chat"
        ? "Enter a chat message before running the LLM node."
        : "Add direct text or connect a prompt/text/LLM output before running the LLM node.";
      setExecutionError(message);
      setNodes((current) => current.map((node) => nodeId(node) === sourceId ? { ...node, runStatus: "failed", runError: message } : node));
      markDirty("Canvas LLM input missing");
      publishTask({ status: "failed", label: "Canvas LLM blocked", detail: message, error: message });
      return;
    }
    const mode = canvasLLMMode(sourceNode);
    const provider = String(sourceNode.llmProvider || sourceNode.providerId || "comfly");
    const model = String(sourceNode.model || capabilityModel(apiConfig, capabilityProvider(apiConfig, "chat"), "chat") || "");
    const msModel = provider === "modelscope" ? String(sourceNode.llmMsModel || model) : "";
    const messages = normalizeCanvasLLMMessages(sourceNode.messages);
    const history = mode === "chat" ? messages : [];
    const runId = executionRunRef.current + 1;
    executionRunRef.current = runId;
    setExecutionStatus("running");
    setExecutionTaskId("");
    setExecutionError("");
    setExecutionOutputCount(0);
    setExecutionLastUrl("");
    setStatusText("Running Canvas LLM node");
    setNodes((current) => current.map((node) => nodeId(node) === sourceId ? {
      ...node,
      running: true,
      runStatus: "running",
      runError: ""
    } : node));
    publishTask({
      status: "running",
      label: "Canvas LLM running",
      detail: `${provider} · ${model || "default model"} · ${mode}`,
      prompt: context.message,
      startedAt: Date.now()
    });
    try {
      const result = await runCanvasLLM({
        message: context.message,
        model,
        ms_model: msModel,
        provider,
        system_prompt: String(sourceNode.systemPrompt || "You are a helpful assistant."),
        messages: history,
        images: context.images
      });
      if (executionRunRef.current !== runId) return;
      const text = String(result.text || "").trim();
      if (!text) throw new Error("LLM returned empty output.");
      const nextMessages = mode === "chat"
        ? [...messages, { role: "user", content: context.message }, { role: "assistant", content: text }]
        : messages;
      setNodes((current) => current.map((node) => nodeId(node) === sourceId ? {
        ...node,
        outputText: text,
        messages: nextMessages,
        chatInput: mode === "chat" ? "" : node.chatInput,
        running: false,
        runStatus: "succeeded",
        runError: "",
        model: result.model || model || node.model,
        raw_usage: result.raw_usage ?? node.raw_usage
      } : node));
      setExecutionStatus("succeeded");
      setExecutionError("");
      setStatusText("Canvas LLM output updated");
      markDirty("Canvas LLM output updated");
      publishTask({
        status: "succeeded",
        label: "Canvas LLM complete",
        detail: `${text.length} characters written to outputText`,
        prompt: context.message
      });
    } catch (error) {
      if (executionRunRef.current !== runId) return;
      const message = error instanceof Error ? error.message : "Canvas LLM execution failed.";
      setExecutionStatus("failed");
      setExecutionError(message);
      setStatusText("Canvas LLM execution failed");
      setNodes((current) => current.map((node) => nodeId(node) === sourceId ? {
        ...node,
        running: false,
        runStatus: "failed",
        runError: message
      } : node));
      markDirty("Canvas LLM run failed");
      publishTask({ status: "failed", label: "Canvas LLM failed", detail: message, prompt: context.message, error: message });
    }
  }, [activeCanvas, apiConfig, markDirty, publishTask, selectedGraphContext, selectedNode]);

  const runSelectedVideoNode = useCallback(async () => {
    const sourceNode = selectedNode;
    if (!activeCanvas || !sourceNode || nodeType(sourceNode) !== "video") {
      const message = "Open a canvas and select a video node before running.";
      setExecutionError(message);
      publishTask({ status: "failed", label: "Canvas video blocked", detail: message, error: message });
      return;
    }
    const context = videoGraphRunContext(sourceNode, selectedGraphContext);
    const sourceId = nodeId(sourceNode);
    if (!context.prompt) {
      const message = "Connect prompt text or enter prompt text before running the video node.";
      setExecutionError(message);
      setNodes((current) => current.map((node) => nodeId(node) === sourceId ? { ...node, runStatus: "failed", runError: message } : node));
      markDirty("Canvas video input missing");
      publishTask({ status: "failed", label: "Canvas video blocked", detail: message, error: message });
      return;
    }
    const providerId = String(sourceNode.providerId || sourceNode.provider_id || capabilityProvider(apiConfig, "video")?.id || "comfly");
    const model = String(sourceNode.model || capabilityModel(apiConfig, capabilityProvider(apiConfig, "video"), "video") || "veo3-fast");
    const runId = executionRunRef.current + 1;
    executionRunRef.current = runId;
    setExecutionStatus("running");
    setExecutionTaskId("");
    setExecutionError("");
    setExecutionOutputCount(0);
    setExecutionLastUrl("");
    setStatusText("Running Canvas video node");
    setNodes((current) => current.map((node) => nodeId(node) === sourceId ? {
      ...node,
      running: true,
      runStatus: "running",
      runError: ""
    } : node));
    publishTask({
      status: "running",
      label: "Canvas video running",
      detail: `${providerId} · ${model}`,
      prompt: context.prompt,
      startedAt: Date.now()
    });
    try {
      const result = await runCanvasVideo({
        prompt: context.prompt,
        provider_id: providerId,
        model,
        duration: clampInt(sourceNode.duration, 5, 1, 60),
        aspect_ratio: String(sourceNode.aspectRatio || "16:9"),
        resolution: String(sourceNode.resolution || ""),
        images: context.images,
        videos: context.videos,
        enhance_prompt: Boolean(sourceNode.enhancePrompt),
        enable_upsample: Boolean(sourceNode.enableUpsample),
        watermark: Boolean(sourceNode.watermark),
        camera_fixed: Boolean(sourceNode.cameraFixed),
        generate_audio: Boolean(sourceNode.generateAudio)
      });
      if (executionRunRef.current !== runId) return;
      const videos = (result.videos || []).map((url) => String(url || "").trim()).filter(Boolean);
      if (!videos.length) throw new Error("Video endpoint returned no video outputs.");
      insertOrUpdateVideoOutputNode(sourceNode, result, videos, context);
      setExecutionStatus("succeeded");
      setExecutionTaskId(result.task_id || "");
      setExecutionError("");
      setStatusText("Canvas video output updated");
      publishTask({
        status: "succeeded",
        label: "Canvas video complete",
        detail: `${videos.length} video output${videos.length === 1 ? "" : "s"} updated`,
        prompt: context.prompt
      });
    } catch (error) {
      if (executionRunRef.current !== runId) return;
      const message = error instanceof Error ? error.message : "Canvas video execution failed.";
      setExecutionStatus("failed");
      setExecutionError(message);
      setStatusText("Canvas video execution failed");
      setNodes((current) => current.map((node) => nodeId(node) === sourceId ? {
        ...node,
        running: false,
        runStatus: "failed",
        runError: message
      } : node));
      markDirty("Canvas video run failed");
      publishTask({ status: "failed", label: "Canvas video failed", detail: message, prompt: context.prompt, error: message });
    }
  }, [activeCanvas, apiConfig, insertOrUpdateVideoOutputNode, markDirty, publishTask, selectedGraphContext, selectedNode]);

  const runSelectedCanvasNode = useCallback(async () => {
    const sourceNode = selectedNode;
    if (!activeCanvas || !sourceNode) {
      const message = "Open a canvas and select a prompt, image, or output node before running.";
      setExecutionError(message);
      publishTask({ status: "failed", label: "Canvas image blocked", detail: message, error: message });
      return;
    }
    if (!supportsNativeImageExecution(sourceNode)) {
      const message = isCanvasWorkflowExecutionNode(sourceNode)
        ? "Use Workflow execution for generator and ComfyUI nodes."
        : nodeType(sourceNode) === "llm"
        ? "Use LLM execution for LLM nodes."
        : nodeType(sourceNode) === "video"
        ? "Use video execution for video nodes."
        : "This node exposes execution data only.";
      setExecutionError(message);
      publishTask({ status: "idle", label: "Canvas execution preview only", detail: message });
      return;
    }
    const provider = selectedExecutionProvider;
    const model = executionModel || executionModelOptions[0] || apiConfig?.image_model || "gpt-image-2";
    if (!provider || !model) {
      const message = "Image provider unavailable. Add an image model in API / Models.";
      setExecutionError(message);
      publishTask({ status: "failed", label: "Canvas image blocked", detail: message, error: message });
      return;
    }
    if (!executionProviderReady) {
      const message = `${provider.name || provider.id} key missing. Add a provider key in API / Models.`;
      setExecutionError(message);
      publishTask({ status: "failed", label: "Canvas image blocked", detail: message, error: message });
      return;
    }
    const context = buildExecutionContext(sourceNode);
    if (!context) {
      publishTask({ status: "failed", label: "Canvas image blocked", detail: "Prompt context missing", error: "Prompt context missing" });
      return;
    }

    const runId = executionRunRef.current + 1;
    executionRunRef.current = runId;
    setExecutionStatus("pending");
    setExecutionTaskId("");
    setExecutionError("");
    setExecutionOutputCount(0);
    setExecutionLastUrl("");
    setStatusText("Submitting Canvas image task");
    publishTask({
      status: "running",
      label: "Canvas image running",
      detail: `${provider.name || provider.id} · ${model}`,
      prompt: context.prompt,
      startedAt: Date.now()
    });

    try {
      const created = await createCanvasImageTask({
        prompt: context.prompt,
        provider_id: provider.id,
        model,
        size: executionSize,
        quality: executionQuality,
        reference_images: context.references
      });
      if (executionRunRef.current !== runId) return;
      setExecutionTaskId(created.task_id);
      setExecutionStatus(taskRunningStatus(created.status));
      setStatusText(`Canvas image task ${created.status}`);
      const task = await waitForCanvasImageTask(created.task_id, runId);
      if (!task || executionRunRef.current !== runId) return;
      const result = task.result;
      if (!result || !resultImages(result).length) throw new Error("Canvas image task completed without usable images.");
      insertExecutionOutputNode(context.sourceNode, result, created.task_id, provider.id, model);
      setExecutionStatus("succeeded");
      setExecutionError("");
      setStatusText("Canvas image output inserted");
      publishTask({
        status: "succeeded",
        label: "Canvas image complete",
        detail: `${resultImages(result).length} output image${resultImages(result).length === 1 ? "" : "s"} inserted`,
        prompt: context.prompt
      });
    } catch (error) {
      if (executionRunRef.current !== runId) return;
      const message = error instanceof Error ? error.message : "Canvas image execution failed.";
      setExecutionStatus("failed");
      setExecutionError(message);
      setStatusText("Canvas image execution failed");
      publishTask({ status: "failed", label: "Canvas image failed", detail: message, prompt: context.prompt, error: message });
    }
  }, [
    activeCanvas,
    apiConfig?.image_model,
    buildExecutionContext,
    executionModel,
    executionModelOptions,
    executionProviderReady,
    executionQuality,
    executionSize,
    insertExecutionOutputNode,
    publishTask,
    selectedExecutionProvider,
    selectedNode,
    waitForCanvasImageTask
  ]);

  const handleImageUpload = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadingImage(true);
    setErrorText("");
    publishTask({ status: "running", label: "Canvas upload", detail: file.name });
    try {
      const response = await uploadAiReferenceImage(file, file.name);
      const uploaded = response.files?.[0];
      if (!uploaded?.url) throw new Error("Upload did not return a usable image URL.");
      addNodesFromIntake([{
        url: uploaded.url,
        title: uploaded.name || file.name,
        source: "Uploaded image",
        type: "image"
      }], "Uploaded image");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image upload failed.";
      setErrorText(message);
      publishTask({ status: "failed", label: "Canvas upload failed", detail: message, error: message });
    } finally {
      setUploadingImage(false);
    }
  }, [addNodesFromIntake, publishTask]);

  const checkAssetItemsAvailability = useCallback(async (items: CanvasAssetItem[]) => {
    const urls = Array.from(new Set(items.filter((item) => item.localCandidate).map((item) => item.url)));
    if (!urls.length) return {};
    const response = await checkCanvasAssets(urls);
    const next: Record<string, boolean> = {};
    urls.forEach((url) => {
      next[url] = Boolean(response.exists?.[url]);
    });
    setAssetAvailability((current) => ({ ...current, ...next }));
    return next;
  }, []);

  const checkCanvasAssetAvailability = useCallback(async () => {
    setAssetActionError("");
    if (!assetItems.length) {
      setAssetActionStatus("empty");
      setAssetActionText("No image, output, or video assets found on this canvas.");
      publishTask({ status: "idle", label: "Canvas assets empty", detail: "No assets found" });
      return;
    }
    if (!localAssetItems.length) {
      const detail = `${assetItems.length} remote or data asset${assetItems.length === 1 ? "" : "s"} skipped; no local assets can be zipped.`;
      setAssetActionStatus("empty");
      setAssetActionText(detail);
      publishTask({ status: "idle", label: "Canvas assets empty", detail });
      return;
    }
    setAssetActionStatus("pending");
    setAssetActionText("Checking local canvas assets...");
    publishTask({ status: "running", label: "Canvas asset check", detail: `${localAssetItems.length} local candidates` });
    try {
      const checked = await checkAssetItemsAvailability(localAssetItems);
      const availableCount = localAssetItems.filter((item) => checked[item.url]).length;
      const partial = availableCount < localAssetItems.length || skippedAssetCount > 0;
      const status: CanvasAssetActionStatus = availableCount === 0 ? "empty" : partial ? "partial" : "succeeded";
      const skipped = skippedAssetCount ? ` · ${skippedAssetCount} remote/data skipped` : "";
      const detail = `${availableCount}/${localAssetItems.length} local asset${localAssetItems.length === 1 ? "" : "s"} available${skipped}.`;
      setAssetActionStatus(status);
      setAssetActionText(detail);
      publishTask({ status: availableCount ? "succeeded" : "idle", label: "Canvas asset check complete", detail });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Canvas asset check failed.";
      setAssetActionStatus("failed");
      setAssetActionError(message);
      setAssetActionText("Canvas asset check failed.");
      publishTask({ status: "failed", label: "Canvas asset check failed", detail: message, error: message });
    }
  }, [assetItems.length, checkAssetItemsAvailability, localAssetItems, publishTask, skippedAssetCount]);

  const downloadAllCanvasAssets = useCallback(async () => {
    setAssetActionError("");
    if (!assetItems.length) {
      setAssetActionStatus("empty");
      setAssetActionText("No image, output, or video assets found on this canvas.");
      return;
    }
    if (!localAssetItems.length) {
      setAssetActionStatus("empty");
      setAssetActionText("Only remote/data assets are present; the local zip endpoint would skip them.");
      return;
    }
    setAssetActionStatus("pending");
    setAssetActionText("Preparing local canvas asset zip...");
    publishTask({ status: "running", label: "Canvas asset download", detail: `${localAssetItems.length} local candidates` });
    try {
      let availableItems = downloadableAssetItems;
      if (!availableItems.length) {
        const checked = await checkAssetItemsAvailability(localAssetItems);
        availableItems = localAssetItems.filter((item) => checked[item.url]);
      }
      if (!availableItems.length) {
        const detail = "No checked local assets are available to download.";
        setAssetActionStatus("empty");
        setAssetActionText(detail);
        publishTask({ status: "idle", label: "Canvas asset download empty", detail });
        return;
      }
      const title = activeCanvas ? canvasTitle(activeCanvas) : draftTitle || "canvas";
      const filename = zipFilename(`${title}-assets`, "canvas-assets.zip");
      const blob = await downloadCanvasAssetZip({ urls: availableItems.map((item) => item.url), filename });
      saveBlobDownload(blob, filename);
      const partial = availableItems.length < localAssetItems.length || skippedAssetCount > 0;
      const detail = `${availableItems.length} local asset${availableItems.length === 1 ? "" : "s"} downloaded${partial ? " with skipped/missing assets" : ""}.`;
      setAssetActionStatus(partial ? "partial" : "succeeded");
      setAssetActionText(detail);
      setStatusText("Canvas asset zip downloaded");
      publishTask({ status: "succeeded", label: "Canvas asset download complete", detail });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Canvas asset download failed.";
      setAssetActionStatus("failed");
      setAssetActionError(message);
      setAssetActionText("Canvas asset download failed.");
      publishTask({ status: "failed", label: "Canvas asset download failed", detail: message, error: message });
    }
  }, [
    activeCanvas,
    assetItems.length,
    checkAssetItemsAvailability,
    downloadableAssetItems,
    draftTitle,
    localAssetItems,
    publishTask,
    skippedAssetCount
  ]);

  const downloadSelectedCanvasAsset = useCallback(async () => {
    setAssetActionError("");
    if (!selectedAsset) {
      setAssetActionStatus("empty");
      setAssetActionText("Select a node with an image, output, or video asset first.");
      return;
    }
    if (!selectedAsset.localCandidate) {
      setAssetActionStatus("empty");
      setAssetActionText("Selected asset is remote or data-backed, so the local asset endpoints would skip it.");
      return;
    }
    setAssetActionStatus("pending");
    setAssetActionText("Preparing selected local asset...");
    publishTask({ status: "running", label: "Canvas selected asset download", detail: selectedAsset.name });
    try {
      let available = selectedAssetAvailability;
      if (available === undefined) {
        const checked = await checkAssetItemsAvailability([selectedAsset]);
        available = Boolean(checked[selectedAsset.url]);
      }
      if (!available) {
        const detail = "Selected local asset is not available on disk.";
        setAssetActionStatus("failed");
        setAssetActionText(detail);
        publishTask({ status: "failed", label: "Canvas selected asset missing", detail, error: detail });
        return;
      }
      let blob: Blob;
      let filename = safeDownloadFilename(selectedAsset.name, "canvas-asset");
      if (isOutputCanvasAssetUrl(selectedAsset.url)) {
        const response = await fetch(canvasOutputDownloadUrl(localCanvasAssetPath(selectedAsset.url) || selectedAsset.url, filename));
        if (!response.ok) throw new Error(`/api/download-output failed with ${response.status}`);
        blob = await response.blob();
      } else {
        filename = zipFilename(`${filename}-asset`, "canvas-asset.zip");
        blob = await downloadCanvasAssetZip({ urls: [selectedAsset.url], filename });
      }
      saveBlobDownload(blob, filename);
      const detail = `${selectedAsset.name} downloaded.`;
      setAssetActionStatus("succeeded");
      setAssetActionText(detail);
      setStatusText("Selected canvas asset downloaded");
      publishTask({ status: "succeeded", label: "Canvas selected asset downloaded", detail });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Selected asset download failed.";
      setAssetActionStatus("failed");
      setAssetActionError(message);
      setAssetActionText("Selected asset download failed.");
      publishTask({ status: "failed", label: "Canvas selected asset failed", detail: message, error: message });
    }
  }, [checkAssetItemsAvailability, publishTask, selectedAsset, selectedAssetAvailability]);

  const loadTrash = useCallback((signal?: AbortSignal) => {
    getCanvasTrash(signal)
      .then((response) => {
        setTrash(response.canvases || []);
        setTrashRetentionDays(response.retention_days || 30);
      })
      .catch(() => {
        if (!signal?.aborted) setTrash([]);
      });
  }, []);

  const loadList = useCallback((signal?: AbortSignal) => {
    setLoadingList(true);
    setErrorText("");
    publishTask({ status: "running", label: "Canvas loading", detail: "Loading canvas list" });
    getCanvasList(signal)
      .then((response) => {
        const list = response.canvases || [];
        setCanvases(list);
        publishTask({ status: "idle", label: "Canvas ready", detail: `${list.length} canvases available` });
        if (!list.length && !activeCanvas) setStatusText("No canvases yet. Create one to start.");
      })
      .catch((error) => {
        if (signal?.aborted) return;
        const message = error instanceof Error ? error.message : "Canvas list failed.";
        setErrorText(message);
        publishTask({ status: "failed", label: "Canvas failed", detail: message, error: message });
      })
      .finally(() => {
        if (!signal?.aborted) setLoadingList(false);
      });
  }, [activeCanvas, publishTask]);

  useEffect(() => {
    const abort = new AbortController();
    loadList(abort.signal);
    loadTrash(abort.signal);
    return () => abort.abort();
  }, [loadList, loadTrash]);

  useEffect(() => {
    if (isTaskMessageCanvasUpdate(taskMessage)) {
      loadList();
      loadTrash();
    }
  }, [loadList, loadTrash, taskMessage]);

  useEffect(() => {
    const consume = () => {
      const items = consumeCanvasIntakeItems();
      if (items.length) addNodesFromIntake(items, "Canvas intake");
    };
    consume();
    window.addEventListener(CANVAS_INTAKE_EVENT, consume);
    return () => window.removeEventListener(CANVAS_INTAKE_EVENT, consume);
  }, [addNodesFromIntake]);

  useEffect(() => {
    if (!activeCanvas || !pendingIntakeItems.length) return;
    const items = pendingIntakeItems;
    intakeRequiresTargetRef.current = false;
    setPendingIntakeItems([]);
    addNodesFromIntake(items, "Queued Canvas intake");
  }, [activeCanvas, addNodesFromIntake, pendingIntakeItems]);

  const applyCanvas = useCallback((canvas: CanvasDocument) => {
    const nextNodes = Array.isArray(canvas.nodes) ? canvas.nodes : [];
    const nextConnections = Array.isArray(canvas.connections) ? canvas.connections : [];
    setActiveCanvas(canvas);
    setNodes(nextNodes);
    setConnections(nextConnections);
    setViewport(normalizedViewport(canvas.viewport));
    setDraftTitle(canvasTitle(canvas));
    setDraftIcon(canvasIcon(canvas));
    setBaseUpdatedAt(Number(canvas.updated_at || 0));
    setSelectedNodeId("");
    setLinkSourceId("");
    setSelectedConnectionKey("");
    setHoveredConnectionKey("");
    setLinkPreview(null);
    setConnectionWarning("");
    setLastConnectionAction("Canvas loaded.");
    setPendingNodeDelete("");
    setAssetAvailability({});
    setAssetActionStatus("idle");
    setAssetActionText("Check local asset availability before downloading.");
    setAssetActionError("");
    setImageEditor(null);
    setImageEditorError("");
    setOutputLightbox(null);
    setSaveState("saved");
    setStatusText("Canvas loaded");
    setErrorText("");
    publishTask({ status: "idle", label: "Canvas ready", detail: `${nextNodes.length} nodes loaded` });
  }, [publishTask]);

  const openCanvas = useCallback((canvasId: string) => {
    setOpeningId(canvasId);
    setErrorText("");
    publishTask({ status: "running", label: "Canvas opening", detail: "Loading canvas document" });
    getCanvasDocument(canvasId)
      .then((response) => applyCanvas(response.canvas))
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Canvas open failed.";
        setErrorText(message);
        publishTask({ status: "failed", label: "Canvas failed", detail: message, error: message });
      })
      .finally(() => setOpeningId(""));
  }, [applyCanvas, publishTask]);

  useEffect(() => {
    if (autoOpenedRef.current || activeCanvas || !canvases[0]) return;
    if (intakeRequiresTargetRef.current || pendingIntakeItems.length) {
      setStatusText("Choose a canvas or create a new one to place queued assets.");
      return;
    }
    autoOpenedRef.current = true;
    openCanvas(canvases[0].id);
  }, [activeCanvas, canvases, openCanvas, pendingIntakeItems.length]);

  const createCanvas = useCallback(() => {
    const title = `Canvas ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    setErrorText("");
    publishTask({ status: "running", label: "Canvas creating", detail: "Creating a new canvas" });
    createCanvasDocument({ title, icon: "🧩", kind: "classic" })
      .then((response) => {
        applyCanvas(response.canvas);
        loadList();
        loadTrash();
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Canvas create failed.";
        setErrorText(message);
        publishTask({ status: "failed", label: "Canvas failed", detail: message, error: message });
      });
  }, [applyCanvas, loadList, loadTrash, publishTask]);

  const saveCanvas = useCallback(() => {
    if (!activeCanvas) return;
    setSaveState("saving");
    setStatusText("Saving canvas...");
    publishTask({ status: "running", label: "Canvas saving", detail: canvasTitle(activeCanvas) });
    saveCanvasDocument(activeCanvas.id, {
      title: draftTitle.trim() || canvasTitle(activeCanvas),
      icon: draftIcon.trim() || "🧩",
      nodes,
      connections,
      viewport,
      logs: Array.isArray(activeCanvas.logs) ? activeCanvas.logs : [],
      settings: activeCanvas.settings && typeof activeCanvas.settings === "object" ? activeCanvas.settings : {},
      client_id: clientId,
      base_updated_at: baseUpdatedAt
    })
      .then((response) => {
        applyCanvas(response.canvas);
        setSaveState("saved");
        setStatusText("Saved");
        loadList();
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Canvas save failed.";
        const conflict = message.includes("409");
        setSaveState(conflict ? "conflict" : "failed");
        setErrorText(conflict ? "Canvas was updated elsewhere. Reload before saving again." : message);
        publishTask({
          status: "failed",
          label: conflict ? "Canvas conflict" : "Canvas save failed",
          detail: conflict ? "Reload before saving again" : message,
          error: message
        });
      });
  }, [activeCanvas, applyCanvas, baseUpdatedAt, clientId, connections, draftIcon, draftTitle, loadList, nodes, publishTask, viewport]);

  const softDeleteCanvas = useCallback((canvasId: string) => {
    setErrorText("");
    deleteCanvasDocument(canvasId)
      .then(() => {
        setPendingDeleteId("");
        if (activeCanvas?.id === canvasId) {
          setActiveCanvas(null);
          setNodes([]);
          setConnections([]);
          setSelectedNodeId("");
          setSelectedConnectionKey("");
          setHoveredConnectionKey("");
          setLinkPreview(null);
          setConnectionWarning("");
          setLastConnectionAction("Canvas moved to trash.");
          setAssetAvailability({});
          setAssetActionStatus("idle");
          setAssetActionText("Check local asset availability before downloading.");
          setAssetActionError("");
          setSaveState("idle");
          setStatusText("Canvas moved to trash");
        }
        loadList();
        loadTrash();
      })
      .catch((error) => setErrorText(error instanceof Error ? error.message : "Delete failed."));
  }, [activeCanvas, loadList, loadTrash]);

  const restoreCanvas = useCallback((canvasId: string) => {
    restoreCanvasDocument(canvasId)
      .then((response) => {
        setPendingPurgeId("");
        applyCanvas(response.canvas);
        loadList();
        loadTrash();
      })
      .catch((error) => setErrorText(error instanceof Error ? error.message : "Restore failed."));
  }, [applyCanvas, loadList, loadTrash]);

  const purgeCanvas = useCallback((canvasId: string) => {
    purgeCanvasDocument(canvasId)
      .then(() => {
        setPendingPurgeId("");
        loadTrash();
      })
      .catch((error) => setErrorText(error instanceof Error ? error.message : "Purge failed."));
  }, [loadTrash]);

  const resetView = useCallback(() => {
    setViewport((current) => ({ ...current, ...DEFAULT_VIEWPORT }));
    markDirty("Viewport reset");
  }, [markDirty]);

  const zoomBy = useCallback((factor: number) => {
    setViewport((current) => ({
      ...current,
      scale: Math.min(2.4, Math.max(0.28, current.scale * factor))
    }));
    markDirty("Viewport changed");
  }, [markDirty]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.kind === "pan") {
        const next = {
          ...viewportRef.current,
          x: drag.viewport.x + event.clientX - drag.sx,
          y: drag.viewport.y + event.clientY - drag.sy
        };
        setViewport(next);
        setSaveState((current) => current === "saving" ? current : "dirty");
        return;
      }
      if (drag.kind === "link") {
        const point = boardPointFromClient(event.clientX, event.clientY);
        const target = inputHandleTargetFromPoint(event.clientX, event.clientY, drag.fromId);
        setLinkPreview({
          fromId: drag.fromId,
          current: point,
          targetId: target.targetId || undefined,
          valid: target.valid,
          reason: target.reason
        });
        return;
      }
      const scale = viewportRef.current.scale || 1;
      const nextX = Math.round(drag.x + (event.clientX - drag.sx) / scale);
      const nextY = Math.round(drag.y + (event.clientY - drag.sy) / scale);
      setNodes((current) => current.map((node) => nodeId(node) === drag.id ? { ...node, x: nextX, y: nextY } : node));
      setSaveState((current) => current === "saving" ? current : "dirty");
    };
    const onUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.kind === "link") {
        const target = inputHandleTargetFromPoint(event.clientX, event.clientY, drag.fromId);
        if (target.valid && target.targetId) {
          createLink(drag.fromId, target.targetId, "drag");
        } else {
          setLinkPreview(null);
          setLastConnectionAction("Connection drag canceled.");
          setConnectionWarning(target.reason || "");
          setStatusText(target.reason || "Connection drag canceled.");
        }
      } else {
        markDirty(drag.kind === "pan" ? "Viewport changed" : "Node moved");
      }
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [boardPointFromClient, createLink, inputHandleTargetFromPoint, markDirty]);

  const onBoardPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!activeCanvas || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest(".qc-canvas-node")) return;
    setSelectedConnectionKey("");
    setConnectionWarning("");
    if (linkSourceId) {
      setLinkSourceId("");
      setLastConnectionAction("Inspector link canceled.");
      setStatusText("Connection canceled.");
    }
    setSelectedNodeId("");
    dragRef.current = { kind: "pan", sx: event.clientX, sy: event.clientY, viewport: viewportRef.current };
  }, [activeCanvas, linkSourceId]);

  const onBoardWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (!activeCanvas) return;
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const current = viewportRef.current;
    const beforeX = (event.clientX - rect.left - current.x) / current.scale;
    const beforeY = (event.clientY - rect.top - current.y) / current.scale;
    const scale = Math.min(2.4, Math.max(0.28, current.scale * (event.deltaY > 0 ? 0.92 : 1.08)));
    setViewport({
      ...current,
      x: event.clientX - rect.left - beforeX * scale,
      y: event.clientY - rect.top - beforeY * scale,
      scale
    });
    markDirty("Viewport changed");
  }, [activeCanvas, markDirty]);

  const startNodeDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>, node: CanvasNode) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const id = nodeId(node);
    if (!id) return;
    setSelectedNodeId(id);
    setSelectedConnectionKey("");
    setConnectionWarning("");
    dragRef.current = {
      kind: "node",
      id,
      sx: event.clientX,
      sy: event.clientY,
      x: asNumber(node.x),
      y: asNumber(node.y)
    };
  }, []);

  const startConnectionDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>, node: CanvasNode) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const id = nodeId(node);
    if (!id) return;
    const point = boardPointFromClient(event.clientX, event.clientY);
    dragRef.current = { kind: "link", fromId: id };
    setSelectedNodeId(id);
    setSelectedConnectionKey("");
    setLinkSourceId("");
    setConnectionWarning("");
    setLastConnectionAction("Connection drag started.");
    setLinkPreview({ fromId: id, current: point, valid: false });
    setStatusText("Drag to another node input handle.");
    publishTask({ status: "pending", label: "Canvas linking", detail: `Drag link source: ${id}` });
  }, [boardPointFromClient, publishTask]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.key === "Escape") {
        const drag = dragRef.current;
        if (drag?.kind === "link" || linkPreview || linkSourceId) {
          event.preventDefault();
          dragRef.current = null;
          setLinkPreview(null);
          setLinkSourceId("");
          setConnectionWarning("");
          setLastConnectionAction("Connection canceled.");
          setStatusText("Connection canceled.");
        }
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedConnection) {
        event.preventDefault();
        deleteSelectedConnection();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelectedConnection, linkPreview, linkSourceId, selectedConnection]);

  useEffect(() => {
    const selected = selectedNode;
    const contextIsLLM = selected ? nodeType(selected) === "llm" : false;
    const contextLLMMode = contextIsLLM ? canvasLLMMode(selected) : "";
    const contextLLMRunStatus = contextIsLLM && selected ? String(selected.runStatus || (selected.running ? "running" : "idle")) : "idle";
    const contextLLMRunError = contextIsLLM && selected ? String(selected.runError || "") : "";
    const contextLLMModel = contextIsLLM && selected ? String(selected.model || selected.llmMsModel || "") : "";
    const contextLLMRunContext = contextIsLLM && selected ? llmGraphRunContext(selected, selectedGraphContext) : null;
    const contextLLMOutputPreview = contextIsLLM && selected ? String(selected.outputText || "").trim() : "";
    const contextIsVideo = selected ? nodeType(selected) === "video" : false;
    const contextVideoRunStatus = contextIsVideo && selected ? String(selected.runStatus || (selected.running ? "running" : "idle")) : "idle";
    const contextVideoRunError = contextIsVideo && selected ? String(selected.runError || "") : "";
    const contextVideoModel = contextIsVideo && selected ? String(selected.model || "") : "";
    const contextVideoRunContext = contextIsVideo && selected ? videoGraphRunContext(selected, selectedGraphContext) : null;
    const contextVideoOutputPreview = contextIsVideo && selected ? outputUrlValues(selected.videos)[0] || "" : "";
    const contextWorkflowMode = canvasWorkflowMode(selected);
    const contextWorkflowName = canvasWorkflowName(selected);
    const contextWorkflowRunStatus = selected ? String(selected.runStatus || (selected.running ? "running" : "idle")) : "idle";
    const contextWorkflowRunError = selected ? String(selected.runError || "") : "";
    const contextWorkflowOutputs = selected ? outputUrlValues(selected.generatedOutputs).filter((url) => !isVideoUrl(url)) : [];
    const contextWorkflowLastOutput = contextWorkflowOutputs[0] || "";
    const pendingConnectionState = linkPreview
      ? `Dragging from ${linkPreview.fromId}${linkPreview.targetId ? ` to ${linkPreview.targetId}` : ""}`
      : linkSourceId
      ? `Link source: ${linkSourceId}`
      : "No pending link";
    const detail = activeCanvas
      ? selected
        ? `${nodeLabel(selected)} selected in ${canvasTitle(activeCanvas)}`
        : selectedConnectionLabel
        ? `Link selected in ${canvasTitle(activeCanvas)}`
        : `${nodes.length} nodes loaded`
      : "No canvas selected";
    onContextChange({
      canvasId: activeCanvas?.id,
      canvasTitle: activeCanvas ? canvasTitle(activeCanvas) : "",
      selectedNodeId: selected ? nodeId(selected) : "",
      selectedNodeTitle: selected ? nodeTitle(selected) : "",
      selectedNodeType: selected ? nodeLabel(selected) : "",
      saveState,
      nodeCount: nodes.length,
      connectionCount: connections.length,
      linkState: pendingConnectionState,
      selectedConnectionId: selectedConnection ? connectionId(selectedConnection.connection, selectedConnection.index) : "",
      selectedConnectionLabel,
      pendingConnectionState,
      lastConnectionAction,
      connectionWarning: connectionWarning || selectedConnectionWarning,
      intakeState: lastIntakeText || (pendingIntakeItems.length ? `${pendingIntakeItems.length} queued assets` : "No queued assets"),
      executionStatus,
      executionTaskId,
      executionProvider: selectedExecutionProvider ? selectedExecutionProvider.name || selectedExecutionProvider.id : "",
      executionModel: executionModel || executionModelOptions[0] || "",
      executionOutputCount,
      executionLastUrl,
      executionError,
      selectedExecutionNodeKind: selectedGraphContext?.selectedNodeKind || "",
      graphPromptCount: selectedGraphContext?.promptRefs.length || 0,
      graphImageRefCount: selectedGraphContext?.imageRefs.length || 0,
      graphVideoRefCount: selectedGraphContext?.videoRefs.length || 0,
      graphTextRefCount: selectedGraphContext?.textRefs.length || 0,
      graphInputWarnings: selectedGraphContext?.warnings.join("; ") || "",
      executionDataReady: Boolean(selectedGraphContext?.ready),
      selectedCanvasExecutionMode: contextWorkflowMode,
      selectedCanvasWorkflow: contextWorkflowName,
      selectedCanvasRunStatus: contextWorkflowRunStatus,
      selectedCanvasRunError: contextWorkflowRunError,
      selectedCanvasOutputCount: contextWorkflowOutputs.length,
      selectedCanvasLastOutput: contextWorkflowLastOutput,
      selectedLLMMode: contextLLMMode,
      selectedLLMRunStatus: contextLLMRunStatus,
      selectedLLMRunError: contextLLMRunError,
      selectedLLMModel: contextLLMModel,
      selectedLLMInputCount: contextLLMRunContext ? (contextLLMRunContext.message ? 1 : 0) + contextLLMRunContext.images.length : 0,
      selectedLLMOutputPreview: contextLLMOutputPreview,
      selectedVideoMode: contextIsVideo ? String(selected?.aspectRatio || "16:9") : "",
      selectedVideoRunStatus: contextVideoRunStatus,
      selectedVideoRunError: contextVideoRunError,
      selectedVideoModel: contextVideoModel,
      selectedVideoInputCount: contextVideoRunContext ? (contextVideoRunContext.prompt ? 1 : 0) + contextVideoRunContext.images.length + contextVideoRunContext.videos.length : 0,
      selectedVideoOutputPreview: contextVideoOutputPreview,
      assetCount: assetItems.length,
      downloadableAssetCount: downloadableAssetItems.length,
      selectedAssetUrl: selectedAsset?.url || "",
      selectedAssetName: selectedAsset?.name || "",
      assetActionStatus,
      lastAssetActionStatus: assetActionError || assetActionText,
      detail
    });
    if (!activeCanvas) return;
    if (executionStatus !== "idle") return;
    if (saveState === "dirty") {
      publishTask({ status: "pending", label: "Canvas unsaved", detail });
    } else if (saveState === "saved") {
      publishTask({ status: "idle", label: "Canvas ready", detail });
    }
  }, [
    activeCanvas,
    assetActionError,
    assetActionStatus,
    assetActionText,
    assetItems.length,
    connections.length,
    connectionWarning,
    downloadableAssetItems.length,
    executionError,
    executionLastUrl,
    executionModel,
    executionModelOptions,
    executionOutputCount,
    executionStatus,
    executionTaskId,
    lastIntakeText,
    lastConnectionAction,
    linkPreview,
    linkSourceId,
    nodes.length,
    onContextChange,
    pendingIntakeItems.length,
    publishTask,
    saveState,
    selectedAsset?.name,
    selectedAsset?.url,
    selectedConnection,
    selectedConnectionLabel,
    selectedConnectionWarning,
    selectedExecutionProvider,
    selectedGraphContext,
    selectedNode
  ]);

  const empty = !activeCanvas;
  const selectedKind = selectedNode ? nodeType(selectedNode) : "";
  const selectedExecutionKind = selectedNode ? canvasExecutionNodeKind(selectedNode) : "unknown";
  const selectedName = selectedNode ? String(selectedNode.name || "") : "";
  const selectedText = selectedNode ? nodeEditableText(selectedNode) : "";
  const selectedImageUrl = selectedNode ? nodeImageUrl(selectedNode) : "";
  const selectedMediaUrl = selectedNode && selectedExecutionKind === "video"
    ? outputUrlValues(selectedNode.videos)[0] || selectedImageUrl
    : selectedImageUrl;
  const selectedOutputPreviewItems = selectedNode ? canvasOutputMediaItems(selectedNode).slice(0, 6) : [];
  const selectedWidth = selectedNode ? numberInputValue(selectedNode.w) : "";
  const selectedHeight = selectedNode ? numberInputValue(selectedNode.h) : "";
  const selectedHasLinks = selectedConnections.length > 0;
  const selectedSupportsImageUrl = selectedKind === "image" || selectedKind === "output" || selectedKind === "video";
  const selectedCanRunImageExecution = supportsNativeImageExecution(selectedNode);
  const selectedCanRunWorkflowExecution = isCanvasWorkflowExecutionNode(selectedNode);
  const selectedCanRunLLMExecution = selectedKind === "llm";
  const selectedCanRunVideoExecution = selectedKind === "video";
  const selectedWorkflowMode = canvasWorkflowMode(selectedNode);
  const selectedWorkflowName = canvasWorkflowName(selectedNode);
  const selectedCustomWorkflowName = selectedWorkflowMode === "custom" && selectedNode
    ? stringField(selectedNode.comfyWorkflow) || stringField(selectedNode.workflow_json)
    : "";
  const selectedCustomWorkflowDetail = selectedCustomWorkflowName ? workflowDetails[selectedCustomWorkflowName] : undefined;
  const selectedCustomWorkflowFields = selectedCustomWorkflowDetail?.config?.fields || [];
  const selectedCustomWorkflowSettingFields = selectedCustomWorkflowFields.filter((field) => comfyFieldKind(field) === "setting");
  const selectedCustomWorkflowPromptFields = selectedCustomWorkflowFields.filter((field) => comfyFieldKind(field) === "prompt");
  const selectedCustomWorkflowImageFields = selectedCustomWorkflowFields.filter((field) => comfyFieldKind(field) === "image");
  const selectedWorkflowRunning = Boolean(selectedNode?.running);
  const selectedWorkflowRunStatus = selectedNode ? String(selectedNode.runStatus || (selectedWorkflowRunning ? "running" : "idle")) : "idle";
  const selectedWorkflowRunError = selectedNode ? String(selectedNode.runError || "") : "";
  const selectedWorkflowOutputs = selectedNode ? outputUrlValues(selectedNode.generatedOutputs).filter((url) => !isVideoUrl(url)) : [];
  const selectedWorkflowLastOutput = selectedWorkflowOutputs[0] || "";
  const selectedWorkflowInputSummary = selectedGraphContext
    ? `${selectedGraphContext.promptRefs.length} prompts · ${selectedGraphContext.imageRefs.length} images · ${selectedGraphContext.outputRefs.length} outputs`
    : "No execution context";
  const selectedLLMMode = canvasLLMMode(selectedNode);
  const selectedLLMRunning = Boolean(selectedCanRunLLMExecution && selectedNode?.running);
  const selectedLLMRunStatus = selectedCanRunLLMExecution && selectedNode ? String(selectedNode.runStatus || (selectedLLMRunning ? "running" : "idle")) : "idle";
  const selectedLLMRunError = selectedCanRunLLMExecution && selectedNode ? String(selectedNode.runError || "") : "";
  const selectedLLMOutputPreview = selectedCanRunLLMExecution && selectedNode ? String(selectedNode.outputText || "").trim() : "";
  const selectedLLMRunContext = selectedCanRunLLMExecution && selectedNode ? llmGraphRunContext(selectedNode, selectedGraphContext) : null;
  const selectedLLMInputSummary = selectedLLMRunContext
    ? `${selectedLLMRunContext.message ? 1 : 0} text · ${selectedLLMRunContext.images.length} images`
    : "No LLM context";
  const selectedVideoRunContext = selectedCanRunVideoExecution && selectedNode ? videoGraphRunContext(selectedNode, selectedGraphContext) : null;
  const selectedVideoRunning = Boolean(selectedCanRunVideoExecution && selectedNode?.running);
  const selectedVideoRunStatus = selectedCanRunVideoExecution && selectedNode ? String(selectedNode.runStatus || (selectedVideoRunning ? "running" : "idle")) : "idle";
  const selectedVideoRunError = selectedCanRunVideoExecution && selectedNode ? String(selectedNode.runError || "") : "";
  const selectedVideoOutputs = selectedCanRunVideoExecution && selectedNode ? outputUrlValues(selectedNode.videos).filter(Boolean) : [];
  const selectedVideoLastOutput = selectedVideoOutputs[0] || "";
  const selectedVideoInputSummary = selectedVideoRunContext
    ? `${selectedVideoRunContext.prompt ? 1 : 0} prompts · ${selectedVideoRunContext.images.length} images · ${selectedVideoRunContext.videos.length} videos`
    : "No video context";
  const executionBusy = executionStatus === "pending" || executionStatus === "running";
  const workflowExecutionBusy = executionBusy || selectedWorkflowRunning;
  const llmExecutionBusy = executionBusy || selectedLLMRunning;
  const videoExecutionBusy = executionBusy || selectedVideoRunning;
  const assetActionBusy = assetActionStatus === "pending";
  const selectedAssetBlocked = !selectedAsset || !selectedAsset.localCandidate || selectedAssetAvailability === false;
  const executionStatusLabel = executionStatus === "idle"
    ? "Ready"
    : executionStatus === "pending"
    ? "Queued"
    : executionStatus === "running"
    ? "Running"
    : executionStatus === "succeeded"
    ? "Completed"
    : "Failed";
  const assetStatusLabel = assetActionStatus === "idle"
    ? "Ready"
    : assetActionStatus === "pending"
    ? "Checking"
    : assetActionStatus === "succeeded"
    ? "Available"
    : assetActionStatus === "partial"
    ? "Partial"
    : assetActionStatus === "empty"
    ? "Empty"
    : "Failed";

  return (
    <section className="qc-canvas-workspace" aria-label="Native Canvas workspace">
      <aside className="qc-canvas-sidebar">
        <div className="qc-canvas-sidebar__header">
          <div>
            <h2>Canvases</h2>
            <span>{canvases.length} active · {trash.length} in trash</span>
          </div>
          <IconButton label="Refresh canvases" onClick={() => { loadList(); loadTrash(); }}>
            <RefreshCw size={16} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        </div>

        <div className="qc-canvas-search">
          <Search size={15} strokeWidth={2} aria-hidden="true" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search canvases..." />
        </div>

        <div className="qc-canvas-sidebar__actions">
          <Button variant="primary" icon={<FilePlus2 size={16} strokeWidth={2} aria-hidden="true" />} onClick={createCanvas}>
            New canvas
          </Button>
          <Button variant={trashOpen ? "primary" : "secondary"} icon={<Trash2 size={16} strokeWidth={2} aria-hidden="true" />} onClick={() => setTrashOpen((value) => !value)}>
            Trash
          </Button>
        </div>

        {errorText ? (
          <div className="qc-canvas-error" role="alert">{errorText}</div>
        ) : null}

        <div className="qc-canvas-list" aria-label="Canvas list">
          {loadingList ? (
            <div className="qc-canvas-list-empty">
              <Loader2 className="qc-spin" size={18} strokeWidth={2} aria-hidden="true" />
              Loading canvases
            </div>
          ) : filteredCanvases.length ? filteredCanvases.map((item) => (
            <div className={`qc-canvas-list-item${activeCanvas?.id === item.id ? " is-active" : ""}`} key={item.id}>
              <button type="button" onClick={() => openCanvas(item.id)} disabled={openingId === item.id}>
                <span className="qc-canvas-list-icon">{canvasIcon(item)}</span>
                <span>
                  <strong>{canvasTitle(item)}</strong>
                  <small>{item.node_count ?? 0} nodes · {timestampLabel(item.updated_at || item.created_at)}</small>
                </span>
              </button>
              {pendingDeleteId === item.id ? (
                <div className="qc-canvas-confirm">
                  <span>Move to trash?</span>
                  <button type="button" onClick={() => softDeleteCanvas(item.id)}>Confirm</button>
                  <button type="button" onClick={() => setPendingDeleteId("")}>Cancel</button>
                </div>
              ) : (
                <IconButton label={`Move ${canvasTitle(item)} to trash`} onClick={() => setPendingDeleteId(item.id)}>
                  <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
                </IconButton>
              )}
            </div>
          )) : (
            <div className="qc-canvas-list-empty">
              <Grid2X2 size={18} strokeWidth={2} aria-hidden="true" />
              No canvases found
            </div>
          )}
        </div>

        {trashOpen ? (
          <section className="qc-canvas-trash" aria-label="Canvas trash">
            <div className="qc-canvas-trash__header">
              <strong>Trash</strong>
              <span>{trashRetentionDays} day retention</span>
            </div>
            {trash.length ? trash.map((item) => (
              <div className="qc-canvas-trash-item" key={item.id}>
                <span>
                  <strong>{canvasTitle(item)}</strong>
                  <small>Deleted {timestampLabel(item.deleted_at)}</small>
                </span>
                <div>
                  <IconButton label={`Restore ${canvasTitle(item)}`} onClick={() => restoreCanvas(item.id)}>
                    <ArchiveRestore size={15} strokeWidth={2} aria-hidden="true" />
                  </IconButton>
                  {pendingPurgeId === item.id ? (
                    <button className="qc-canvas-purge-confirm" type="button" onClick={() => purgeCanvas(item.id)}>
                      Purge
                    </button>
                  ) : (
                    <IconButton label={`Permanently delete ${canvasTitle(item)}`} onClick={() => setPendingPurgeId(item.id)}>
                      <X size={15} strokeWidth={2} aria-hidden="true" />
                    </IconButton>
                  )}
                </div>
              </div>
            )) : (
              <div className="qc-canvas-list-empty">Trash is empty</div>
            )}
          </section>
        ) : null}

        <section className="qc-canvas-authoring" aria-label="Canvas authoring tools">
          <div className="qc-canvas-section-head">
            <h3>Authoring</h3>
            <span>{empty ? "Open a canvas first" : "Add nodes near view center"}</span>
          </div>
          <div className="qc-canvas-node-palette">
            <Button variant="secondary" icon={<Type size={15} strokeWidth={2} aria-hidden="true" />} onClick={addPromptNode} disabled={empty}>
              Prompt
            </Button>
            <Button variant="secondary" icon={<RefreshCw size={15} strokeWidth={2} aria-hidden="true" />} onClick={addLoopNode} disabled={empty}>
              Loop
            </Button>
            <Button variant="secondary" icon={<Images size={15} strokeWidth={2} aria-hidden="true" />} onClick={() => addImageNodeFromUrl("image")} disabled={empty || !imageUrlInput.trim()}>
              Image URL
            </Button>
            <Button variant="secondary" icon={<Image size={15} strokeWidth={2} aria-hidden="true" />} onClick={() => addImageNodeFromUrl("output")} disabled={empty || !imageUrlInput.trim()}>
              Output
            </Button>
            <Button variant="secondary" icon={<Grid2X2 size={15} strokeWidth={2} aria-hidden="true" />} onClick={addGroupNode} disabled={empty}>
              Group
            </Button>
            <Button variant="secondary" icon={<Type size={15} strokeWidth={2} aria-hidden="true" />} onClick={addPromptGroupNode} disabled={empty}>
              Prompt group
            </Button>
            <Button variant="secondary" icon={<MessageSquare size={15} strokeWidth={2} aria-hidden="true" />} onClick={addLLMNode} disabled={empty}>
              LLM
            </Button>
            <Button variant="secondary" icon={<Video size={15} strokeWidth={2} aria-hidden="true" />} onClick={addVideoNode} disabled={empty}>
              Video
            </Button>
            <Button variant="secondary" icon={<Image size={15} strokeWidth={2} aria-hidden="true" />} onClick={addGeneratorNode} disabled={empty}>
              Generator
            </Button>
            <Button variant="secondary" icon={<Workflow size={15} strokeWidth={2} aria-hidden="true" />} onClick={addMsGenNode} disabled={empty}>
              ModelScope
            </Button>
            <Button variant="secondary" icon={<Workflow size={15} strokeWidth={2} aria-hidden="true" />} onClick={addWorkflowNode} disabled={empty}>
              Workflow
            </Button>
          </div>
          <label className="qc-canvas-field">
            <span>Image URL</span>
            <input
              aria-label="Canvas image URL"
              value={imageUrlInput}
              onChange={(event) => setImageUrlInput(event.target.value)}
              placeholder="/output/example.png or https://..."
              disabled={empty}
            />
          </label>
          <label className={`qc-canvas-upload${empty ? " is-disabled" : ""}`}>
            <input aria-label="Upload image to Canvas" type="file" accept="image/*" disabled={empty || uploadingImage} onChange={(event) => void handleImageUpload(event)} />
            <span className="qc-button qc-button--secondary">
              <span className="qc-button__icon">{uploadingImage ? <Loader2 className="qc-spin" size={15} strokeWidth={2} aria-hidden="true" /> : <Upload size={15} strokeWidth={2} aria-hidden="true" />}</span>
              <span>{uploadingImage ? "Uploading" : "Upload image"}</span>
            </span>
          </label>
          {pendingIntakeItems.length ? (
            <div className="qc-canvas-intake-note">{pendingIntakeItems.length} queued asset{pendingIntakeItems.length === 1 ? "" : "s"} will be placed after a canvas opens.</div>
          ) : lastIntakeText ? (
            <div className="qc-canvas-intake-note">{lastIntakeText}</div>
          ) : null}
        </section>

        <section className="qc-canvas-assets" aria-label="Canvas local asset actions">
          <div className="qc-canvas-section-head">
            <h3>Assets</h3>
            <span>{assetStatusLabel} · {downloadableAssetItems.length}/{assetItems.length} downloadable</span>
          </div>
          <dl className="qc-canvas-asset-stats">
            <div><dt>Total</dt><dd>{assetItems.length}</dd></div>
            <div><dt>Local</dt><dd>{localAssetItems.length}</dd></div>
            <div><dt>Available</dt><dd>{downloadableAssetItems.length}</dd></div>
            <div><dt>Skipped</dt><dd>{skippedAssetCount}</dd></div>
          </dl>
          <div className="qc-canvas-asset-actions">
            <Button
              variant="secondary"
              icon={assetActionBusy ? <Loader2 className="qc-spin" size={15} strokeWidth={2} aria-hidden="true" /> : <CheckCircle2 size={15} strokeWidth={2} aria-hidden="true" />}
              onClick={() => void checkCanvasAssetAvailability()}
              disabled={empty || assetActionBusy || !assetItems.length}
            >
              Check local assets
            </Button>
            <Button
              variant="secondary"
              icon={assetActionBusy ? <Loader2 className="qc-spin" size={15} strokeWidth={2} aria-hidden="true" /> : <Download size={15} strokeWidth={2} aria-hidden="true" />}
              onClick={() => void downloadAllCanvasAssets()}
              disabled={empty || assetActionBusy || !localAssetItems.length}
            >
              Download all local
            </Button>
            <Button
              variant="secondary"
              icon={assetActionBusy ? <Loader2 className="qc-spin" size={15} strokeWidth={2} aria-hidden="true" /> : <Download size={15} strokeWidth={2} aria-hidden="true" />}
              onClick={() => void downloadSelectedCanvasAsset()}
              disabled={empty || assetActionBusy || selectedAssetBlocked}
            >
              Download selected asset
            </Button>
          </div>
          <div className={`qc-canvas-asset-state is-${assetActionStatus}`} data-state={assetActionStatus}>
            {assetActionBusy ? (
              <Loader2 className="qc-spin" size={16} strokeWidth={2} aria-hidden="true" />
            ) : assetActionStatus === "failed" ? (
              <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />
            ) : (
              <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" />
            )}
            <span>{assetActionError || assetActionText}</span>
          </div>
          <div className="qc-canvas-asset-selected">
            <strong>Selected asset</strong>
            {selectedAsset ? (
              <>
                <span>{selectedAsset.name}</span>
                <small>{selectedAsset.localCandidate ? selectedAssetAvailability === false ? "Local missing" : selectedAssetAvailability ? "Local available" : "Local unchecked" : "Remote/data skipped"}</small>
              </>
            ) : (
              <span>No selected image/output/video asset</span>
            )}
          </div>
        </section>

        <section className="qc-canvas-inspector" aria-label="Selected Canvas node inspector">
          <div className="qc-canvas-section-head">
            <h3>Inspector</h3>
            <span>{selectedNode ? nodeLabel(selectedNode) : selectedConnectionLabel ? "Link selected" : "No node selected"}</span>
          </div>
          {selectedNode ? (
            <>
              <label className="qc-canvas-field">
                <span>Name</span>
                <input aria-label="Selected node name" value={selectedName} onChange={(event) => updateSelectedNode({ name: event.target.value }, "Node name updated")} />
              </label>
              <label className="qc-canvas-field">
                <span>Text / prompt</span>
                <textarea aria-label="Selected node text" value={selectedText} onChange={(event) => updateSelectedNode({ text: event.target.value }, "Node text updated")} />
              </label>
              {selectedKind === "loop" ? (
                <section className="qc-canvas-node-settings" aria-label="Loop node settings">
                  <div className="qc-canvas-execution-grid">
                    <label className="qc-canvas-field">
                      <span>Count</span>
                      <input aria-label="Selected loop count" value={String(selectedNode.count || 3)} inputMode="numeric" onChange={(event) => updateSelectedNode({ count: clampInt(event.target.value, 3, 1, 100) }, "Loop count updated")} />
                    </label>
                    <label className="qc-canvas-field">
                      <span>Start</span>
                      <input aria-label="Selected loop start" value={String(selectedNode.loopStart || 1)} inputMode="numeric" onChange={(event) => updateSelectedNode({ loopStart: clampInt(event.target.value, 1, 1, 999) }, "Loop start updated")} />
                    </label>
                    <label className="qc-canvas-field">
                      <span>Mode</span>
                      <select aria-label="Selected loop mode" value={String(selectedNode.mode || "serial")} onChange={(event) => updateSelectedNode({ mode: event.target.value }, "Loop mode updated")}>
                        <option value="serial">Serial</option>
                        <option value="parallel">Parallel</option>
                      </select>
                    </label>
                    <label className="qc-canvas-field">
                      <span>Image batch</span>
                      <input aria-label="Selected loop image batch" value={String(selectedNode.imageBatchSize || 1)} inputMode="numeric" onChange={(event) => updateSelectedNode({ imageBatchSize: clampInt(event.target.value, 1, 1, 100) }, "Loop image batch updated")} />
                    </label>
                  </div>
                  <div className="qc-canvas-custom-field-list">
                    <button type="button" className={`qc-canvas-check-button${selectedNode.showPrompt !== false ? " is-active" : ""}`} onClick={() => updateSelectedNode({ showPrompt: selectedNode.showPrompt === false }, "Loop prompt toggle updated")}>
                      <span aria-hidden="true" />
                      Prompt output
                    </button>
                    <button type="button" className={`qc-canvas-check-button${selectedNode.imageInput ? " is-active" : ""}`} onClick={() => updateSelectedNode({ imageInput: !Boolean(selectedNode.imageInput) }, "Loop image input toggle updated")}>
                      <span aria-hidden="true" />
                      Image input
                    </button>
                  </div>
                  <label className="qc-canvas-field">
                    <span>Variable prompt</span>
                    <textarea aria-label="Selected loop variable prompt" value={String(selectedNode.variablePrompt || "")} placeholder="Use 《计数》, 《总数》, 《进度》" onChange={(event) => updateSelectedNode({ variablePrompt: event.target.value }, "Loop variable prompt updated")} />
                  </label>
                  <label className="qc-canvas-field">
                    <span>Fixed prompt</span>
                    <textarea aria-label="Selected loop fixed prompt" value={String(selectedNode.fixedPrompt || "")} onChange={(event) => updateSelectedNode({ fixedPrompt: event.target.value }, "Loop fixed prompt updated")} />
                  </label>
                  <div className="qc-canvas-execution-data__prompt">
                    <strong>Loop preview</strong>
                    <span>{renderLoopPrompt(selectedNode) || "No prompt output"}</span>
                  </div>
                </section>
              ) : null}
              {selectedSupportsImageUrl ? (
                <label className="qc-canvas-field">
                  <span>{selectedExecutionKind === "video" ? "Media URL" : "Image URL"}</span>
                  <input aria-label={selectedExecutionKind === "video" ? "Selected node media URL" : "Selected node image URL"} value={selectedMediaUrl} onChange={(event) => updateSelectedNodeImageUrl(event.target.value)} />
                </label>
              ) : null}
              {selectedKind === "image" && selectedImageUrl && !isVideoUrl(selectedImageUrl) ? (
                <section className="qc-canvas-node-settings" aria-label="Canvas image editor actions">
                  <div className="qc-canvas-section-head">
                    <h3>Image editor</h3>
                    <span>crop · mask · split</span>
                  </div>
                  <Button variant="secondary" icon={<BoxSelect size={15} strokeWidth={2} aria-hidden="true" />} onClick={() => openImageEditor(selectedNode)}>
                    Edit image
                  </Button>
                </section>
              ) : null}
              {selectedOutputPreviewItems.length ? (
                <section className="qc-canvas-node-settings" aria-label="Canvas output preview actions">
                  <div className="qc-canvas-section-head">
                    <h3>Output preview</h3>
                    <span>{selectedOutputPreviewItems.length} item{selectedOutputPreviewItems.length === 1 ? "" : "s"}</span>
                  </div>
                  <div className="qc-canvas-output-action-list">
                    {selectedOutputPreviewItems.map((item) => (
                      <button type="button" key={item.url} onClick={() => openOutputLightbox(item)}>
                        <Maximize2 size={14} strokeWidth={2} aria-hidden="true" />
                        <span>{item.name}</span>
                        {item.sourceUrl && !item.isVideo ? <small>compare ready</small> : null}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
              {selectedExecutionKind === "llm" ? (
                <section className="qc-canvas-node-settings" aria-label="LLM node settings">
                  <div className="qc-canvas-execution-grid">
                    <label className="qc-canvas-field">
                      <span>Provider</span>
                      <input
                        aria-label="Selected LLM provider"
                        value={String(selectedNode.llmProvider || "")}
                        placeholder="comfly"
                        onChange={(event) => updateSelectedNode({ llmProvider: event.target.value }, "LLM provider updated")}
                      />
                    </label>
                    <label className="qc-canvas-field">
                      <span>Model</span>
                      <input
                        aria-label="Selected LLM model"
                        value={String(selectedNode.model || "")}
                        placeholder={apiConfig?.chat_model || "chat model"}
                        onChange={(event) => updateSelectedNode({ model: event.target.value }, "LLM model updated")}
                      />
                    </label>
                    <label className="qc-canvas-field">
                      <span>Mode</span>
                      <select
                        aria-label="Selected LLM mode"
                        value={selectedLLMMode || "node"}
                        onChange={(event) => updateSelectedNode({ mode: event.target.value }, "LLM mode updated")}
                      >
                        <option value="node">Node</option>
                        <option value="chat">Chat</option>
                      </select>
                    </label>
                  </div>
                  <label className="qc-canvas-field">
                    <span>System prompt</span>
                    <textarea
                      aria-label="Selected LLM system prompt"
                      value={String(selectedNode.systemPrompt || "")}
                      onChange={(event) => updateSelectedNode({ systemPrompt: event.target.value }, "LLM system prompt updated")}
                    />
                  </label>
                  {selectedLLMMode === "chat" ? (
                    <label className="qc-canvas-field">
                      <span>Chat input</span>
                      <textarea
                        aria-label="Selected LLM chat input"
                        value={String(selectedNode.chatInput || "")}
                        onChange={(event) => updateSelectedNode({ chatInput: event.target.value }, "LLM chat input updated")}
                      />
                    </label>
                  ) : null}
                  <label className="qc-canvas-field">
                    <span>Output text</span>
                    <textarea
                      aria-label="Selected LLM output text"
                      value={String(selectedNode.outputText || "")}
                      onChange={(event) => updateSelectedNode({ outputText: event.target.value }, "LLM output text updated")}
                    />
                  </label>
                </section>
              ) : null}
              {selectedExecutionKind === "video" ? (
                <section className="qc-canvas-node-settings" aria-label="Video node settings">
                  <div className="qc-canvas-execution-grid">
                    <label className="qc-canvas-field">
                      <span>Provider</span>
                      <input
                        aria-label="Selected video provider"
                        value={String(selectedNode.providerId || "")}
                        placeholder="comfly"
                        onChange={(event) => updateSelectedNode({ providerId: event.target.value }, "Video provider updated")}
                      />
                    </label>
                    <label className="qc-canvas-field">
                      <span>Model</span>
                      <input
                        aria-label="Selected video model"
                        value={String(selectedNode.model || "")}
                        placeholder={apiConfig?.video_models?.[0] || "video model"}
                        onChange={(event) => updateSelectedNode({ model: event.target.value }, "Video model updated")}
                      />
                    </label>
                    <label className="qc-canvas-field">
                      <span>Duration</span>
                      <input
                        aria-label="Selected video duration"
                        value={String(selectedNode.duration || "")}
                        inputMode="numeric"
                        onChange={(event) => updateSelectedNode({ duration: Number(event.target.value) || 0 }, "Video duration updated")}
                      />
                    </label>
                    <label className="qc-canvas-field">
                      <span>Aspect</span>
                      <input
                        aria-label="Selected video aspect ratio"
                        value={String(selectedNode.aspectRatio || "")}
                        placeholder="16:9"
                        onChange={(event) => updateSelectedNode({ aspectRatio: event.target.value }, "Video aspect updated")}
                      />
                    </label>
                    <label className="qc-canvas-field">
                      <span>Resolution</span>
                      <input
                        aria-label="Selected video resolution"
                        value={String(selectedNode.resolution || "")}
                        placeholder="480p"
                        onChange={(event) => updateSelectedNode({ resolution: event.target.value }, "Video resolution updated")}
                      />
                    </label>
                  </div>
                </section>
              ) : null}
              {selectedKind === "generator" ? (
                <section className="qc-canvas-node-settings" aria-label="Generator node settings">
                  <div className="qc-canvas-execution-grid">
                    <label className="qc-canvas-field">
                      <span>Provider</span>
                      <input
                        aria-label="Selected generator provider"
                        value={String(selectedNode.providerId || selectedNode.provider_id || "")}
                        placeholder={selectedExecutionProvider?.id || "comfly"}
                        onChange={(event) => updateSelectedNode({ providerId: event.target.value }, "Generator provider updated")}
                      />
                    </label>
                    <label className="qc-canvas-field">
                      <span>Model</span>
                      <input
                        aria-label="Selected generator model"
                        value={String(selectedNode.model || "")}
                        placeholder={executionModel || apiConfig?.image_model || "image model"}
                        onChange={(event) => updateSelectedNode({ model: event.target.value }, "Generator model updated")}
                      />
                    </label>
                    <label className="qc-canvas-field">
                      <span>Size</span>
                      <select
                        aria-label="Selected generator size"
                        value={String(selectedNode.size || canvasGeneratorSize(selectedNode))}
                        onChange={(event) => updateSelectedNode({ size: event.target.value }, "Generator size updated")}
                      >
                        {CANVAS_IMAGE_SIZES.map((size) => <option value={size} key={size}>{size}</option>)}
                      </select>
                    </label>
                    <label className="qc-canvas-field">
                      <span>Count</span>
                      <input
                        aria-label="Selected generator count"
                        value={String(selectedNode.count || 1)}
                        inputMode="numeric"
                        onChange={(event) => updateSelectedNode({ count: clampInt(event.target.value, 1, 1, 8) }, "Generator count updated")}
                      />
                    </label>
                  </div>
                </section>
              ) : null}
              {selectedKind === "msgen" ? (
                <section className="qc-canvas-node-settings" aria-label="ModelScope node settings">
                  <div className="qc-canvas-execution-grid">
                    <label className="qc-canvas-field">
                      <span>ModelScope mode</span>
                      <select
                        aria-label="Selected ModelScope mode"
                        value={String(selectedNode.msgenModel || "zimage")}
                        onChange={(event) => updateSelectedNode({ msgenModel: event.target.value }, "ModelScope mode updated")}
                      >
                        {Object.entries(CANVAS_MS_GEN_MODELS).map(([key, model]) => (
                          <option value={key} key={key}>{model.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="qc-canvas-field">
                      <span>Width</span>
                      <input
                        aria-label="Selected ModelScope width"
                        value={String(selectedNode.msWidth || 1024)}
                        inputMode="numeric"
                        disabled={Boolean(selectedNode.fitImage)}
                        onChange={(event) => updateSelectedNode({ msWidth: clampInt(event.target.value, 1024, 64, 8192) }, "ModelScope width updated")}
                      />
                    </label>
                    <label className="qc-canvas-field">
                      <span>Height</span>
                      <input
                        aria-label="Selected ModelScope height"
                        value={String(selectedNode.msHeight || 1024)}
                        inputMode="numeric"
                        disabled={Boolean(selectedNode.fitImage)}
                        onChange={(event) => updateSelectedNode({ msHeight: clampInt(event.target.value, 1024, 64, 8192) }, "ModelScope height updated")}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className={`qc-canvas-check-button${selectedNode.fitImage ? " is-active" : ""}`}
                    onClick={() => updateSelectedNode({ fitImage: !Boolean(selectedNode.fitImage) }, "ModelScope fit image updated")}
                  >
                    <span aria-hidden="true" />
                    Fit reference image dimensions
                  </button>
                  {String(selectedNode.msgenModel || "zimage") === "klein_edit" ? (
                    <div className="qc-canvas-custom-field-list">
                      <button
                        type="button"
                        className={`qc-canvas-check-button${selectedNode.kleinLora ? " is-active" : ""}`}
                        onClick={() => updateSelectedNode({ kleinLora: !Boolean(selectedNode.kleinLora) }, "ModelScope LoRA toggle updated")}
                      >
                        <span aria-hidden="true" />
                        Detail LoRA
                      </button>
                      {selectedNode.kleinLora ? (
                        <label className="qc-canvas-field">
                          <span>LoRA strength</span>
                          <input
                            aria-label="Selected ModelScope LoRA strength"
                            value={String(selectedNode.kleinLoraStrength ?? 0.8)}
                            inputMode="decimal"
                            onChange={(event) => updateSelectedNode({ kleinLoraStrength: Number(event.target.value) || 0.8 }, "ModelScope LoRA strength updated")}
                          />
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              ) : null}
              {selectedExecutionKind === "workflow" && selectedKind !== "generator" && selectedKind !== "msgen" ? (
                <section className="qc-canvas-node-settings" aria-label="Workflow node settings">
                  <div className="qc-canvas-execution-grid">
                    <label className="qc-canvas-field">
                      <span>Mode</span>
                      <select
                        aria-label="Selected workflow mode"
                        value={String(selectedNode.mode || "custom")}
                        onChange={(event) => updateSelectedNode({ mode: event.target.value }, "Workflow mode updated")}
                      >
                        <option value="text">Text</option>
                        <option value="enhance">Enhance</option>
                        <option value="edit">Edit</option>
                        <option value="custom">Custom</option>
                      </select>
                    </label>
                    <label className="qc-canvas-field">
                      <span>Workflow</span>
                      {selectedWorkflowMode === "custom" ? (
                        <select
                          aria-label="Selected custom workflow name"
                          value={selectedCustomWorkflowName}
                          onChange={(event) => {
                            const value = event.target.value;
                            updateSelectedNode({ comfyWorkflow: value, comfyParams: {} }, "Custom workflow selected");
                            if (value) void ensureWorkflowDetail(value);
                          }}
                        >
                          <option value="">{workflowListStatus === "loading" ? "Loading workflows..." : "Select custom workflow"}</option>
                          {workflowSummaries.map((workflow) => (
                            <option value={workflow.name} key={workflow.name}>{workflow.title || workflow.name}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          aria-label="Selected workflow name"
                          value={String(selectedNode.comfyWorkflow || selectedNode.workflow_json || "")}
                          placeholder="custom-workflow.json"
                          onChange={(event) => updateSelectedNode({ comfyWorkflow: event.target.value }, "Workflow placeholder updated")}
                        />
                      )}
                    </label>
                  </div>
                  <div className="qc-canvas-execution-grid">
                    <label className="qc-canvas-field">
                      <span>Canvas width</span>
                      <input
                        aria-label="Selected workflow canvas width"
                        value={String(selectedNode.width || 1024)}
                        inputMode="numeric"
                        onChange={(event) => updateSelectedNode({ width: clampInt(event.target.value, 1024, 64, 8192) }, "Workflow width updated")}
                      />
                    </label>
                    <label className="qc-canvas-field">
                      <span>Canvas height</span>
                      <input
                        aria-label="Selected workflow canvas height"
                        value={String(selectedNode.height || 1024)}
                        inputMode="numeric"
                        onChange={(event) => updateSelectedNode({ height: clampInt(event.target.value, 1024, 64, 8192) }, "Workflow height updated")}
                      />
                    </label>
                    <label className="qc-canvas-field">
                      <span>Enhance strength</span>
                      <input
                        aria-label="Selected workflow enhance strength"
                        value={String(selectedNode.enhanceStrength ?? 0.5)}
                        inputMode="decimal"
                        onChange={(event) => updateSelectedNode({ enhanceStrength: Number(event.target.value) || 0.5 }, "Workflow enhance strength updated")}
                      />
                    </label>
                  </div>
                  <label className="qc-canvas-field">
                    <span>Provider / model</span>
                    <input
                      aria-label="Selected workflow model placeholder"
                      value={String(selectedNode.model || "")}
                      placeholder={apiConfig?.image_model || "image model"}
                      onChange={(event) => updateSelectedNode({ model: event.target.value }, "Workflow model placeholder updated")}
                    />
                  </label>
                  {selectedWorkflowMode === "custom" ? (
                    <section className="qc-canvas-custom-workflow-fields" aria-label="Custom workflow parameters">
                      <div className="qc-canvas-section-head">
                        <h3>Custom workflow params</h3>
                        <button type="button" onClick={() => void refreshWorkflowSummaries()}>Refresh</button>
                      </div>
                      {!selectedCustomWorkflowName ? (
                        <div className="qc-canvas-execution-warnings" role="status">
                          <AlertCircle size={15} strokeWidth={2} aria-hidden="true" />
                          <span>Select a custom workflow uploaded through ComfyUI settings.</span>
                        </div>
                      ) : workflowDetailStatus[selectedCustomWorkflowName] === "failed" ? (
                        <div className="qc-canvas-execution-warnings" role="status">
                          <AlertCircle size={15} strokeWidth={2} aria-hidden="true" />
                          <span>Workflow detail failed to load.</span>
                        </div>
                      ) : !selectedCustomWorkflowDetail ? (
                        <div className="qc-canvas-execution-state is-idle">
                          <Loader2 className="qc-spin" size={16} strokeWidth={2} aria-hidden="true" />
                          <span>Loading workflow fields...</span>
                        </div>
                      ) : (
                        <>
                          <dl className="qc-canvas-workflow-run-stats">
                            <div><dt>Prompt fields</dt><dd>{selectedCustomWorkflowPromptFields.length}</dd></div>
                            <div><dt>Image fields</dt><dd>{selectedCustomWorkflowImageFields.length}</dd></div>
                            <div><dt>Settings</dt><dd>{selectedCustomWorkflowSettingFields.length}</dd></div>
                          </dl>
                          {selectedCustomWorkflowImageFields.length ? (
                            <div className="qc-canvas-execution-state is-idle">
                              <Image size={16} strokeWidth={2} aria-hidden="true" />
                              <span>{selectedCustomWorkflowImageFields.length} image field{selectedCustomWorkflowImageFields.length === 1 ? "" : "s"} use upstream image/output refs.</span>
                            </div>
                          ) : null}
                          {[...selectedCustomWorkflowPromptFields, ...selectedCustomWorkflowSettingFields].length ? (
                            <div className="qc-canvas-custom-field-list">
                              {[...selectedCustomWorkflowPromptFields, ...selectedCustomWorkflowSettingFields].map((field) => {
                                const value = comfyParamValue(selectedNode, field);
                                const label = field.name || field.input || field.id;
                                const type = field.type || "text";
                                const random = comfyRandomEnabled(field);
                                const randomActive = random && comfyRandomActive(selectedNode, field.id);
                                if (type === "boolean") {
                                  return (
                                    <button
                                      type="button"
                                      className={`qc-canvas-check-button${value ? " is-active" : ""}`}
                                      key={field.id}
                                      onClick={() => updateSelectedComfyParam(field, !Boolean(value))}
                                    >
                                      <span aria-hidden="true" />
                                      {label}
                                    </button>
                                  );
                                }
                                if (type === "dropdown") {
                                  return (
                                    <label className="qc-canvas-field" key={field.id}>
                                      <span>{label}</span>
                                      <select
                                        aria-label={`Custom workflow ${label}`}
                                        value={String(value ?? "")}
                                        onChange={(event) => updateSelectedComfyParam(field, event.target.value)}
                                      >
                                        {(field.options || []).length ? field.options?.map((option) => (
                                          <option value={option} key={option}>{option}</option>
                                        )) : <option value="">No options</option>}
                                      </select>
                                    </label>
                                  );
                                }
                                if (type === "textarea" || type === "prompt") {
                                  return (
                                    <label className="qc-canvas-field" key={field.id}>
                                      <span>{label}</span>
                                      <textarea
                                        aria-label={`Custom workflow ${label}`}
                                        value={String(value ?? "")}
                                        onChange={(event) => updateSelectedComfyParam(field, event.target.value)}
                                      />
                                    </label>
                                  );
                                }
                                return (
                                  <div className="qc-canvas-custom-field-row" key={field.id}>
                                    <label className="qc-canvas-field">
                                      <span>{label}</span>
                                      <input
                                        aria-label={`Custom workflow ${label}`}
                                        type={type === "number" || type === "slider" ? "number" : "text"}
                                        min={field.min}
                                        max={field.max}
                                        step={field.step}
                                        value={String(value ?? "")}
                                        onChange={(event) => updateSelectedComfyParam(field, type === "number" || type === "slider" ? Number(event.target.value) : event.target.value)}
                                      />
                                    </label>
                                    {random ? (
                                      <button
                                        type="button"
                                        className={`qc-canvas-random-button${randomActive ? " is-active" : ""}`}
                                        onClick={() => toggleSelectedComfyRandom(field.id)}
                                      >
                                        Random
                                      </button>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="qc-canvas-execution-state is-idle">
                              <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" />
                              <span>This workflow has no editable prompt or setting fields.</span>
                            </div>
                          )}
                        </>
                      )}
                    </section>
                  ) : null}
                </section>
              ) : null}
              <div className="qc-canvas-size-grid">
                <label className="qc-canvas-field">
                  <span>Width</span>
                  <input
                    aria-label="Selected node width"
                    value={selectedWidth}
                    inputMode="numeric"
                    onChange={(event) => updateSelectedNode({ w: Number(event.target.value) || undefined }, "Node width updated")}
                  />
                </label>
                <label className="qc-canvas-field">
                  <span>Height</span>
                  <input
                    aria-label="Selected node height"
                    value={selectedHeight}
                    inputMode="numeric"
                    onChange={(event) => updateSelectedNode({ h: Number(event.target.value) || undefined }, "Node height updated")}
                  />
                </label>
              </div>
              <div className="qc-canvas-link-tools">
                <Button variant={linkSourceId ? "primary" : "secondary"} icon={<Link2 size={15} strokeWidth={2} aria-hidden="true" />} onClick={startLinkFromSelection}>
                  {linkSourceId === selectedNodeId ? "Link source set" : "Start link"}
                </Button>
                {linkSourceId ? <span>Select another node to finish.</span> : <span>{selectedConnections.length} connected link{selectedConnections.length === 1 ? "" : "s"}</span>}
              </div>
              {connectionWarning ? (
                <div className="qc-canvas-link-warning" role="status">
                  <AlertCircle size={15} strokeWidth={2} aria-hidden="true" />
                  <span>{connectionWarning}</span>
                </div>
              ) : null}
              {selectedConnections.length ? (
                <div className="qc-canvas-link-list">
                  {selectedConnections.map(({ connection, index }) => {
                    const id = connectionId(connection, index);
                    const key = connectionSelectionKey(connection, index);
                    return (
                      <div className={`qc-canvas-link-item${key === selectedConnectionKey ? " is-selected" : ""}`} key={`${id}-${index}`}>
                        <button
                          type="button"
                          className="qc-canvas-link-item__select"
                          onClick={() => selectConnection(connection, index)}
                        >
                          {connectionLabel(connection, index, nodeMap)}
                        </button>
                        <IconButton label="Delete link" onClick={() => deleteLink(id, index)}>
                          <Link2Off size={14} strokeWidth={2} aria-hidden="true" />
                        </IconButton>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <CanvasExecutionDataPanel context={selectedGraphContext} />
              {selectedCanRunLLMExecution ? (
                <section className="qc-canvas-execution qc-canvas-llm-execution" aria-label="Canvas LLM execution">
                  <div className="qc-canvas-section-head">
                    <h3>LLM execution</h3>
                    <span>{selectedLLMMode || "node"} · {selectedLLMRunStatus}</span>
                  </div>
                  <dl className="qc-canvas-workflow-run-stats qc-canvas-llm-run-stats">
                    <div><dt>Mode</dt><dd>{selectedLLMMode || "node"}</dd></div>
                    <div><dt>Model</dt><dd>{String(selectedNode.model || selectedNode.llmMsModel || "default")}</dd></div>
                    <div><dt>Inputs</dt><dd>{selectedLLMInputSummary}</dd></div>
                    <div><dt>Output</dt><dd>{selectedLLMOutputPreview ? `${selectedLLMOutputPreview.length} chars` : "empty"}</dd></div>
                  </dl>
                  <div className={`qc-canvas-execution-state is-${selectedLLMRunStatus === "failed" ? "failed" : selectedLLMRunning ? "running" : "idle"}`}>
                    {selectedLLMRunning || llmExecutionBusy ? (
                      <Loader2 className="qc-spin" size={16} strokeWidth={2} aria-hidden="true" />
                    ) : selectedLLMRunStatus === "failed" ? (
                      <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />
                    ) : (
                      <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" />
                    )}
                    <span>{selectedLLMRunError || "Ready to run /api/canvas-llm with explicit save after output."}</span>
                  </div>
                  {selectedLLMRunContext && !selectedLLMRunContext.message ? (
                    <div className="qc-canvas-execution-warnings" role="status">
                      <AlertCircle size={15} strokeWidth={2} aria-hidden="true" />
                      <span>{selectedLLMMode === "chat" ? "Chat mode needs chat input before running." : "Node mode needs direct text or an upstream prompt/text/LLM output."}</span>
                    </div>
                  ) : null}
                  {selectedLLMOutputPreview ? (
                    <div className="qc-canvas-execution-data__prompt qc-canvas-llm-output">
                      <strong>LLM outputText</strong>
                      <span>{selectedLLMOutputPreview}</span>
                    </div>
                  ) : null}
                  <Button
                    variant="primary"
                    icon={llmExecutionBusy ? <Loader2 className="qc-spin" size={15} strokeWidth={2} aria-hidden="true" /> : <Play size={15} strokeWidth={2} aria-hidden="true" />}
                    onClick={() => void runSelectedLLMNode()}
                    disabled={llmExecutionBusy}
                  >
                    Run LLM node
                  </Button>
                </section>
              ) : null}
              {selectedCanRunVideoExecution ? (
                <section className="qc-canvas-execution qc-canvas-video-execution" aria-label="Canvas video execution">
                  <div className="qc-canvas-section-head">
                    <h3>Video execution</h3>
                    <span>{String(selectedNode.aspectRatio || "16:9")} · {selectedVideoRunStatus}</span>
                  </div>
                  <dl className="qc-canvas-workflow-run-stats qc-canvas-video-run-stats">
                    <div><dt>Model</dt><dd>{String(selectedNode.model || "default")}</dd></div>
                    <div><dt>Duration</dt><dd>{String(selectedNode.duration || 5)}s</dd></div>
                    <div><dt>Inputs</dt><dd>{selectedVideoInputSummary}</dd></div>
                    <div><dt>Videos</dt><dd>{selectedVideoOutputs.length}</dd></div>
                  </dl>
                  <div className={`qc-canvas-execution-state is-${selectedVideoRunStatus === "failed" ? "failed" : selectedVideoRunning ? "running" : "idle"}`}>
                    {selectedVideoRunning || videoExecutionBusy ? (
                      <Loader2 className="qc-spin" size={16} strokeWidth={2} aria-hidden="true" />
                    ) : selectedVideoRunStatus === "failed" ? (
                      <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />
                    ) : (
                      <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" />
                    )}
                    <span>{selectedVideoRunError || "Ready to run /api/canvas-video with explicit save after output."}</span>
                  </div>
                  {selectedVideoRunContext && !selectedVideoRunContext.prompt ? (
                    <div className="qc-canvas-execution-warnings" role="status">
                      <AlertCircle size={15} strokeWidth={2} aria-hidden="true" />
                      <span>Video execution needs direct or upstream prompt text.</span>
                    </div>
                  ) : null}
                  {selectedVideoLastOutput ? (
                    <div className="qc-canvas-execution-output qc-canvas-video-output">
                      <CanvasVideo src={selectedVideoLastOutput} title="Last Canvas video output" />
                      <span>{selectedVideoOutputs.length} video output{selectedVideoOutputs.length === 1 ? "" : "s"} on selected node</span>
                    </div>
                  ) : null}
                  <Button
                    variant="primary"
                    icon={videoExecutionBusy ? <Loader2 className="qc-spin" size={15} strokeWidth={2} aria-hidden="true" /> : <Play size={15} strokeWidth={2} aria-hidden="true" />}
                    onClick={() => void runSelectedVideoNode()}
                    disabled={videoExecutionBusy}
                  >
                    Run video node
                  </Button>
                </section>
              ) : null}
              {selectedCanRunWorkflowExecution ? (
                <section className="qc-canvas-execution qc-canvas-workflow-execution" aria-label="Canvas workflow execution">
                  <div className="qc-canvas-section-head">
                    <h3>{selectedKind === "msgen" ? "ModelScope execution" : "Workflow execution"}</h3>
                    <span>{selectedWorkflowMode} · {selectedWorkflowRunStatus}</span>
                  </div>
                  <dl className="qc-canvas-workflow-run-stats">
                    <div><dt>Mode</dt><dd>{selectedWorkflowMode}</dd></div>
                    <div><dt>Workflow</dt><dd>{selectedWorkflowName}</dd></div>
                    <div><dt>Inputs</dt><dd>{selectedWorkflowInputSummary}</dd></div>
                    <div><dt>Outputs</dt><dd>{selectedWorkflowOutputs.length}</dd></div>
                  </dl>
                  <div className={`qc-canvas-execution-state is-${selectedWorkflowRunStatus === "failed" ? "failed" : selectedWorkflowRunning ? "running" : "idle"}`}>
                    {selectedWorkflowRunning || workflowExecutionBusy ? (
                      <Loader2 className="qc-spin" size={16} strokeWidth={2} aria-hidden="true" />
                    ) : selectedWorkflowRunStatus === "failed" ? (
                      <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />
                    ) : (
                      <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" />
                    )}
                    <span>{selectedWorkflowRunError || `Ready to run ${selectedWorkflowMode} with explicit save after output.`}</span>
                  </div>
                  {selectedWorkflowLastOutput ? (
                    <div className="qc-canvas-execution-output">
                      <CanvasImage src={selectedWorkflowLastOutput} alt="Last Canvas workflow output" />
                      <span>{selectedWorkflowOutputs.length} workflow output image{selectedWorkflowOutputs.length === 1 ? "" : "s"} on selected node</span>
                    </div>
                  ) : null}
                  <Button
                    variant="primary"
                    icon={workflowExecutionBusy ? <Loader2 className="qc-spin" size={15} strokeWidth={2} aria-hidden="true" /> : <Play size={15} strokeWidth={2} aria-hidden="true" />}
                    onClick={() => void runSelectedWorkflowNode()}
                    disabled={workflowExecutionBusy}
                  >
                    {selectedKind === "msgen" ? "Run ModelScope node" : "Run workflow node"}
                  </Button>
                </section>
              ) : null}
              <section className="qc-canvas-execution" aria-label="Canvas image execution">
                <div className="qc-canvas-section-head">
                  <h3>Image execution</h3>
                  <span>{selectedCanRunImageExecution ? executionStatusLabel : "Unavailable"}</span>
                </div>
                <div className="qc-canvas-execution-grid">
                  <label className="qc-canvas-field">
                    <span>Provider</span>
                    <select
                      aria-label="Canvas execution provider"
                      value={selectedExecutionProvider?.id || ""}
                      onChange={(event) => setExecutionProviderId(event.target.value)}
                    >
                      {executionProviders.map((provider) => (
                        <option value={provider.id} key={provider.id}>{provider.name || provider.id}</option>
                      ))}
                    </select>
                  </label>
                  <label className="qc-canvas-field">
                    <span>Model</span>
                    <select
                      aria-label="Canvas execution model"
                      value={executionModel || executionModelOptions[0] || ""}
                      onChange={(event) => setExecutionModel(event.target.value)}
                    >
                      {(executionModelOptions.length ? executionModelOptions : [executionModel || apiConfig?.image_model || "gpt-image-2"]).filter(Boolean).map((modelName) => (
                        <option value={modelName} key={modelName}>{modelName}</option>
                      ))}
                    </select>
                  </label>
                  <label className="qc-canvas-field">
                    <span>Size</span>
                    <select
                      aria-label="Canvas execution size"
                      value={executionSize}
                      onChange={(event) => setExecutionSize(event.target.value)}
                    >
                      {CANVAS_IMAGE_SIZES.map((size) => <option value={size} key={size}>{size}</option>)}
                    </select>
                  </label>
                  <label className="qc-canvas-field">
                    <span>Quality</span>
                    <select
                      aria-label="Canvas execution quality"
                      value={executionQuality}
                      onChange={(event) => setExecutionQuality(event.target.value)}
                    >
                      {CANVAS_IMAGE_QUALITIES.map((quality) => <option value={quality} key={quality}>{quality}</option>)}
                    </select>
                  </label>
                </div>
                <label className="qc-canvas-checkbox">
                  <input
                    type="checkbox"
                    checked={executionUseConnectedContext}
                    onChange={(event) => setExecutionUseConnectedContext(event.target.checked)}
                  />
                  <span>Use directly connected prompt/image context</span>
                </label>
                <div className={`qc-canvas-execution-state is-${executionStatus}`}>
                  {executionBusy ? (
                    <Loader2 className="qc-spin" size={16} strokeWidth={2} aria-hidden="true" />
                  ) : executionStatus === "failed" ? (
                    <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />
                  ) : (
                    <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" />
                  )}
                  <span>
                    {executionError
                      ? executionError
                      : executionTaskId
                      ? `${executionStatusLabel} · ${executionTaskId}`
                      : !selectedCanRunImageExecution
                      ? "Execution data preview only for this node type."
                      : executionProviderReady
                      ? `${selectedExecutionProvider?.name || selectedExecutionProvider?.id || "Provider"} ready`
                      : providerStatus.detail}
                  </span>
                </div>
                {executionLastUrl ? (
                  <div className="qc-canvas-execution-output">
                    <CanvasImage src={executionLastUrl} alt="Last Canvas execution output" />
                    <span>{executionOutputCount} output image{executionOutputCount === 1 ? "" : "s"} inserted</span>
                  </div>
                ) : null}
                <Button
                  variant="primary"
                  icon={executionBusy ? <Loader2 className="qc-spin" size={15} strokeWidth={2} aria-hidden="true" /> : <Play size={15} strokeWidth={2} aria-hidden="true" />}
                  onClick={() => void runSelectedCanvasNode()}
                  disabled={executionBusy || !selectedCanRunImageExecution}
                >
                  {selectedCanRunImageExecution ? "Run selected" : "Preview only"}
                </Button>
              </section>
              {pendingNodeDelete === selectedNodeId ? (
                <div className="qc-canvas-confirm qc-canvas-node-delete-confirm">
                  <span>{selectedHasLinks ? "Delete node and connected links?" : "Delete selected node?"}</span>
                  <button type="button" onClick={deleteSelectedNode}>Confirm</button>
                  <button type="button" onClick={() => setPendingNodeDelete("")}>Cancel</button>
                </div>
              ) : (
                <Button variant="ghost" icon={<Trash size={15} strokeWidth={2} aria-hidden="true" />} onClick={() => setPendingNodeDelete(selectedNodeId)}>
                  Delete node
                </Button>
              )}
            </>
          ) : selectedConnection ? (
            <div className="qc-canvas-link-selection">
              <div>
                <strong>{selectedConnectionLabel}</strong>
                <span>Saved as compatible minimum connection data: id, from, to.</span>
              </div>
              {selectedConnectionWarning || connectionWarning ? (
                <div className="qc-canvas-link-warning" role="status">
                  <AlertCircle size={15} strokeWidth={2} aria-hidden="true" />
                  <span>{selectedConnectionWarning || connectionWarning}</span>
                </div>
              ) : null}
              <Button variant="ghost" icon={<Link2Off size={15} strokeWidth={2} aria-hidden="true" />} onClick={deleteSelectedConnection}>
                Delete selected link
              </Button>
            </div>
          ) : (
            <div className="qc-canvas-inspector-empty">
              <BoxSelect size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>Select a node to edit content, size, links, or deletion.</span>
            </div>
          )}
        </section>
      </aside>

      <main className="qc-canvas-main">
        <div className="qc-canvas-toolbar">
          <div className="qc-canvas-title-fields">
            <input
              aria-label="Canvas icon"
              className="qc-canvas-icon-input"
              value={draftIcon}
              onChange={(event) => { setDraftIcon(event.target.value); markDirty("Canvas icon changed"); }}
              list="qc-canvas-icons"
              disabled={empty}
            />
            <datalist id="qc-canvas-icons">
              {CANVAS_EMOJIS.map((icon) => <option key={icon} value={icon} />)}
            </datalist>
            <input
              aria-label="Canvas title"
              className="qc-canvas-title-input"
              value={draftTitle}
              onChange={(event) => { setDraftTitle(event.target.value); markDirty("Canvas title changed"); }}
              disabled={empty}
              placeholder="Untitled canvas"
            />
          </div>
          <div className="qc-canvas-toolbar__meta">
            <span className={`qc-canvas-save-state is-${saveState}`}>
              {saveState === "saving" ? <Loader2 className="qc-spin" size={14} strokeWidth={2} aria-hidden="true" /> : <CheckCircle2 size={14} strokeWidth={2} aria-hidden="true" />}
              {saveState === "dirty" ? "Unsaved" : saveState === "saving" ? "Saving" : saveState === "conflict" ? "Conflict" : saveState === "failed" ? "Save failed" : empty ? "No canvas" : "Saved"}
            </span>
            <span>{nodes.length} nodes</span>
            <span>{connections.length} links</span>
          </div>
          <div className="qc-canvas-toolbar__actions">
            <IconButton label="Zoom out" onClick={() => zoomBy(0.88)} disabled={empty}>
              <Minus size={16} strokeWidth={2} aria-hidden="true" />
            </IconButton>
            <span className="qc-canvas-zoom">{Math.round(viewport.scale * 100)}%</span>
            <IconButton label="Zoom in" onClick={() => zoomBy(1.12)} disabled={empty}>
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
            </IconButton>
            <IconButton label="Reset viewport" onClick={resetView} disabled={empty}>
              <Maximize2 size={16} strokeWidth={2} aria-hidden="true" />
            </IconButton>
            <Button variant="primary" icon={<Save size={16} strokeWidth={2} aria-hidden="true" />} onClick={saveCanvas} disabled={empty || saveState === "saving"}>
              Save changes
            </Button>
          </div>
        </div>

        <div className="qc-canvas-status-row">
          <span>{statusText}</span>
          {selectedNode ? <span>Selected: {nodeTitle(selectedNode)}</span> : <span>Drag background to pan · wheel to zoom · drag cards to move</span>}
        </div>

        <div
          className={`qc-canvas-board${empty ? " is-empty" : ""}`}
          ref={boardRef}
          onPointerDown={onBoardPointerDown}
          onWheel={onBoardWheel}
        >
          {empty ? (
            <div className="qc-canvas-empty">
              <BoxSelect size={32} strokeWidth={1.8} aria-hidden="true" />
              <strong>{pendingIntakeItems.length ? "Choose a Canvas target" : "No canvas open"}</strong>
              <span>
                {pendingIntakeItems.length
                  ? `${pendingIntakeItems.length} queued asset${pendingIntakeItems.length === 1 ? "" : "s"} will be placed only after you open an existing canvas or create a new one.`
                  : "Create a new canvas or open an existing one from the list."}
              </span>
              <Button variant="primary" icon={<FilePlus2 size={16} strokeWidth={2} aria-hidden="true" />} onClick={createCanvas}>
                New canvas
              </Button>
            </div>
          ) : nodes.length ? (
            <div
              className="qc-canvas-world"
              style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}
            >
              <svg className="qc-canvas-links" aria-label="Canvas connections" viewBox="-5000 -5000 10000 10000">
                {connections.map((connection, index) => {
                  const path = connectionPath(nodeMap.get(connectionFrom(connection)), nodeMap.get(connectionTo(connection)));
                  if (!path) return null;
                  const key = connectionSelectionKey(connection, index);
                  const selected = key === selectedConnectionKey;
                  const hovered = key === hoveredConnectionKey;
                  const warning = connectionSemanticWarning(nodeMap.get(connectionFrom(connection)), nodeMap.get(connectionTo(connection)));
                  return (
                    <g
                      className={`qc-canvas-link${selected ? " is-selected" : ""}${hovered ? " is-hovered" : ""}${warning ? " has-warning" : ""}`}
                      key={key}
                    >
                      <path
                        className="qc-canvas-link-hit"
                        d={path}
                        role="button"
                        aria-label={`Select link ${connectionLabel(connection, index, nodeMap)}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onPointerEnter={() => setHoveredConnectionKey(key)}
                        onPointerLeave={() => setHoveredConnectionKey((current) => current === key ? "" : current)}
                        onClick={(event) => {
                          event.stopPropagation();
                          selectConnection(connection, index);
                        }}
                      />
                      <path className="qc-canvas-link-path" d={path} />
                    </g>
                  );
                })}
                {linkPreview ? (() => {
                  const fromPoint = nodeAnchorPoint(nodeMap.get(linkPreview.fromId), "output");
                  const toPoint = linkPreview.valid && linkPreview.targetId
                    ? nodeAnchorPoint(nodeMap.get(linkPreview.targetId), "input")
                    : linkPreview.current;
                  const path = fromPoint && toPoint ? connectionPathBetweenPoints(fromPoint, toPoint) : "";
                  return path ? (
                    <path
                      className={`qc-canvas-link-preview${linkPreview.valid ? " is-valid" : " is-invalid"}`}
                      d={path}
                    />
                  ) : null;
                })() : null}
              </svg>
              {nodes.map((node, index) => {
                const id = nodeId(node) || `node-${index}`;
                const size = nodeSize(node);
                return (
                  <CanvasNodeCard
                    key={id}
                    node={node}
                    selected={id === selectedNodeId}
                    size={size}
                    semanticKind={nodeSemanticKind(node)}
                    linkPreviewFromId={linkPreview?.fromId}
                    linkPreviewTargetId={linkPreview?.targetId}
                    onPointerDown={(event) => startNodeDrag(event, node)}
                    onSelect={() => selectNodeForAction(id)}
                    onOutputHandlePointerDown={(event) => startConnectionDrag(event, node)}
                    onOpenImageEditor={openImageEditor}
                    onOpenOutputLightbox={openOutputLightbox}
                  />
                );
              })}
            </div>
          ) : (
            <div className="qc-canvas-empty">
              <Grid2X2 size={32} strokeWidth={1.8} aria-hidden="true" />
              <strong>{draftTitle || "Empty canvas"}</strong>
              <span>This canvas has no nodes yet. Use the Authoring tools to add prompts, images, outputs, or groups.</span>
            </div>
          )}
        </div>
      </main>
      {imageEditor ? (
        <div className="qc-canvas-modal-backdrop" role="presentation" onPointerDown={closeImageEditor}>
          <section
            className="qc-canvas-image-editor-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Canvas image editor"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="qc-canvas-modal-head">
              <div>
                <strong>Image editor</strong>
                <span>{imageEditor.name || "Image node"}</span>
              </div>
              <IconButton label="Close image editor" onClick={closeImageEditor}>
                <X size={16} strokeWidth={2} aria-hidden="true" />
              </IconButton>
            </div>
            <div className="qc-canvas-editor-tabs" role="tablist" aria-label="Image editor modes">
              {(["crop", "mask", "grid"] as CanvasImageEditMode[]).map((mode) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={imageEditor.mode === mode}
                  className={imageEditor.mode === mode ? "is-active" : ""}
                  key={mode}
                  onClick={() => updateImageEditor({ mode })}
                >
                  {mode === "crop" ? "Crop" : mode === "mask" ? "Mask" : "Split"}
                </button>
              ))}
            </div>
            <div className="qc-canvas-editor-body">
              <div className="qc-canvas-editor-stage">
                <div className="qc-canvas-editor-image-frame">
                  <img src={imageEditor.url} alt="Image editor source" draggable={false} />
                  {imageEditor.mode === "crop" ? (
                    <div
                      className="qc-canvas-crop-box"
                      style={{
                        left: `${clampCropPercent(imageEditor.crop).x}%`,
                        top: `${clampCropPercent(imageEditor.crop).y}%`,
                        width: `${clampCropPercent(imageEditor.crop).w}%`,
                        height: `${clampCropPercent(imageEditor.crop).h}%`
                      }}
                      aria-hidden="true"
                    />
                  ) : null}
                  {imageEditor.mode === "mask" ? (
                    <svg
                      className="qc-canvas-mask-surface"
                      aria-label="Mask drawing surface"
                      role="img"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      onPointerDown={(event) => {
                        maskDrawingRef.current = true;
                        try {
                          event.currentTarget.setPointerCapture(event.pointerId);
                        } catch {
                          // Synthetic QA events may not have an active browser pointer capture target.
                        }
                        appendMaskPoint(event, true);
                      }}
                      onPointerMove={(event) => {
                        if (maskDrawingRef.current) appendMaskPoint(event);
                      }}
                      onPointerUp={(event) => {
                        maskDrawingRef.current = false;
                        try {
                          event.currentTarget.releasePointerCapture(event.pointerId);
                        } catch {
                          // Pointer capture is best-effort for the editor surface.
                        }
                      }}
                      onPointerCancel={() => { maskDrawingRef.current = false; }}
                    >
                      <rect width="100" height="100" fill="rgba(0,0,0,0.36)" />
                      {imageEditor.maskStrokes.map((stroke, index) => (
                        <polyline
                          key={`${index}-${stroke.points.length}`}
                          points={stroke.points.map((point) => `${point.x},${point.y}`).join(" ")}
                          fill="none"
                          stroke="rgba(255,255,255,0.92)"
                          strokeLinecap="square"
                          strokeLinejoin="miter"
                          strokeWidth={Math.max(1.5, stroke.size / 5)}
                          vectorEffect="non-scaling-stroke"
                        />
                      ))}
                    </svg>
                  ) : null}
                  {imageEditor.mode === "grid" ? (
                    <svg className="qc-canvas-grid-overlay" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
                      {splitFractions(imageEditor.cols, imageEditor.cutsX).slice(1, -1).map((x) => (
                        <line key={`x-${x}`} x1={x * 100} y1="0" x2={x * 100} y2="100" />
                      ))}
                      {splitFractions(imageEditor.rows, imageEditor.cutsY).slice(1, -1).map((y) => (
                        <line key={`y-${y}`} x1="0" y1={y * 100} x2="100" y2={y * 100} />
                      ))}
                    </svg>
                  ) : null}
                </div>
              </div>
              <div className="qc-canvas-editor-controls">
                {imageEditor.mode === "crop" ? (
                  <div className="qc-canvas-editor-grid">
                    {([
                      ["x", "Crop X"],
                      ["y", "Crop Y"],
                      ["w", "Crop W"],
                      ["h", "Crop H"]
                    ] as const).map(([field, label]) => (
                      <label className="qc-canvas-field" key={field}>
                        <span>{label}</span>
                        <input
                          aria-label={label}
                          type="number"
                          min={field === "w" || field === "h" ? 1 : 0}
                          max={100}
                          value={Math.round(imageEditor.crop[field])}
                          onChange={(event) => updateImageEditor({
                            crop: clampCropPercent({ ...imageEditor.crop, [field]: Number(event.target.value) || 0 })
                          })}
                        />
                      </label>
                    ))}
                  </div>
                ) : imageEditor.mode === "mask" ? (
                  <div className="qc-canvas-editor-grid">
                    <label className="qc-canvas-field">
                      <span>Brush</span>
                      <input
                        aria-label="Mask brush size"
                        type="range"
                        min={6}
                        max={80}
                        value={imageEditor.brush}
                        onChange={(event) => updateImageEditor({ brush: Number(event.target.value) || 36 })}
                      />
                    </label>
                    <button type="button" className="qc-canvas-editor-soft-button" onClick={() => updateImageEditor({ maskStrokes: [] })}>
                      Clear mask
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="qc-canvas-editor-grid">
                      <label className="qc-canvas-field">
                        <span>Rows</span>
                        <input
                          aria-label="Grid rows"
                          type="number"
                          min={1}
                          max={8}
                          value={imageEditor.rows}
                          onChange={(event) => updateImageEditor({ rows: Math.max(1, Math.min(8, Number(event.target.value) || 1)) })}
                        />
                      </label>
                      <label className="qc-canvas-field">
                        <span>Columns</span>
                        <input
                          aria-label="Grid columns"
                          type="number"
                          min={1}
                          max={8}
                          value={imageEditor.cols}
                          onChange={(event) => updateImageEditor({ cols: Math.max(1, Math.min(8, Number(event.target.value) || 1)) })}
                        />
                      </label>
                      <label className="qc-canvas-field">
                        <span>X cuts</span>
                        <input aria-label="Grid X cuts" value={imageEditor.cutsX} placeholder="25, 50, 75 or 0.25, 0.5" onChange={(event) => updateImageEditor({ cutsX: event.target.value })} />
                      </label>
                      <label className="qc-canvas-field">
                        <span>Y cuts</span>
                        <input aria-label="Grid Y cuts" value={imageEditor.cutsY} placeholder="33, 66 or 0.33, 0.66" onChange={(event) => updateImageEditor({ cutsY: event.target.value })} />
                      </label>
                    </div>
                    <div className="qc-canvas-editor-presets" aria-label="Grid split presets">
                      {[
                        ["1x2", 1, 2],
                        ["2x1", 2, 1],
                        ["2x2", 2, 2],
                        ["3x3", 3, 3]
                      ].map(([label, rows, cols]) => (
                        <button type="button" key={label} onClick={() => updateImageEditor({ rows: Number(rows), cols: Number(cols), cutsX: "", cutsY: "" })}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {imageEditorError ? (
                  <div className="qc-canvas-editor-error" role="status">
                    <AlertCircle size={15} strokeWidth={2} aria-hidden="true" />
                    <span>{imageEditorError}</span>
                  </div>
                ) : null}
                <div className="qc-canvas-modal-actions">
                  <Button variant="primary" icon={imageEditorBusy ? <Loader2 className="qc-spin" size={15} strokeWidth={2} aria-hidden="true" /> : <Upload size={15} strokeWidth={2} aria-hidden="true" />} onClick={() => void applyImageEditor()} disabled={imageEditorBusy}>
                    Apply image edit
                  </Button>
                  <Button variant="ghost" icon={<X size={15} strokeWidth={2} aria-hidden="true" />} onClick={closeImageEditor} disabled={imageEditorBusy}>
                    Cancel image edit
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
      {outputLightbox ? (
        <div className="qc-canvas-modal-backdrop qc-canvas-output-backdrop" role="presentation" onPointerDown={closeOutputLightbox}>
          <section
            className="qc-canvas-output-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="Canvas output preview"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="qc-canvas-modal-head">
              <div>
                <strong>Output preview</strong>
                <span>{outputLightbox.title} · {outputLightbox.resolution}</span>
              </div>
              <IconButton label="Close output preview" onClick={closeOutputLightbox}>
                <X size={16} strokeWidth={2} aria-hidden="true" />
              </IconButton>
            </div>
            <div className="qc-canvas-output-stage">
              {outputLightbox.isVideo ? (
                <video src={outputLightbox.url} title={outputLightbox.title} controls playsInline />
              ) : outputLightbox.compareActive && outputLightbox.sourceUrl ? (
                <div className="qc-canvas-output-compare" aria-label="Output compare view">
                  <div className="qc-canvas-output-compare__frame">
                    <img
                      src={outputLightbox.url}
                      alt="Generated output"
                      draggable={false}
                      data-compare-layer="generated"
                      onLoad={(event) => {
                        const image = event.currentTarget;
                        const resolution = image.naturalWidth && image.naturalHeight ? `${image.naturalWidth} x ${image.naturalHeight}` : "--";
                        if (resolution !== outputLightbox.resolution) updateOutputLightbox({ resolution });
                      }}
                    />
                    <div
                      className="qc-canvas-output-compare__source"
                      style={{ clipPath: `inset(0 ${100 - outputLightbox.comparePercent}% 0 0)` }}
                    >
                      <img src={outputLightbox.sourceUrl} alt={outputLightbox.sourceTitle || "Source output"} draggable={false} data-compare-layer="source" />
                    </div>
                    <span style={{ left: `${outputLightbox.comparePercent}%` }} aria-hidden="true" />
                  </div>
                </div>
              ) : (
                <img
                  src={outputLightbox.url}
                  alt="Canvas output preview image"
                  draggable={false}
                  onLoad={(event) => {
                    const image = event.currentTarget;
                    const resolution = image.naturalWidth && image.naturalHeight ? `${image.naturalWidth} x ${image.naturalHeight}` : "--";
                    if (resolution !== outputLightbox.resolution) updateOutputLightbox({ resolution });
                  }}
                />
              )}
            </div>
            {outputLightbox.sourceUrl && !outputLightbox.isVideo ? (
              <label className="qc-canvas-compare-slider">
                <span>{outputLightbox.sourceTitle || "Source image"}</span>
                <input
                  aria-label="Output compare slider"
                  type="range"
                  min={0}
                  max={100}
                  value={outputLightbox.comparePercent}
                  onChange={(event) => updateOutputLightbox({ comparePercent: Number(event.target.value) || 0, compareActive: true })}
                />
              </label>
            ) : null}
            <div className="qc-canvas-modal-actions">
              <Button
                variant="secondary"
                icon={<Maximize2 size={15} strokeWidth={2} aria-hidden="true" />}
                onClick={() => updateOutputLightbox({ compareActive: !outputLightbox.compareActive })}
                disabled={!outputLightbox.sourceUrl || outputLightbox.isVideo}
              >
                Compare output
              </Button>
              <Button variant="secondary" icon={<Download size={15} strokeWidth={2} aria-hidden="true" />} onClick={() => void downloadLightboxOutput()}>
                Download output
              </Button>
              <Button variant="ghost" icon={<X size={15} strokeWidth={2} aria-hidden="true" />} onClick={closeOutputLightbox}>
                Close output preview
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

interface CanvasExecutionDataPanelProps {
  context: CanvasExecutionGraphContext | null;
}

function CanvasExecutionDataPanel({ context }: CanvasExecutionDataPanelProps) {
  if (!context) return null;
  return (
    <section className="qc-canvas-execution-data" aria-label="Canvas execution data preview" data-ready={context.ready ? "true" : "false"}>
      <div className="qc-canvas-section-head">
        <h3>Execution data</h3>
        <span>{context.selectedNodeKind} · {context.ready ? "Ready" : "Needs input"}</span>
      </div>
      <dl className="qc-canvas-execution-stats">
        <div><dt>Upstream</dt><dd>{context.upstreamCount}</dd></div>
        <div><dt>Downstream</dt><dd>{context.downstreamCount}</dd></div>
        <div><dt>Prompts</dt><dd>{context.promptRefs.length}</dd></div>
        <div><dt>Images</dt><dd>{context.imageRefs.length}</dd></div>
        <div><dt>Videos</dt><dd>{context.videoRefs.length}</dd></div>
        <div><dt>Text</dt><dd>{context.textRefs.length}</dd></div>
      </dl>
      <div className="qc-canvas-execution-data__prompt">
        <strong>Collected prompt text</strong>
        <span>{context.promptText || "No prompt text collected."}</span>
      </div>
      <ExecutionRefList title="Linked image refs" refs={context.imageRefs} empty="No linked image refs." />
      <ExecutionRefList title="Linked output refs" refs={context.outputRefs} empty="No linked output refs." />
      <ExecutionRefList title="Linked video refs" refs={context.videoRefs} empty="No linked video refs." />
      <ExecutionRefList title="Linked text / LLM outputs" refs={context.textRefs} empty="No linked text refs." />
      {context.warnings.length ? (
        <div className="qc-canvas-execution-warnings" role="status">
          <AlertCircle size={15} strokeWidth={2} aria-hidden="true" />
          <span>{context.warnings.join(" ")}</span>
        </div>
      ) : null}
    </section>
  );
}

interface ExecutionRefListProps {
  title: string;
  refs: CanvasExecutionRef[];
  empty: string;
}

function ExecutionRefList({ title, refs, empty }: ExecutionRefListProps) {
  return (
    <div className="qc-canvas-execution-ref-list">
      <strong>{title}</strong>
      {refs.length ? (
        refs.slice(0, 4).map((ref) => (
          <span key={ref.id} title={ref.url || ref.text || refLabel(ref)}>
            {refLabel(ref)}{ref.role !== "selected" ? ` · ${ref.role}` : ""}
          </span>
        ))
      ) : (
        <span>{empty}</span>
      )}
      {refs.length > 4 ? <small>{refs.length - 4} more</small> : null}
    </div>
  );
}

interface CanvasNodeCardProps {
  node: CanvasNode;
  selected: boolean;
  size: { w: number; h: number };
  semanticKind: CanvasNodeSemanticKind;
  linkPreviewFromId?: string;
  linkPreviewTargetId?: string;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onSelect: () => void;
  onOutputHandlePointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onOpenImageEditor: (node: CanvasNode) => void;
  onOpenOutputLightbox: (item: CanvasOutputMediaItem) => void;
}

function CanvasNodeCard({
  node,
  selected,
  size,
  semanticKind,
  linkPreviewFromId,
  linkPreviewTargetId,
  onPointerDown,
  onSelect,
  onOutputHandlePointerDown,
  onOpenImageEditor,
  onOpenOutputLightbox
}: CanvasNodeCardProps) {
  const type = nodeType(node);
  const id = nodeId(node);
  const imageUrl = typeof node.url === "string" ? node.url : "";
  const outputItems = canvasOutputMediaItems(node).slice(0, 6);
  const outputMedia = outputItems.map((item) => item.url);
  const generatedItems = outputItems.filter((item) => !item.isVideo).slice(0, 4);
  const videos = [
    ...outputUrlValues(node.videos),
    ...outputUrlValues(node.generatedOutputs).filter(isVideoUrl),
    ...(imageUrl && isVideoUrl(imageUrl) ? [imageUrl] : [])
  ].filter(Boolean).slice(0, 2);
  const unknownCount = nodeUnknownFieldCount(node);
  return (
    <div
      className={`qc-canvas-node is-${type}${selected ? " is-selected" : ""}`}
      style={{
        left: `${asNumber(node.x)}px`,
        top: `${asNumber(node.y)}px`,
        width: `${size.w}px`,
        minHeight: `${size.h}px`
      }}
      onPointerDown={onPointerDown}
      onClick={(event) => { event.stopPropagation(); onSelect(); }}
      data-node-id={id}
      data-node-type={type}
      data-node-semantic-kind={semanticKind}
      role="button"
      tabIndex={0}
    >
      <button
        type="button"
        className={`qc-canvas-connection-handle qc-canvas-connection-handle--input${linkPreviewTargetId === id ? " is-target" : ""}`}
        data-canvas-handle="input"
        data-node-id={id}
        aria-label={`Input handle for ${nodeTitle(node)}`}
        title="Input handle"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <span aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`qc-canvas-connection-handle qc-canvas-connection-handle--output${linkPreviewFromId === id ? " is-source" : ""}`}
        data-canvas-handle="output"
        data-node-id={id}
        aria-label={`Output handle for ${nodeTitle(node)}`}
        title="Output handle"
        onPointerDown={onOutputHandlePointerDown}
        onClick={(event) => event.stopPropagation()}
      >
        <span aria-hidden="true" />
      </button>
      <div className="qc-canvas-node__head">
        <span>{nodeTitle(node)}</span>
        <small>{nodeLabel(node)} · {id || "no id"}</small>
      </div>
      <div className="qc-canvas-node__body">
        {type === "image" ? (
          imageUrl ? (
            <>
              <button
                type="button"
                className="qc-canvas-media-button"
                aria-label={`Edit image ${nodeTitle(node)}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenImageEditor(node);
                }}
              >
                <CanvasImage src={imageUrl} alt={nodeTitle(node)} />
              </button>
              <span>{nodeTitle(node)}</span>
            </>
          ) : (
            <div className="qc-canvas-node__placeholder"><Image size={18} strokeWidth={2} aria-hidden="true" /> Image slot</div>
          )
        ) : type === "prompt" ? (
          <p>{typeof node.text === "string" && node.text.trim() ? node.text : "Empty prompt"}</p>
        ) : type === "loop" ? (
          <div className="qc-canvas-node-exec-card">
            <RefreshCw size={18} strokeWidth={2} aria-hidden="true" />
            <strong>{loopCount(node)} rounds · {String(node.mode || "serial")}</strong>
            <p>{renderLoopPrompt(node) || "No loop prompt"}</p>
          </div>
        ) : type === "output" ? (
          outputMedia.length ? (
            <div className="qc-canvas-output-grid">
              {outputItems.map((item) => (
                <button
                  type="button"
                  className="qc-canvas-output-thumb"
                  aria-label={`Preview output ${item.name}`}
                  key={item.url}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenOutputLightbox(item);
                  }}
                >
                  {item.isVideo ? <CanvasVideo src={item.url} title="Canvas output video" /> : <CanvasImage src={item.url} alt="Canvas output" />}
                  {item.sourceUrl && !item.isVideo ? <span>compare</span> : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="qc-canvas-node__placeholder"><Image size={18} strokeWidth={2} aria-hidden="true" /> No outputs</div>
          )
        ) : type === "llm" ? (
          <div className="qc-canvas-node-exec-card">
            <MessageSquare size={18} strokeWidth={2} aria-hidden="true" />
            <strong>{String(node.model || "LLM model")}</strong>
            <p>{String(node.outputText || node.text || node.prompt || node.systemPrompt || "No text context yet.")}</p>
          </div>
        ) : type === "video" ? (
          videos.length ? (
            <div className="qc-canvas-video-grid">
              {videos.map((url) => <CanvasVideo src={url} title={nodeTitle(node)} key={url} />)}
            </div>
          ) : (
            <div className="qc-canvas-node-exec-card">
              <Video size={18} strokeWidth={2} aria-hidden="true" />
              <strong>{String(node.model || "Video model")}</strong>
              <p>{String(node.prompt || node.text || "Connect prompt and media refs.")}</p>
            </div>
          )
        ) : type === "comfy" || type === "workflow" || type === "generator" || type === "msgen" ? (
          generatedItems.length ? (
            <div className="qc-canvas-output-grid">
              {generatedItems.map((item) => (
                <button
                  type="button"
                  className="qc-canvas-output-thumb"
                  aria-label={`Preview output ${item.name}`}
                  key={item.url}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenOutputLightbox(item);
                  }}
                >
                  <CanvasImage src={item.url} alt="Workflow output" />
                  {item.sourceUrl ? <span>compare</span> : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="qc-canvas-node-exec-card">
              <Workflow size={18} strokeWidth={2} aria-hidden="true" />
              <strong>{String(node.comfyWorkflow || node.workflow_json || node.model || "Workflow")}</strong>
              <p>{String(node.mode || "custom")} · {String(node.runStatus || "not run")}</p>
            </div>
          )
        ) : type === "promptGroup" ? (
          <p>{String(node.text || node.prompt || (Array.isArray(node.items) ? `${node.items.length} grouped prompts` : "Prompt group"))}</p>
        ) : type === "group" ? (
          <p>{Array.isArray(node.items) ? `${node.items.length} referenced items` : "Group placeholder"}</p>
        ) : (
          <div className="qc-canvas-node__placeholder">
            <Grid2X2 size={18} strokeWidth={2} aria-hidden="true" />
            <span>{nodeTitle(node)}</span>
          </div>
        )}
      </div>
      <div className="qc-canvas-node__meta">
        <span>x {Math.round(asNumber(node.x))}</span>
        <span>y {Math.round(asNumber(node.y))}</span>
        {node.running ? <span>running</span> : typeof node.runStatus === "string" && node.runStatus ? <span>{node.runStatus}</span> : null}
        {unknownCount ? <span>{unknownCount} preserved fields</span> : null}
      </div>
    </div>
  );
}

interface CanvasImageProps {
  src: string;
  alt: string;
}

function CanvasImage({ src, alt }: CanvasImageProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className="qc-canvas-node__placeholder">
        <Image size={18} strokeWidth={2} aria-hidden="true" />
        Image unavailable
      </div>
    );
  }

  return <img src={src} alt={alt} draggable={false} onError={() => setFailed(true)} />;
}

interface CanvasVideoProps {
  src: string;
  title: string;
}

function CanvasVideo({ src, title }: CanvasVideoProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className="qc-canvas-node__placeholder">
        <Video size={18} strokeWidth={2} aria-hidden="true" />
        Video unavailable
      </div>
    );
  }

  return <video src={src} title={title} muted playsInline controls={false} onError={() => setFailed(true)} />;
}
