import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, FileJson, Loader2, Play, RefreshCw, Save, Server, Trash2, Upload } from "lucide-react";
import {
  deleteComfyWorkflow,
  getComfyInstances,
  getComfyWorkflow,
  getComfyWorkflows,
  runComfyWorkflow,
  saveComfyInstances,
  saveComfyWorkflowConfig,
  uploadComfyWorkflow,
  type ComfyWorkflowConfig,
  type ComfyWorkflowDetail,
  type ComfyWorkflowSummary
} from "../../lib/api";
import type { CreationTaskSummary } from "../../lib/creation-state";
import { Button } from "../../components/controls/Button";
import { IconButton } from "../../components/controls/IconButton";
import "./comfyui.css";

export type ComfyUITaskSummary = CreationTaskSummary;

export interface ComfyUIRailContext {
  instanceCount: number;
  primaryInstance: string;
  selectedWorkflow: string;
  workflowTitle: string;
  builtin: boolean;
  fieldCount: number;
  nodeCount: number;
  lastAction: string;
  lastStatus: string;
  testStatus: string;
  lastOutputCount: number;
  error?: string;
  detail: string;
}

interface ComfyUIWorkspaceProps {
  clientId: string;
  onTaskChange: (task: ComfyUITaskSummary) => void;
  onContextChange: (context: ComfyUIRailContext) => void;
}

type ComfyAction = "idle" | "load" | "instances" | "detail" | "config" | "upload" | "delete" | "test";
type SelectWorkflowOptions = { force?: boolean };

const DEFAULT_CONFIG: ComfyWorkflowConfig = {
  title: "Workflow",
  fields: []
};

function splitInstances(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function configFieldCount(config: ComfyWorkflowConfig | null | undefined): number {
  return Array.isArray(config?.fields) ? config.fields.length : 0;
}

function workflowTitle(summary: ComfyWorkflowSummary | null | undefined, detail: ComfyWorkflowDetail | null): string {
  return detail?.config?.title || summary?.title || detail?.name || summary?.name || "Workflow";
}

function workflowConfigText(config: ComfyWorkflowConfig | null | undefined, name: string): string {
  return JSON.stringify(config || { ...DEFAULT_CONFIG, title: name || "Workflow" }, null, 2);
}

function parseJsonObject<T extends Record<string, unknown>>(text: string, label: string): T {
  const parsed = JSON.parse(text || "{}") as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as T;
}

function workflowNodes(detail: ComfyWorkflowDetail | null) {
  return Object.entries(detail?.workflow || {})
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([id, node]) => ({
      id,
      classType: node.class_type || "Node",
      inputs: Object.keys(node.inputs || {})
    }));
}

function resultOutputCount(response: Record<string, unknown>): number {
  const images = Array.isArray(response.images) ? response.images : [];
  return images.length;
}

export function ComfyUIWorkspace({ clientId, onTaskChange, onContextChange }: ComfyUIWorkspaceProps) {
  const [instancesText, setInstancesText] = useState("");
  const [instances, setInstances] = useState<string[]>([]);
  const [primaryInstance, setPrimaryInstance] = useState("");
  const [workflows, setWorkflows] = useState<ComfyWorkflowSummary[]>([]);
  const [selectedName, setSelectedName] = useState("");
  const [detail, setDetail] = useState<ComfyWorkflowDetail | null>(null);
  const [configText, setConfigText] = useState(workflowConfigText(DEFAULT_CONFIG, "Workflow"));
  const [uploadName, setUploadName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [activeAction, setActiveAction] = useState<ComfyAction>("load");
  const [statusText, setStatusText] = useState("Loading ComfyUI settings");
  const [errorText, setErrorText] = useState("");
  const [lastAction, setLastAction] = useState("Load settings");
  const [testStatus, setTestStatus] = useState("idle");
  const [lastOutputCount, setLastOutputCount] = useState(0);
  const selectedNameRef = useRef("");
  const detailRef = useRef<ComfyWorkflowDetail | null>(null);

  useEffect(() => {
    selectedNameRef.current = selectedName;
  }, [selectedName]);

  useEffect(() => {
    detailRef.current = detail;
  }, [detail]);

  const selectedSummary = useMemo(
    () => workflows.find((workflow) => workflow.name === selectedName) || null,
    [selectedName, workflows]
  );
  const nodes = useMemo(() => workflowNodes(detail), [detail]);
  const selectedTitle = workflowTitle(selectedSummary, detail);
  const fieldCount = configFieldCount(detail?.config);
  const builtin = Boolean(detail?.builtin || selectedSummary?.builtin);
  const busy = activeAction !== "idle";

  const setTask = useCallback((task: ComfyUITaskSummary) => {
    onTaskChange(task);
  }, [onTaskChange]);

  const loadInstances = useCallback(async (signal?: AbortSignal) => {
    const response = await getComfyInstances(signal);
    const nextInstances = response.instances || [];
    setInstances(nextInstances);
    setPrimaryInstance(response.primary || nextInstances[0] || "");
    setInstancesText(nextInstances.join("\n"));
    return response;
  }, []);

  const selectWorkflow = useCallback(async (name: string, signal?: AbortSignal, options: SelectWorkflowOptions = {}) => {
    if (!name) {
      selectedNameRef.current = "";
      detailRef.current = null;
      setSelectedName("");
      setDetail(null);
      setConfigText(workflowConfigText(DEFAULT_CONFIG, "Workflow"));
      return null;
    }
    if (!options.force && selectedNameRef.current === name && detailRef.current?.name === name) {
      setDeleteArmed(false);
      return detailRef.current;
    }
    setActiveAction("detail");
    setErrorText("");
    setStatusText("Loading workflow detail");
    selectedNameRef.current = name;
    setSelectedName(name);
    setDeleteArmed(false);
    const response = await getComfyWorkflow(name, signal);
    detailRef.current = response;
    setDetail(response);
    setConfigText(workflowConfigText(response.config, response.name));
    setStatusText(`Loaded ${response.config?.title || response.name}`);
    return response;
  }, []);

  const loadWorkflows = useCallback(async (preferredName?: string, signal?: AbortSignal) => {
    const response = await getComfyWorkflows(signal);
    const nextWorkflows = response.workflows || [];
    setWorkflows(nextWorkflows);
    const currentName = selectedNameRef.current;
    const nextName = preferredName && nextWorkflows.some((workflow) => workflow.name === preferredName)
      ? preferredName
      : currentName && nextWorkflows.some((workflow) => workflow.name === currentName)
      ? currentName
      : nextWorkflows[0]?.name || "";
    if (nextName) {
      await selectWorkflow(nextName, signal, { force: Boolean(preferredName) });
    } else {
      selectedNameRef.current = "";
      detailRef.current = null;
      setSelectedName("");
      setDetail(null);
      setConfigText(workflowConfigText(DEFAULT_CONFIG, "Workflow"));
      setStatusText("No custom workflows configured");
    }
    return nextWorkflows;
  }, [selectWorkflow]);

  const loadAll = useCallback((signal?: AbortSignal) => {
    setActiveAction("load");
    setErrorText("");
    setStatusText("Loading ComfyUI settings");
    setTask({ status: "pending", label: "ComfyUI loading", detail: "Reading instances and workflows" });
    Promise.all([loadInstances(signal), loadWorkflows(undefined, signal)])
      .then(([instanceResponse, workflowResponse]) => {
        setStatusText(`Loaded ${instanceResponse.instances.length} instance${instanceResponse.instances.length === 1 ? "" : "s"} and ${workflowResponse.length} workflow${workflowResponse.length === 1 ? "" : "s"}`);
        setTask({ status: "idle", label: "ComfyUI ready", detail: `${workflowResponse.length} workflow${workflowResponse.length === 1 ? "" : "s"} available` });
      })
      .catch((error) => {
        if (signal?.aborted) return;
        const message = error instanceof Error ? error.message : "ComfyUI settings failed to load.";
        setErrorText(message);
        setStatusText("Load failed");
        setTask({ status: "failed", label: "ComfyUI load failed", detail: message, error: message });
      })
      .finally(() => {
        if (!signal?.aborted) setActiveAction("idle");
      });
  }, [loadInstances, loadWorkflows, setTask]);

  useEffect(() => {
    const abort = new AbortController();
    loadAll(abort.signal);
    return () => abort.abort();
  }, [loadAll]);

  useEffect(() => {
    onContextChange({
      instanceCount: instances.length,
      primaryInstance,
      selectedWorkflow: selectedName,
      workflowTitle: selectedTitle,
      builtin,
      fieldCount,
      nodeCount: nodes.length,
      lastAction,
      lastStatus: statusText,
      testStatus,
      lastOutputCount,
      error: errorText,
      detail: selectedName
        ? `${selectedTitle} · ${builtin ? "builtin" : "custom"} · ${fieldCount} fields`
        : "No workflow selected."
    });
  }, [builtin, errorText, fieldCount, instances.length, lastAction, lastOutputCount, nodes.length, onContextChange, primaryInstance, selectedName, selectedTitle, statusText, testStatus]);

  const runWithStatus = useCallback(async (action: ComfyAction, label: string, work: () => Promise<void>) => {
    setActiveAction(action);
    setLastAction(label);
    setErrorText("");
    setStatusText(`${label} running`);
    setTask({ status: "running", label, detail: selectedTitle });
    try {
      await work();
      setTask({ status: "succeeded", label: `${label} complete`, detail: selectedTitle });
    } catch (error) {
      const message = error instanceof Error ? error.message : `${label} failed.`;
      if (action === "test") setTestStatus("failed");
      setErrorText(message);
      setStatusText(`${label} failed`);
      setTask({ status: "failed", label: `${label} failed`, detail: message, error: message });
    } finally {
      setActiveAction("idle");
    }
  }, [selectedTitle, setTask]);

  const saveInstancesAction = useCallback(() => {
    void runWithStatus("instances", "Save instances", async () => {
      const response = await saveComfyInstances(splitInstances(instancesText));
      setInstances(response.instances || []);
      setPrimaryInstance(response.primary || response.instances?.[0] || "");
      setInstancesText((response.instances || []).join("\n"));
      setStatusText("Instances saved.");
    });
  }, [instancesText, runWithStatus]);

  const refreshWorkflowsAction = useCallback(() => {
    void runWithStatus("load", "Refresh workflows", async () => {
      const nextWorkflows = await loadWorkflows();
      setStatusText(`Loaded ${nextWorkflows.length} workflow${nextWorkflows.length === 1 ? "" : "s"}`);
    });
  }, [loadWorkflows, runWithStatus]);

  const selectWorkflowAction = useCallback((name: string) => {
    void runWithStatus("detail", "Load workflow", async () => {
      await selectWorkflow(name);
    });
  }, [runWithStatus, selectWorkflow]);

  const saveConfigAction = useCallback(() => {
    if (!selectedName || builtin) return;
    void runWithStatus("config", "Save config", async () => {
      const config = parseJsonObject<ComfyWorkflowConfig>(configText, "Config JSON");
      await saveComfyWorkflowConfig(selectedName, config);
      await selectWorkflow(selectedName, undefined, { force: true });
      setStatusText("Config saved.");
    });
  }, [builtin, configText, runWithStatus, selectWorkflow, selectedName]);

  const uploadWorkflowAction = useCallback(() => {
    void runWithStatus("upload", "Upload workflow", async () => {
      if (!uploadFile) throw new Error("Choose a workflow JSON file.");
      const raw = await uploadFile.text();
      const workflow = parseJsonObject<Record<string, unknown>>(raw, "Workflow JSON");
      if (!Object.keys(workflow).length) throw new Error("Workflow JSON cannot be empty.");
      const sample = Object.values(workflow)[0];
      if (!sample || typeof sample !== "object" || Array.isArray(sample) || !("class_type" in sample)) {
        throw new Error("Workflow JSON must be a ComfyUI API workflow with class_type nodes.");
      }
      const response = await uploadComfyWorkflow({ name: uploadName.trim() || uploadFile.name, workflow });
      await loadWorkflows(response.name);
      setUploadName("");
      setUploadFile(null);
      setStatusText("Workflow uploaded.");
    });
  }, [loadWorkflows, runWithStatus, uploadFile, uploadName]);

  const deleteWorkflowAction = useCallback(() => {
    if (!selectedName || builtin) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      setStatusText("Confirm delete to remove this custom workflow.");
      return;
    }
    void runWithStatus("delete", "Delete workflow", async () => {
      await deleteComfyWorkflow(selectedName);
      setDeleteArmed(false);
      const nextWorkflows = await loadWorkflows("");
      setStatusText(nextWorkflows.length ? "Workflow deleted." : "Workflow deleted. No custom workflows remain.");
    });
  }, [builtin, deleteArmed, loadWorkflows, runWithStatus, selectedName]);

  const testRunAction = useCallback(() => {
    if (!selectedName) return;
    void runWithStatus("test", "Test run", async () => {
      setTestStatus("running");
      setLastOutputCount(0);
      const config = parseJsonObject<ComfyWorkflowConfig>(configText, "Config JSON");
      const fields: Record<string, unknown> = {};
      (config.fields || []).forEach((field) => {
        if (field.id) fields[field.id] = field.default ?? "";
      });
      const response = await runComfyWorkflow(selectedName, {
        prompt: "test run from settings",
        width: 1024,
        height: 1024,
        type: "custom-workflow-test",
        fields,
        config,
        client_id: clientId
      });
      const outputCount = resultOutputCount(response);
      setLastOutputCount(outputCount);
      setTestStatus("succeeded");
      setStatusText(`Test run finished: ${outputCount} images.`);
    });
  }, [clientId, configText, runWithStatus, selectedName]);

  const onUploadFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setUploadFile(file);
    if (file && !uploadName) setUploadName(file.name);
    setErrorText("");
  }, [uploadName]);

  return (
    <section className="qc-comfy-workspace" aria-label="Native ComfyUI settings workspace">
      <aside className="qc-comfy-sidebar" aria-label="ComfyUI instances and workflows">
        <div className="qc-comfy-panel-head">
          <div>
            <h2>ComfyUI</h2>
            <span>{instances.length} instance{instances.length === 1 ? "" : "s"} · {workflows.length} workflow{workflows.length === 1 ? "" : "s"}</span>
          </div>
          <IconButton label="Refresh workflows" onClick={refreshWorkflowsAction} disabled={busy}>
            <RefreshCw size={16} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        </div>

        <section className="qc-comfy-section">
          <div className="qc-comfy-section-head">
            <h3>Instances</h3>
            <span>{primaryInstance || "No primary"}</span>
          </div>
          <Field label="ComfyUI instances">
            <textarea value={instancesText} spellCheck={false} placeholder="127.0.0.1:8188" onChange={(event) => setInstancesText(event.target.value)} />
          </Field>
          <Button variant="secondary" icon={<Server size={15} strokeWidth={2} aria-hidden="true" />} onClick={saveInstancesAction} disabled={busy}>
            Save instances
          </Button>
        </section>

        <section className="qc-comfy-section qc-comfy-section--list">
          <div className="qc-comfy-section-head">
            <h3>Workflows</h3>
            <span>{workflows.length ? "Custom" : "Empty"}</span>
          </div>
          <div className="qc-comfy-workflow-list">
            {workflows.map((workflow) => (
              <button
                type="button"
                className={`qc-comfy-workflow-item${workflow.name === selectedName ? " is-active" : ""}`}
                key={workflow.name}
                onClick={() => selectWorkflowAction(workflow.name)}
                disabled={busy}
              >
                <span>{workflow.title || workflow.name}</span>
                <small>{workflow.name}</small>
                <em>{workflow.builtin ? "Builtin" : "Custom"} · {workflow.field_count || 0} fields</em>
              </button>
            ))}
            {!workflows.length && !busy ? (
              <div className="qc-comfy-empty">
                <FileJson size={18} strokeWidth={1.8} aria-hidden="true" />
                <span>No custom workflows yet</span>
              </div>
            ) : null}
          </div>
        </section>
      </aside>

      <main className="qc-comfy-editor">
        <header className="qc-comfy-editor-head">
          <div>
            <h3>{selectedTitle}</h3>
            <span>{selectedName || "Select or upload a workflow"}</span>
          </div>
          <div className="qc-comfy-editor-actions">
            <Button variant="secondary" icon={<Play size={15} strokeWidth={2} aria-hidden="true" />} onClick={testRunAction} disabled={!selectedName || busy}>
              Test run
            </Button>
            <Button variant="primary" icon={<Save size={15} strokeWidth={2} aria-hidden="true" />} onClick={saveConfigAction} disabled={!selectedName || builtin || busy}>
              Save config
            </Button>
          </div>
        </header>

        {selectedName ? (
          <div className="qc-comfy-editor-body">
            <section className="qc-comfy-section">
              <div className="qc-comfy-section-head">
                <h4>Workflow detail</h4>
                <span>{builtin ? "Builtin read-only" : "Custom editable"}</span>
              </div>
              <dl className="qc-comfy-meta">
                <div><dt>Name</dt><dd>{detail?.name || selectedName}</dd></div>
                <div><dt>Status</dt><dd>{builtin ? "Builtin" : "Custom"}</dd></div>
                <div><dt>Fields</dt><dd>{fieldCount}</dd></div>
                <div><dt>Nodes</dt><dd>{nodes.length}</dd></div>
              </dl>
            </section>

            <section className="qc-comfy-section">
              <div className="qc-comfy-section-head">
                <h4>Config JSON</h4>
                <span>{builtin ? "Read-only" : "Overrides"}</span>
              </div>
              <Field label="Field config JSON">
                <textarea className="qc-comfy-code-area" value={configText} spellCheck={false} readOnly={builtin} onChange={(event) => setConfigText(event.target.value)} />
              </Field>
            </section>

            <section className="qc-comfy-section">
              <div className="qc-comfy-section-head">
                <h4>Node graph preview</h4>
                <span>{nodes.length} nodes</span>
              </div>
              <div className="qc-comfy-node-grid" aria-label="Node graph preview">
                {nodes.slice(0, 160).map((node) => (
                  <article className="qc-comfy-node-card" key={node.id}>
                    <strong>{node.id}</strong>
                    <span>{node.classType}</span>
                    <small>{node.inputs.length ? node.inputs.join(", ") : "No inputs"}</small>
                  </article>
                ))}
                {!nodes.length ? <div className="qc-comfy-empty">Empty workflow.</div> : null}
              </div>
            </section>
          </div>
        ) : (
          <div className="qc-comfy-empty qc-comfy-empty--large">
            <FileJson size={24} strokeWidth={1.8} aria-hidden="true" />
            <strong>No workflow selected</strong>
            <span>Upload a custom workflow JSON to begin.</span>
          </div>
        )}
      </main>

      <aside className="qc-comfy-diagnostics" aria-label="ComfyUI workflow actions">
        <div className="qc-comfy-diagnostic-card">
          <h3>Status</h3>
          <div className="qc-comfy-status" data-state={errorText ? "failed" : activeAction !== "idle" ? "running" : "idle"}>
            {activeAction !== "idle" ? <Loader2 className="qc-spin" size={16} strokeWidth={2} aria-hidden="true" /> : errorText ? <AlertCircle size={16} strokeWidth={2} aria-hidden="true" /> : <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" />}
            <span>{errorText || statusText}</span>
          </div>
          <dl className="qc-comfy-meta">
            <div><dt>Primary</dt><dd>{primaryInstance || "None"}</dd></div>
            <div><dt>Selected</dt><dd>{selectedName || "None"}</dd></div>
            <div><dt>Test</dt><dd>{testStatus}</dd></div>
            <div><dt>Outputs</dt><dd>{lastOutputCount}</dd></div>
          </dl>
        </div>

        <div className="qc-comfy-diagnostic-card">
          <h3>Upload</h3>
          <Field label="Upload name">
            <input value={uploadName} spellCheck={false} placeholder="custom-workflow.json" onChange={(event) => setUploadName(event.target.value)} />
          </Field>
          <Field label="Upload API workflow JSON">
            <input type="file" accept="application/json,.json" onChange={onUploadFileChange} />
          </Field>
          <Button variant="secondary" icon={<Upload size={15} strokeWidth={2} aria-hidden="true" />} onClick={uploadWorkflowAction} disabled={busy}>
            Upload workflow
          </Button>
        </div>

        <div className="qc-comfy-diagnostic-card">
          <h3>Danger zone</h3>
          <Button variant="ghost" icon={<Trash2 size={15} strokeWidth={2} aria-hidden="true" />} onClick={deleteWorkflowAction} disabled={!selectedName || builtin || busy}>
            {deleteArmed ? "Confirm delete" : "Delete custom"}
          </Button>
          <span className="qc-comfy-note">{builtin ? "Builtin workflows are read-only." : "Custom workflow deletion requires a second confirmation click."}</span>
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
    <label className="qc-comfy-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
