import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { AlertCircle, Bot, Copy, ExternalLink, Loader2, MessageSquare, Plus, RefreshCw, Send, Trash2, UploadCloud, X } from "lucide-react";
import type {
  AIReference,
  ApiConfig,
  ApiProvider,
  ChatConversation,
  ChatConversationSummary,
  ChatMessage,
  GenerateRecord,
  QueueStatus
} from "../../lib/api";
import {
  createConversation,
  deleteConversation,
  getConversation,
  getConversations,
  streamChatMessage,
  uploadAiReferenceImage
} from "../../lib/api";
import type { CreationTaskSummary } from "../../lib/creation-state";
import type { ProviderStatus } from "../../lib/provider-status";
import { getLocalValue, STORAGE_KEYS } from "../../lib/storage";
import { Button } from "../../components/controls/Button";
import { IconButton } from "../../components/controls/IconButton";
import "../generate/generate.css";
import "../online/online.css";
import "./chat.css";

export type ChatTaskSummary = CreationTaskSummary;

interface ChatWorkspaceProps {
  clientId: string;
  apiConfig: ApiConfig | null;
  providerStatus: ProviderStatus;
  queueStatus: QueueStatus | null;
  onTaskChange: (task: ChatTaskSummary) => void;
  onOutputsChange: (outputs: GenerateRecord[]) => void;
  onContextChange: (context: string) => void;
}

const DEFAULT_TASK: ChatTaskSummary = {
  status: "idle",
  label: "Chat ready",
  detail: "No active Chat request"
};

const EMPTY_CONVERSATION: ChatConversation = {
  id: "",
  title: "New chat",
  messages: []
};

function localId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function displayTitle(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 36) || "New chat";
}

function timestampLabel(timestamp?: number): string {
  if (!timestamp) return "";
  const value = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function shortModel(model?: string): string {
  return (model || "").split("/").pop()?.split(":")[0] || "";
}

function lastMessage(messages?: ChatMessage[]): ChatMessage | undefined {
  return [...(messages || [])].reverse().find((message) => message.role !== "system");
}

function messageText(message?: ChatMessage): string {
  if (!message) return "";
  if (message.type === "image" && message.image_url) return "Generated image";
  return message.content || "";
}

function chatProviders(config: ApiConfig | null): ApiProvider[] {
  const configured = (config?.api_providers || []).filter((provider) => (
    provider.enabled !== false && ((provider.chat_models?.length || 0) > 0 || provider.id === "modelscope")
  ));
  if (configured.length) return configured;
  const fallbackModels = config?.chat_models?.length ? config.chat_models : [config?.chat_model || "gpt-5.5"];
  return [{
    id: "comfly",
    name: "Comfly",
    enabled: true,
    has_key: config?.has_api_key,
    chat_models: fallbackModels
  }];
}

function modelOptionsForProvider(provider: ApiProvider | undefined, config: ApiConfig | null): string[] {
  if (provider?.id === "modelscope") {
    return config?.ms_chat_models?.length ? config.ms_chat_models : provider.chat_models || [];
  }
  if (provider?.chat_models?.length) return provider.chat_models;
  if (config?.chat_models?.length) return config.chat_models;
  return [config?.chat_model || "gpt-5.5"];
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

function outputsFromConversation(conversation: ChatConversation | null): GenerateRecord[] {
  return (conversation?.messages || [])
    .filter((message) => Boolean(message.image_url))
    .map((message) => ({
      timestamp: message.created_at || Date.now(),
      prompt: message.content || conversation?.title || "Chat image",
      images: message.image_url ? [message.image_url] : [],
      type: "chat",
      model: message.model,
      status: message.status || "succeeded",
      task_id: message.id
    }))
    .reverse();
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

export function ChatWorkspace({
  clientId,
  apiConfig,
  providerStatus,
  queueStatus,
  onTaskChange,
  onOutputsChange,
  onContextChange
}: ChatWorkspaceProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const sendAbortRef = useRef<AbortController | null>(null);
  const [threads, setThreads] = useState<ChatConversationSummary[]>([]);
  const [activeConversation, setActiveConversation] = useState<ChatConversation | null>(null);
  const [draft, setDraft] = useState("");
  const [refs, setRefs] = useState<AIReference[]>([]);
  const [providerId, setProviderId] = useState(() => localStorage.getItem("chat_provider_id") || "");
  const [model, setModel] = useState(() => localStorage.getItem("chat_model") || "");
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "failed">("idle");
  const [statusText, setStatusText] = useState("Ready");
  const [errorText, setErrorText] = useState("");

  const providers = useMemo(() => chatProviders(apiConfig), [apiConfig]);
  const selectedProvider = useMemo(() => (
    providers.find((provider) => provider.id === providerId) || providers[0]
  ), [providerId, providers]);
  const modelOptions = useMemo(() => modelOptionsForProvider(selectedProvider, apiConfig), [apiConfig, selectedProvider]);
  const providerReady = providerHasUsableKey(selectedProvider, apiConfig);
  const activeMessages = activeConversation?.messages || [];
  const busy = isSending || uploadStatus === "uploading";
  const queueDetail = queueStatus?.position
    ? `Queue ${queueStatus.position}/${queueStatus.total}`
    : `${queueStatus?.total ?? 0} queued`;

  const publishTask = useCallback((task: ChatTaskSummary) => {
    onTaskChange(task);
  }, [onTaskChange]);

  const loadThreads = useCallback((signal?: AbortSignal, openFirst = false) => {
    setIsLoadingThreads(true);
    getConversations(clientId, signal)
      .then(async (response) => {
        const nextThreads = response.conversations || [];
        setThreads(nextThreads);
        if (openFirst && nextThreads[0]) {
          const data = await getConversation(nextThreads[0].id, clientId, signal);
          if (!signal?.aborted) {
            setActiveConversation(data.conversation);
            setStatusText("Loaded latest conversation");
          }
        } else if (openFirst && !nextThreads.length) {
          setActiveConversation(EMPTY_CONVERSATION);
          setStatusText("No chat history yet");
        }
      })
      .catch(() => {
        if (!signal?.aborted) {
          setActiveConversation((current) => current || EMPTY_CONVERSATION);
          setErrorText("Chat history unavailable. Check the backend and try again.");
        }
      })
      .finally(() => {
        if (!signal?.aborted) setIsLoadingThreads(false);
      });
  }, [clientId]);

  const openThread = useCallback(async (conversationId: string) => {
    setErrorText("");
    setStatusText("Opening conversation");
    try {
      const data = await getConversation(conversationId, clientId);
      setActiveConversation(data.conversation);
      setStatusText("Conversation ready");
      publishTask(DEFAULT_TASK);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Conversation unavailable.";
      setErrorText(message);
      publishTask({ status: "failed", label: "Chat load failed", detail: message, error: message });
    }
  }, [clientId, publishTask]);

  const startConversation = useCallback(async () => {
    setErrorText("");
    setDraft("");
    setRefs([]);
    try {
      const data = await createConversation({ title: "New chat" }, clientId);
      setActiveConversation(data.conversation);
      setStatusText("New conversation ready");
      loadThreads(undefined, false);
    } catch {
      setActiveConversation(EMPTY_CONVERSATION);
      setStatusText("New local conversation ready");
    }
    publishTask(DEFAULT_TASK);
  }, [clientId, loadThreads, publishTask]);

  useEffect(() => {
    const abort = new AbortController();
    publishTask(DEFAULT_TASK);
    loadThreads(abort.signal, true);
    return () => {
      abort.abort();
      sendAbortRef.current?.abort();
    };
  }, [loadThreads, publishTask]);

  useEffect(() => {
    const nextProvider = selectedProvider?.id || "";
    if (nextProvider && providerId !== nextProvider) setProviderId(nextProvider);
    if (modelOptions.length && !modelOptions.includes(model)) setModel(modelOptions[0]);
  }, [model, modelOptions, providerId, selectedProvider]);

  useEffect(() => {
    if (providerId) localStorage.setItem("chat_provider_id", providerId);
  }, [providerId]);

  useEffect(() => {
    if (model) localStorage.setItem("chat_model", model);
  }, [model]);

  useEffect(() => {
    const outputs = outputsFromConversation(activeConversation);
    onOutputsChange(outputs.slice(0, 12));
    const latest = messageText(lastMessage(activeConversation?.messages));
    const title = activeConversation?.title || "New chat";
    const providerLabel = selectedProvider?.name || selectedProvider?.id || "Provider";
    const modelLabel = shortModel(model) || "model";
    onContextChange([title, `${providerLabel} / ${modelLabel}`, latest].filter(Boolean).join(" - "));
  }, [activeConversation, model, onContextChange, onOutputsChange, selectedProvider]);

  useEffect(() => {
    requestAnimationFrame(() => {
      const node = messagesRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    });
  }, [activeMessages.length, isSending]);

  const handleFiles = useCallback(async (fileList?: FileList | File[] | null) => {
    const files = Array.from(fileList || []).filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    setErrorText("");
    setUploadStatus("uploading");
    publishTask({ status: "pending", label: "Chat reference upload", detail: `${Math.min(files.length, 4 - refs.length)} image(s)` });
    try {
      const remaining = Math.max(0, 4 - refs.length);
      const uploads = await Promise.all(files.slice(0, remaining).map(async (file) => {
        const response = await uploadAiReferenceImage(file, file.name || "reference.png");
        return response.files[0];
      }));
      const nextRefs = [...refs, ...uploads.filter(Boolean)].slice(0, 4);
      setRefs(nextRefs);
      setUploadStatus("idle");
      setStatusText(nextRefs.length ? `${nextRefs.length} reference image${nextRefs.length === 1 ? "" : "s"} ready` : "Ready");
      publishTask({ status: "idle", label: "Chat ready", detail: "Reference images uploaded" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reference upload failed.";
      setUploadStatus("failed");
      setErrorText(message);
      publishTask({ status: "failed", label: "Chat upload failed", detail: message, error: message });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [publishTask, refs]);

  const removeRef = useCallback((index: number) => {
    setRefs((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }, []);

  const handlePaste = useCallback((event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (files.length) void handleFiles(files);
  }, [handleFiles]);

  const onDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    void handleFiles(event.dataTransfer.files);
  }, [handleFiles]);

  const updateAssistantMessage = useCallback((assistantId: string, content: string, error = false) => {
    setActiveConversation((current) => {
      const base = current || EMPTY_CONVERSATION;
      const messages = (base.messages || []).map((message) => (
        message.id === assistantId
          ? { ...message, content, status: error ? "failed" : "running" }
          : message
      ));
      return { ...base, messages };
    });
  }, []);

  const sendMessage = useCallback(async () => {
    const cleanDraft = draft.trim();
    if (!cleanDraft) {
      const message = "Message is required.";
      setErrorText(message);
      publishTask({ status: "failed", label: "Chat blocked", detail: message, error: message });
      return;
    }
    if (!selectedProvider || !model) {
      const message = "Chat provider unavailable. Add a chat model in API / Models.";
      setErrorText(message);
      publishTask({ status: "failed", label: "Chat blocked", detail: message, prompt: cleanDraft, error: message });
      return;
    }
    if (!providerReady) {
      const message = `${selectedProvider.name || selectedProvider.id} key missing. Add a key in API / Models.`;
      setErrorText(message);
      publishTask({ status: "failed", label: "Chat blocked", detail: message, prompt: cleanDraft, error: message });
      return;
    }

    const pendingRefs = refs.slice();
    const baseConversation = activeConversation || { ...EMPTY_CONVERSATION, title: displayTitle(cleanDraft) };
    const userMessage: ChatMessage = {
      id: localId("user"),
      role: "user",
      content: cleanDraft,
      created_at: Date.now(),
      attachments: pendingRefs,
      mode: "chat"
    };
    const assistantId = localId("assistant");
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      created_at: Date.now(),
      model,
      status: "running"
    };

    setDraft("");
    setRefs([]);
    setErrorText("");
    setIsSending(true);
    setStatusText("Sending message");
    setActiveConversation({
      ...baseConversation,
      title: baseConversation.title || displayTitle(cleanDraft),
      messages: [...(baseConversation.messages || []), userMessage, assistantMessage]
    });
    publishTask({
      status: "running",
      label: "Chat running",
      detail: `${selectedProvider.name || selectedProvider.id} - ${shortModel(model) || model}`,
      prompt: cleanDraft,
      startedAt: Date.now()
    });

    const controller = new AbortController();
    sendAbortRef.current = controller;
    let streamedText = "";

    try {
      await streamChatMessage({
        conversation_id: baseConversation.id || "",
        message: cleanDraft,
        mode: "chat",
        model,
        provider: selectedProvider.id,
        ms_model: selectedProvider.id === "modelscope" ? model : "",
        ms_api_key: selectedProvider.id === "modelscope" ? getLocalValue(STORAGE_KEYS.modelscopeToken) : "",
        reference_images: pendingRefs
      }, clientId, (event) => {
        if (event.type === "meta") {
          setActiveConversation((current) => ({
            ...(current || event.conversation),
            id: event.conversation.id,
            title: event.conversation.title || current?.title || displayTitle(cleanDraft)
          }));
        }
        if (event.type === "delta") {
          streamedText += event.delta || "";
          updateAssistantMessage(assistantId, streamedText);
        }
        if (event.type === "done") {
          setActiveConversation(event.conversation);
          setStatusText("Chat response complete");
          publishTask({
            status: "succeeded",
            label: "Chat response complete",
            detail: shortModel(event.message.model) || `${selectedProvider.name || selectedProvider.id} answered`,
            prompt: cleanDraft
          });
        }
      }, controller.signal);
      loadThreads(undefined, false);
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : "Chat request failed.";
      setErrorText(message);
      updateAssistantMessage(assistantId, message, true);
      setStatusText("Chat request failed");
      publishTask({ status: "failed", label: "Chat failed", detail: message, prompt: cleanDraft, error: message });
    } finally {
      if (sendAbortRef.current === controller) sendAbortRef.current = null;
      setIsSending(false);
    }
  }, [
    activeConversation,
    clientId,
    draft,
    loadThreads,
    model,
    providerReady,
    publishTask,
    refs,
    selectedProvider,
    updateAssistantMessage
  ]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }, [sendMessage]);

  const deleteThread = useCallback(async (thread: ChatConversationSummary) => {
    if (!window.confirm("Delete this conversation?")) return;
    try {
      await deleteConversation(thread.id, clientId);
      if (activeConversation?.id === thread.id) {
        setActiveConversation(EMPTY_CONVERSATION);
        publishTask(DEFAULT_TASK);
      }
      loadThreads(undefined, false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Delete failed.";
      setErrorText(message);
      publishTask({ status: "failed", label: "Chat delete failed", detail: message, error: message });
    }
  }, [activeConversation?.id, clientId, loadThreads, publishTask]);

  const copyMessage = useCallback((message: ChatMessage) => {
    void copyToClipboard([message.content, message.image_url].filter(Boolean).join("\n"));
  }, []);

  const activeTitle = activeConversation?.title || "New chat";
  const statusState = errorText ? "error" : busy ? "busy" : "idle";
  const providerLabel = selectedProvider?.name || selectedProvider?.id || "Provider";

  return (
    <div className="qc-chat-workspace">
      <aside className="qc-chat-sidebar" aria-label="Chat conversations and settings">
        <div className="qc-generate-panel__head">
          <div>
            <h2>Chat</h2>
            <p>{providerStatus.configured ? providerStatus.detail : providerStatus.label}</p>
          </div>
        </div>

        <Button variant="primary" icon={<Plus size={15} strokeWidth={2} aria-hidden="true" />} onClick={() => void startConversation()}>
          New conversation
        </Button>

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
                <option key={option} value={option}>{shortModel(option) || option}</option>
              ))}
            </select>
          </label>
        </div>
        {selectedProvider && !providerReady ? (
          <p className="qc-field-hint is-warning">{providerLabel} key missing. Add one in API / Models.</p>
        ) : null}

        <div className="qc-generate-status" data-state={statusState}>
          {errorText ? <AlertCircle size={16} strokeWidth={2} aria-hidden="true" /> : busy ? <Loader2 className="qc-spin" size={16} strokeWidth={2} aria-hidden="true" /> : <MessageSquare size={16} strokeWidth={2} aria-hidden="true" />}
          <span>{errorText || statusText}</span>
        </div>

        <div className="qc-chat-thread-head">
          <span>Conversations</span>
          <IconButton label="Refresh conversations" onClick={() => loadThreads(undefined, false)}>
            <RefreshCw size={15} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        </div>

        <div className="qc-chat-thread-list">
          {isLoadingThreads ? (
            <div className="qc-chat-thread-empty">Loading conversations...</div>
          ) : threads.length ? threads.map((thread) => (
            <div className="qc-chat-thread-row" key={thread.id}>
              <button
                className={`qc-chat-thread${activeConversation?.id === thread.id ? " is-active" : ""}`}
                type="button"
                onClick={() => void openThread(thread.id)}
              >
                <strong>{thread.title || "New chat"}</strong>
                <span>{thread.last_message || timestampLabel(thread.updated_at)}</span>
              </button>
              <IconButton label="Delete conversation" onClick={() => void deleteThread(thread)}>
                <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
              </IconButton>
            </div>
          )) : (
            <div className="qc-chat-thread-empty">No conversations yet.</div>
          )}
        </div>
      </aside>

      <main className="qc-chat-main" aria-label="Chat workspace">
        <header className="qc-chat-main__head">
          <div>
            <h2>{activeTitle}</h2>
            <p>{providerLabel} - {shortModel(model) || model || "model"} - {queueDetail}</p>
          </div>
          <Button variant="ghost" icon={<RefreshCw size={15} strokeWidth={2} aria-hidden="true" />} onClick={() => loadThreads(undefined, false)}>
            Refresh
          </Button>
        </header>

        <div className="qc-chat-messages" ref={messagesRef}>
          {!activeMessages.length ? (
            <div className="qc-results-empty qc-chat-empty">
              <Bot size={24} strokeWidth={1.8} aria-hidden="true" />
              <strong>Ready for a new conversation</strong>
              <span>Select a thread or send a first message.</span>
            </div>
          ) : activeMessages.map((message, index) => {
            const isUser = message.role === "user";
            const text = messageText(message);
            return (
              <article className={`qc-chat-message ${isUser ? "is-user" : "is-assistant"}`} key={message.id || `${message.role}-${index}`}>
                <div className="qc-chat-message__bubble" data-state={message.status === "failed" ? "failed" : message.status === "running" ? "running" : "ready"}>
                  <div className="qc-chat-message__meta">
                    <strong>{isUser ? "You" : "Assistant"}</strong>
                    <span>{shortModel(message.model) || timestampLabel(message.created_at)}</span>
                  </div>
                  {text ? <p>{text}</p> : <p className="qc-chat-thinking">Thinking...</p>}
                  {message.attachments?.length ? (
                    <div className="qc-chat-ref-list">
                      {message.attachments.map((ref, refIndex) => (
                        <img key={`${ref.url}-${refIndex}`} src={ref.url} alt={ref.name || `Reference ${refIndex + 1}`} />
                      ))}
                    </div>
                  ) : null}
                  {message.image_url ? (
                    <a className="qc-chat-generated" href={message.image_url} target="_blank" rel="noreferrer">
                      <img src={message.image_url} alt={message.content || "Chat generated image"} />
                      <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
                    </a>
                  ) : null}
                  <div className="qc-chat-message__actions">
                    <IconButton label="Copy message" onClick={() => copyMessage(message)}>
                      <Copy size={14} strokeWidth={2} aria-hidden="true" />
                    </IconButton>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div
          className="qc-chat-composer"
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
        >
          <input
            ref={fileInputRef}
            accept="image/*"
            className="qc-online-file-input"
            multiple
            onChange={(event) => void handleFiles(event.target.files)}
            type="file"
          />

          {refs.length ? (
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
          ) : null}

          <div className="qc-chat-composer__row">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Send a message or paste reference images..."
              rows={3}
            />
            <div className="qc-chat-composer__actions">
              <IconButton
                label="Attach reference images"
                disabled={refs.length >= 4 || uploadStatus === "uploading"}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud size={17} strokeWidth={2} aria-hidden="true" />
              </IconButton>
              <Button
                variant="primary"
                icon={isSending ? <Loader2 className="qc-spin" size={15} strokeWidth={2} aria-hidden="true" /> : <Send size={15} strokeWidth={2} aria-hidden="true" />}
                disabled={isSending || uploadStatus === "uploading"}
                onClick={() => void sendMessage()}
              >
                {isSending ? "Sending" : "Send"}
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
