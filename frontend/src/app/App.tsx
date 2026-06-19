import { useCallback, useEffect, useMemo, useState } from "react";
import { APP_ROUTES, appPathForRoute, normalizedAppPathForLocation, routeFromLocation, type AppRoute } from "./routes";
import { CreationRail } from "../components/creation-rail/CreationRail";
import { MobileNav } from "../components/shell/MobileNav";
import { Sidebar } from "../components/shell/Sidebar";
import { TopBar } from "../components/shell/TopBar";
import { GenerateWorkspace, type GenerateTaskSummary } from "../features/generate/GenerateWorkspace";
import { EnhanceWorkspace, type EnhanceTaskSummary } from "../features/enhance/EnhanceWorkspace";
import { EditWorkspace, type EditInputSummary, type EditTaskSummary } from "../features/edit/EditWorkspace";
import { OnlineWorkspace, type OnlineTaskSummary } from "../features/online/OnlineWorkspace";
import { AngleWorkspace, type AngleRailContext, type AngleTaskSummary } from "../features/angle/AngleWorkspace";
import { ChatWorkspace, type ChatTaskSummary } from "../features/chat/ChatWorkspace";
import { GalleryWorkspace, type GalleryTaskSummary } from "../features/gallery/GalleryWorkspace";
import { CanvasWorkspace, type CanvasRailContext, type CanvasTaskSummary } from "../features/canvas/CanvasWorkspace";
import { ApiModelsWorkspace, type ApiModelsRailContext, type ApiModelsTaskSummary } from "../features/api-models/ApiModelsWorkspace";
import { ComfyUIWorkspace, type ComfyUIRailContext, type ComfyUITaskSummary } from "../features/comfyui/ComfyUIWorkspace";
import { EmbeddedWorkbench } from "../features/embedded/EmbeddedWorkbench";
import {
  getApiConfig,
  getQueueStatus,
  getRecentAssets,
  type ApiConfig,
  type GalleryAsset,
  type GenerateRecord,
  type QueueStatus
} from "../lib/api";
import { providerStatusFromConfig } from "../lib/provider-status";
import { getOrCreateClientId } from "../lib/storage";
import { connectTaskStream } from "../lib/task-stream";
import { applyTheme, readStoredTheme, type ThemeName } from "../lib/theme";
import {
  galleryAssetToCanvasIntakeItem,
  generateRecordToCanvasIntakeItem,
  writeCanvasIntakeItems,
  type CanvasIntakeItem
} from "../lib/canvas-intake";

export function App() {
  const [activeRoute, setActiveRoute] = useState<AppRoute>(() => routeFromLocation());
  const [theme, setTheme] = useState<ThemeName>(() => readStoredTheme());
  const [clientId] = useState(() => getOrCreateClientId());
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [wsState, setWsState] = useState<"connecting" | "open" | "closed" | "error">("closed");
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null);
  const [apiConfigFailed, setApiConfigFailed] = useState(false);
  const [recentAssets, setRecentAssets] = useState<GalleryAsset[]>([]);
  const [railOpen, setRailOpen] = useState(false);
  const [taskMessage, setTaskMessage] = useState<unknown>(null);
  const [generateTask, setGenerateTask] = useState<GenerateTaskSummary>({
    status: "idle",
    label: "Generate ready",
    detail: "No active Generate task"
  });
  const [generateOutputs, setGenerateOutputs] = useState<GenerateRecord[]>([]);
  const [enhanceTask, setEnhanceTask] = useState<EnhanceTaskSummary>({
    status: "idle",
    label: "Enhance ready",
    detail: "No active Enhance task"
  });
  const [enhanceOutputs, setEnhanceOutputs] = useState<GenerateRecord[]>([]);
  const [editTask, setEditTask] = useState<EditTaskSummary>({
    status: "idle",
    label: "Edit ready",
    detail: "No active Edit task"
  });
  const [editOutputs, setEditOutputs] = useState<GenerateRecord[]>([]);
  const [editContext, setEditContext] = useState("Select an input image and prompt to show Edit context.");
  const [editInput, setEditInput] = useState<EditInputSummary | null>(null);
  const [onlineTask, setOnlineTask] = useState<OnlineTaskSummary>({
    status: "idle",
    label: "Online ready",
    detail: "No active Online task"
  });
  const [onlineOutputs, setOnlineOutputs] = useState<GenerateRecord[]>([]);
  const [angleTask, setAngleTask] = useState<AngleTaskSummary>({
    status: "idle",
    label: "Angle ready",
    detail: "No active Angle task"
  });
  const [angleOutputs, setAngleOutputs] = useState<GenerateRecord[]>([]);
  const [angleContext, setAngleContext] = useState<AngleRailContext>({
    engine: "Local ComfyUI",
    rotation: 0,
    pitch: 0,
    distance: 4,
    prompt: "",
    status: "idle",
    detail: "Upload a source image to run Angle."
  });
  const [chatTask, setChatTask] = useState<ChatTaskSummary>({
    status: "idle",
    label: "Chat ready",
    detail: "No active Chat request"
  });
  const [chatOutputs, setChatOutputs] = useState<GenerateRecord[]>([]);
  const [chatContext, setChatContext] = useState("Select a conversation to show Chat context.");
  const [galleryTask, setGalleryTask] = useState<GalleryTaskSummary>({
    status: "idle",
    label: "Gallery ready",
    detail: "No asset selected"
  });
  const [gallerySelectedAssets, setGallerySelectedAssets] = useState<GalleryAsset[]>([]);
  const [canvasTask, setCanvasTask] = useState<CanvasTaskSummary>({
    status: "idle",
    label: "Canvas ready",
    detail: "No canvas selected"
  });
  const [canvasContext, setCanvasContext] = useState<CanvasRailContext>({
    saveState: "idle",
    nodeCount: 0,
    connectionCount: 0,
    linkState: "No pending link",
    selectedConnectionId: "",
    selectedConnectionLabel: "",
    pendingConnectionState: "No pending link",
    lastConnectionAction: "No connection action yet.",
    connectionWarning: "",
    assetCount: 0,
    downloadableAssetCount: 0,
    assetActionStatus: "idle",
    lastAssetActionStatus: "Check local asset availability before downloading.",
    selectedExecutionNodeKind: "",
    graphPromptCount: 0,
    graphImageRefCount: 0,
    graphVideoRefCount: 0,
    graphTextRefCount: 0,
    graphInputWarnings: "",
    executionDataReady: false,
    selectedCanvasExecutionMode: "",
    selectedCanvasWorkflow: "",
    selectedCanvasRunStatus: "idle",
    selectedCanvasRunError: "",
    selectedCanvasOutputCount: 0,
    selectedCanvasLastOutput: "",
    selectedLLMMode: "",
    selectedLLMRunStatus: "idle",
    selectedLLMRunError: "",
    selectedLLMModel: "",
    selectedLLMInputCount: 0,
    selectedLLMOutputPreview: "",
    selectedVideoMode: "",
    selectedVideoRunStatus: "idle",
    selectedVideoRunError: "",
    selectedVideoModel: "",
    selectedVideoInputCount: 0,
    selectedVideoOutputPreview: "",
    detail: "No canvas selected"
  });
  const [apiModelsTask, setApiModelsTask] = useState<ApiModelsTaskSummary>({
    status: "idle",
    label: "API providers ready",
    detail: "No provider selected"
  });
  const [apiModelsContext, setApiModelsContext] = useState<ApiModelsRailContext>({
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
    lastAction: "Load providers",
    lastStatus: "Idle",
    detail: "Open API / Models to inspect provider configuration."
  });
  const [comfyUITask, setComfyUITask] = useState<ComfyUITaskSummary>({
    status: "idle",
    label: "ComfyUI ready",
    detail: "No workflow selected"
  });
  const [comfyUIContext, setComfyUIContext] = useState<ComfyUIRailContext>({
    instanceCount: 0,
    primaryInstance: "",
    selectedWorkflow: "",
    workflowTitle: "No workflow",
    builtin: false,
    fieldCount: 0,
    nodeCount: 0,
    lastAction: "Load settings",
    lastStatus: "Idle",
    testStatus: "idle",
    lastOutputCount: 0,
    detail: "Open ComfyUI to inspect workflow settings."
  });

  const providerStatus = useMemo(
    () => providerStatusFromConfig(apiConfig, apiConfigFailed),
    [apiConfig, apiConfigFailed]
  );
  const embeddedRoutes = useMemo(() => APP_ROUTES.filter((route) => route.kind === "embedded"), []);
  const canvasRoute = useMemo(() => APP_ROUTES.find((route) => route.id === "canvas"), []);

  const refreshApiConfig = useCallback((signal?: AbortSignal) => {
    getApiConfig(signal)
      .then((config) => {
        setApiConfig(config);
        setApiConfigFailed(false);
      })
      .catch(() => {
        if (!signal?.aborted) setApiConfigFailed(true);
      });
  }, []);

  const refreshQueue = useCallback((signal?: AbortSignal) => {
    getQueueStatus(clientId, signal)
      .then(setQueueStatus)
      .catch(() => {
        if (!signal?.aborted) {
          setQueueStatus({ total: 0, position: 0, status: "offline" });
        }
      });
  }, [clientId]);

  const refreshAssets = useCallback((signal?: AbortSignal) => {
    getRecentAssets(signal)
      .then((response) => setRecentAssets(response.assets || []))
      .catch(() => {
        if (!signal?.aborted) setRecentAssets([]);
      });
  }, []);

  useEffect(() => {
    applyTheme(theme, true);
  }, [theme]);

  useEffect(() => {
    const abort = new AbortController();
    refreshApiConfig(abort.signal);
    refreshQueue(abort.signal);
    refreshAssets(abort.signal);
    const queueTimer = window.setInterval(() => refreshQueue(), 2000);
    const configTimer = window.setInterval(() => refreshApiConfig(), 15000);
    const assetTimer = window.setInterval(() => refreshAssets(), 20000);
    return () => {
      abort.abort();
      window.clearInterval(queueTimer);
      window.clearInterval(configTimer);
      window.clearInterval(assetTimer);
    };
  }, [refreshApiConfig, refreshAssets, refreshQueue]);

  useEffect(() => {
    return connectTaskStream(clientId, {
      onOnlineCount: setOnlineCount,
      onTaskMessage: (message) => {
        setTaskMessage(message);
        refreshQueue();
        refreshAssets();
      },
      onStateChange: setWsState
    });
  }, [clientId, refreshAssets, refreshQueue]);

  useEffect(() => {
    const syncRouteFromLocation = () => {
      const normalizedPath = normalizedAppPathForLocation();
      const nextRoute = routeFromLocation();
      setActiveRoute(nextRoute);
      if (normalizedPath && window.location.pathname !== normalizedPath) {
        window.history.replaceState({}, "", normalizedPath);
      }
    };
    syncRouteFromLocation();
    const onPopState = syncRouteFromLocation;
    const onStorage = (event: StorageEvent) => {
      if (event.key === "studio_theme" || event.key === "canvas_theme") {
        setTheme(readStoredTheme());
      }
      if (event.key?.includes("token") || event.key === "provider_model_keys") {
        refreshApiConfig();
      }
    };
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "api-config-updated" || event.data?.type === "providers-changed") {
        refreshApiConfig();
      }
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("storage", onStorage);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("message", onMessage);
    };
  }, [refreshApiConfig]);

  const navigate = useCallback((route: AppRoute) => {
    setActiveRoute(route);
    const nextPath = appPathForRoute(route);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const sendCanvasIntake = useCallback((items: CanvasIntakeItem[], detail: string) => {
    if (!canvasRoute) return;
    const queued = writeCanvasIntakeItems(items);
    if (!queued.length) return;
    setCanvasTask({
      status: "pending",
      label: "Canvas intake queued",
      detail
    });
    setRailOpen(false);
    navigate(canvasRoute);
  }, [canvasRoute, navigate]);

  const sendGalleryAssetsToCanvas = useCallback((assets: GalleryAsset[]) => {
    const items = assets.map(galleryAssetToCanvasIntakeItem).filter((item): item is CanvasIntakeItem => Boolean(item));
    sendCanvasIntake(items, `${items.length} Gallery asset${items.length === 1 ? "" : "s"} queued`);
  }, [sendCanvasIntake]);

  const sendRecentAssetToCanvas = useCallback((asset: GalleryAsset) => {
    const item = galleryAssetToCanvasIntakeItem(asset);
    if (item) sendCanvasIntake([item], "Recent asset queued for Canvas");
  }, [sendCanvasIntake]);

  const sendOutputToCanvas = useCallback((record: GenerateRecord) => {
    const item = generateRecordToCanvasIntakeItem(record);
    if (item) sendCanvasIntake([item], "Generated output queued for Canvas");
  }, [sendCanvasIntake]);

  return (
    <div className="qc-app-shell">
      <Sidebar
        routes={APP_ROUTES}
        activeRoute={activeRoute}
        apiReady={providerStatus.configured}
        onNavigate={navigate}
      />
      <div className="qc-main">
        <TopBar
          activeRoute={activeRoute}
          queueStatus={queueStatus}
          onlineCount={onlineCount}
          wsState={wsState}
          apiConfig={apiConfig}
          providerStatus={providerStatus}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenRail={() => setRailOpen(true)}
        />
        {activeRoute.kind === "native-generate" ? (
          <div className="qc-workbench qc-workbench--native">
            <GenerateWorkspace
              clientId={clientId}
              apiConfig={apiConfig}
              providerStatus={providerStatus}
              queueStatus={queueStatus}
              taskMessage={taskMessage}
              onTaskChange={setGenerateTask}
              onOutputsChange={setGenerateOutputs}
            />
          </div>
        ) : activeRoute.kind === "native-enhance" ? (
          <div className="qc-workbench qc-workbench--native">
            <EnhanceWorkspace
              clientId={clientId}
              apiConfig={apiConfig}
              providerStatus={providerStatus}
              queueStatus={queueStatus}
              taskMessage={taskMessage}
              onTaskChange={setEnhanceTask}
              onOutputsChange={setEnhanceOutputs}
            />
          </div>
        ) : activeRoute.kind === "native-edit" ? (
          <div className="qc-workbench qc-workbench--native">
            <EditWorkspace
              clientId={clientId}
              apiConfig={apiConfig}
              providerStatus={providerStatus}
              queueStatus={queueStatus}
              taskMessage={taskMessage}
              onTaskChange={setEditTask}
              onOutputsChange={setEditOutputs}
              onContextChange={setEditContext}
              onInputChange={setEditInput}
            />
          </div>
        ) : activeRoute.kind === "native-online" ? (
          <div className="qc-workbench qc-workbench--native">
            <OnlineWorkspace
              clientId={clientId}
              apiConfig={apiConfig}
              providerStatus={providerStatus}
              queueStatus={queueStatus}
              taskMessage={taskMessage}
              onTaskChange={setOnlineTask}
              onOutputsChange={setOnlineOutputs}
            />
          </div>
        ) : activeRoute.kind === "native-angle" ? (
          <div className="qc-workbench qc-workbench--native">
            <AngleWorkspace
              clientId={clientId}
              apiConfig={apiConfig}
              providerStatus={providerStatus}
              queueStatus={queueStatus}
              taskMessage={taskMessage}
              onTaskChange={setAngleTask}
              onOutputsChange={setAngleOutputs}
              onContextChange={setAngleContext}
            />
          </div>
        ) : activeRoute.kind === "native-chat" ? (
          <div className="qc-workbench qc-workbench--native">
            <ChatWorkspace
              clientId={clientId}
              apiConfig={apiConfig}
              providerStatus={providerStatus}
              queueStatus={queueStatus}
              onTaskChange={setChatTask}
              onOutputsChange={setChatOutputs}
              onContextChange={setChatContext}
            />
          </div>
        ) : activeRoute.kind === "native-gallery" ? (
          <div className="qc-workbench qc-workbench--native">
            <GalleryWorkspace
              queueStatus={queueStatus}
              taskMessage={taskMessage}
              onTaskChange={setGalleryTask}
              onSelectedAssetsChange={setGallerySelectedAssets}
              onSendAssetsToCanvas={sendGalleryAssetsToCanvas}
            />
          </div>
        ) : activeRoute.kind === "native-canvas" ? (
          <div className="qc-workbench qc-workbench--native">
            <CanvasWorkspace
              clientId={clientId}
              apiConfig={apiConfig}
              providerStatus={providerStatus}
              taskMessage={taskMessage}
              onTaskChange={setCanvasTask}
              onContextChange={setCanvasContext}
            />
          </div>
        ) : activeRoute.kind === "native-api-models" ? (
          <div className="qc-workbench qc-workbench--native">
            <ApiModelsWorkspace
              apiConfig={apiConfig}
              providerStatus={providerStatus}
              onTaskChange={setApiModelsTask}
              onContextChange={setApiModelsContext}
              onSaved={() => refreshApiConfig()}
            />
          </div>
        ) : activeRoute.kind === "native-comfyui" ? (
          <div className="qc-workbench qc-workbench--native">
            <ComfyUIWorkspace
              clientId={clientId}
              onTaskChange={setComfyUITask}
              onContextChange={setComfyUIContext}
            />
          </div>
        ) : (
          <EmbeddedWorkbench
            routes={embeddedRoutes}
            activeRoute={activeRoute}
            theme={theme}
            taskMessage={taskMessage}
          />
        )}
      </div>
      <CreationRail
        open={railOpen}
        queueStatus={queueStatus}
        onlineCount={onlineCount}
        providerStatus={providerStatus}
        recentAssets={recentAssets}
        activeRouteId={activeRoute.id}
        generateTask={generateTask}
        generateOutputs={generateOutputs}
        enhanceTask={enhanceTask}
        enhanceOutputs={enhanceOutputs}
        editTask={editTask}
        editOutputs={editOutputs}
        editContext={editContext}
        editInput={editInput}
        onlineTask={onlineTask}
        onlineOutputs={onlineOutputs}
        angleTask={angleTask}
        angleOutputs={angleOutputs}
        angleContext={angleContext}
        chatTask={chatTask}
        chatOutputs={chatOutputs}
        chatContext={chatContext}
        galleryTask={galleryTask}
        gallerySelectedAssets={gallerySelectedAssets}
        canvasTask={canvasTask}
        canvasContext={canvasContext}
        apiModelsTask={apiModelsTask}
        apiModelsContext={apiModelsContext}
        comfyUITask={comfyUITask}
        comfyUIContext={comfyUIContext}
        onSendGalleryAssetsToCanvas={sendGalleryAssetsToCanvas}
        onSendRecentAssetToCanvas={sendRecentAssetToCanvas}
        onSendOutputToCanvas={sendOutputToCanvas}
        onClose={() => setRailOpen(false)}
      />
      <MobileNav routes={APP_ROUTES} activeRoute={activeRoute} onNavigate={navigate} />
    </div>
  );
}
