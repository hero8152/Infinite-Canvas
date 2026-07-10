import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Copy, Download, ExternalLink, Eye, Heart, Image, Loader2, RefreshCw, Search, Send, Trash2, X } from "lucide-react";
import type { GalleryAsset, GalleryFacets, GalleryFacetOption, QueueStatus } from "../../lib/api";
import { downloadGalleryAssets, galleryDownloadUrl, getGalleryAssets, hideGalleryAsset, updateGalleryFavorite } from "../../lib/api";
import type { CreationTaskSummary } from "../../lib/creation-state";
import { Button } from "../../components/controls/Button";
import { IconButton } from "../../components/controls/IconButton";
import "../generate/generate.css";
import "../online/online.css";
import "./gallery.css";

export type GalleryTaskSummary = CreationTaskSummary;

interface GalleryWorkspaceProps {
  queueStatus: QueueStatus | null;
  taskMessage: unknown;
  onTaskChange: (task: GalleryTaskSummary) => void;
  onSelectedAssetsChange: (assets: GalleryAsset[]) => void;
  onSendAssetsToCanvas?: (assets: GalleryAsset[]) => void;
}

type FavoriteFilter = "all" | "true";

const DATE_OPTIONS: GalleryFacetOption[] = [
  { value: "all", label: "All dates" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" }
];

const PAGE_SIZES = [24, 36, 60, 96];

function isNewImageMessage(message: unknown): boolean {
  return Boolean(message && typeof message === "object" && (message as { type?: unknown }).type === "new_image");
}

function assetImage(asset: GalleryAsset): string {
  return asset.thumb_url || asset.thumbnail || asset.url || "";
}

function assetTitle(asset: GalleryAsset): string {
  return asset.title || asset.name || asset.filename || "Gallery asset";
}

function assetPrompt(asset: GalleryAsset): string {
  return asset.prompt || asset.phrase || "";
}

function sourceLabel(asset: GalleryAsset): string {
  return (asset.source_labels?.length ? asset.source_labels : [asset.source_label || asset.source || "Unknown"]).filter(Boolean).join(" + ");
}

function formatDate(value?: string | number): string {
  if (!value) return "No date";
  const numeric = typeof value === "number" ? value : Number(value);
  const time = Number.isFinite(numeric) ? (numeric < 1e12 ? numeric * 1000 : numeric) : Date.parse(String(value));
  if (!Number.isFinite(time)) return "No date";
  return new Date(time).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function formatSize(value?: number): string {
  if (!value) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function resolution(asset: GalleryAsset): string {
  return asset.width && asset.height ? `${asset.width} x ${asset.height}` : "";
}

function optionLabel(option: GalleryFacetOption): string {
  return typeof option.count === "number" ? `${option.label} (${option.count})` : option.label;
}

function facetOptions(items: GalleryFacetOption[] | undefined, allLabel: string): GalleryFacetOption[] {
  return [{ value: "all", label: allLabel }, ...(items || [])];
}

function activeContext(asset: GalleryAsset): string {
  return [
    assetTitle(asset),
    sourceLabel(asset),
    asset.artifact_label || asset.artifact_type,
    asset.model,
    asset.status,
    formatDate(asset.created_at)
  ].filter(Boolean).join(" - ");
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

export function GalleryWorkspace({
  queueStatus,
  taskMessage,
  onTaskChange,
  onSelectedAssetsChange,
  onSendAssetsToCanvas
}: GalleryWorkspaceProps) {
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [artifactType, setArtifactType] = useState("all");
  const [status, setStatus] = useState("all");
  const [model, setModel] = useState("all");
  const [date, setDate] = useState("all");
  const [favorite, setFavorite] = useState<FavoriteFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(36);
  const [assets, setAssets] = useState<GalleryAsset[]>([]);
  const [facets, setFacets] = useState<GalleryFacets>({});
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [activeId, setActiveId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [preview, setPreview] = useState<GalleryAsset | null>(null);
  const [actionStatus, setActionStatus] = useState("");

  const activeAsset = useMemo(() => (
    assets.find((asset) => asset.id === activeId) || null
  ), [activeId, assets]);
  const selectedAssets = useMemo(() => {
    const selected = assets.filter((asset) => asset.id && selectedIds.has(asset.id));
    if (selected.length) return selected;
    return activeAsset ? [activeAsset] : [];
  }, [activeAsset, assets, selectedIds]);
  const allPageSelected = assets.length > 0 && assets.every((asset) => asset.id && selectedIds.has(asset.id));
  const queueDetail = queueStatus?.position
    ? `Queue ${queueStatus.position}/${queueStatus.total}`
    : `${queueStatus?.total ?? 0} queued`;

  const publishTask = useCallback((task: GalleryTaskSummary) => {
    onTaskChange(task);
  }, [onTaskChange]);

  const loadAssets = useCallback((signal?: AbortSignal) => {
    setIsLoading(true);
    setErrorText("");
    publishTask({ status: "running", label: "Gallery loading", detail: "Indexing gallery assets" });
    getGalleryAssets({
      q: query,
      source,
      artifact_type: artifactType,
      status,
      model,
      date,
      favorite: favorite === "true" ? true : null,
      page,
      page_size: pageSize
    }, signal)
      .then((response) => {
        const nextAssets = response.assets || [];
        setAssets(nextAssets);
        setFacets(response.facets || {});
        setPage(response.page || 1);
        setPageSize(response.page_size || pageSize);
        setPages(response.pages || 1);
        setTotal(response.total || 0);
        setActionStatus(nextAssets.length ? `${response.total || nextAssets.length} assets indexed` : "No assets match the current filters");
        publishTask({
          status: "idle",
          label: "Gallery ready",
          detail: `${response.total || 0} assets indexed`
        });
      })
      .catch((error) => {
        if (signal?.aborted) return;
        const message = error instanceof Error ? error.message : "Gallery load failed.";
        setErrorText(message);
        setAssets([]);
        publishTask({ status: "failed", label: "Gallery failed", detail: message, error: message });
      })
      .finally(() => {
        if (!signal?.aborted) setIsLoading(false);
      });
  }, [artifactType, date, favorite, model, page, pageSize, publishTask, query, source, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setQuery(searchInput.trim());
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const abort = new AbortController();
    loadAssets(abort.signal);
    return () => abort.abort();
  }, [loadAssets]);

  useEffect(() => {
    if (isNewImageMessage(taskMessage)) loadAssets();
  }, [loadAssets, taskMessage]);

  useEffect(() => {
    setSelectedIds((current) => {
      const available = new Set(assets.map((asset) => asset.id).filter(Boolean) as string[]);
      const next = new Set([...current].filter((id) => available.has(id)));
      return next.size === current.size ? current : next;
    });
    if (activeId && !assets.some((asset) => asset.id === activeId)) setActiveId("");
  }, [activeId, assets]);

  useEffect(() => {
    onSelectedAssetsChange(selectedAssets);
    if (isLoading || errorText) return;
    if (selectedAssets.length) {
      const detail = selectedAssets.length === 1 ? activeContext(selectedAssets[0]) : `${selectedAssets.length} selected assets`;
      publishTask({ status: "idle", label: "Gallery selection", detail });
    } else {
      publishTask({ status: "idle", label: "Gallery ready", detail: `${total} assets indexed` });
    }
  }, [errorText, isLoading, onSelectedAssetsChange, publishTask, selectedAssets, total]);

  const resetFilters = useCallback(() => {
    setSearchInput("");
    setQuery("");
    setSource("all");
    setArtifactType("all");
    setStatus("all");
    setModel("all");
    setDate("all");
    setFavorite("all");
    setPage(1);
  }, []);

  const setFilter = useCallback((setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  }, []);

  const toggleSelected = useCallback((asset: GalleryAsset) => {
    const assetId = asset.id;
    if (!assetId) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  }, []);

  const togglePageSelection = useCallback(() => {
    setSelectedIds((current) => {
      const next = new Set(current);
      assets.forEach((asset) => {
        if (!asset.id) return;
        if (allPageSelected) next.delete(asset.id);
        else next.add(asset.id);
      });
      return next;
    });
  }, [allPageSelected, assets]);

  const toggleFavorite = useCallback(async (asset: GalleryAsset) => {
    if (!asset.id) return;
    const nextFavorite = !asset.favorite;
    setActionStatus(nextFavorite ? "Adding favorite" : "Removing favorite");
    try {
      const response = await updateGalleryFavorite(asset.id, nextFavorite);
      setAssets((current) => current.map((item) => (
        item.id === asset.id ? { ...item, favorite: response.asset.favorite } : item
      )));
      if (activeAsset?.id === asset.id) setActiveId(asset.id);
      setActionStatus(nextFavorite ? "Added to favorites" : "Removed from favorites");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Favorite update failed.";
      setErrorText(message);
      publishTask({ status: "failed", label: "Gallery favorite failed", detail: message, error: message });
    }
  }, [activeAsset?.id, publishTask]);

  const hideAsset = useCallback(async (asset: GalleryAsset) => {
    if (!asset.id) return;
    if (!window.confirm(`Hide ${asset.filename || assetTitle(asset)} from Gallery?`)) return;
    setActionStatus("Hiding asset");
    try {
      await hideGalleryAsset(asset.id);
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(asset.id || "");
        return next;
      });
      if (activeId === asset.id) setActiveId("");
      setActionStatus("Asset hidden from Gallery");
      loadAssets();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Hide failed.";
      setErrorText(message);
      publishTask({ status: "failed", label: "Gallery hide failed", detail: message, error: message });
    }
  }, [activeId, loadAssets, publishTask]);

  const downloadSelected = useCallback(async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setActionStatus("Preparing gallery download");
    try {
      const blob = await downloadGalleryAssets(ids);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `feebee-gallery-${Date.now()}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setActionStatus(`Downloading ${ids.length} selected assets`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Batch download failed.";
      setErrorText(message);
      publishTask({ status: "failed", label: "Gallery download failed", detail: message, error: message });
    }
  }, [publishTask, selectedIds]);

  const copyPrompt = useCallback((asset: GalleryAsset) => {
    void copyToClipboard(assetPrompt(asset));
    setActionStatus("Prompt copied");
  }, []);

  const copyUrl = useCallback((asset: GalleryAsset) => {
    const url = asset.url ? new URL(asset.url, window.location.origin).href : "";
    void copyToClipboard(url);
    setActionStatus("Asset URL copied");
  }, []);

  const sendSelectedToCanvas = useCallback((items: GalleryAsset[] = selectedAssets) => {
    if (!items.length || !onSendAssetsToCanvas) return;
    onSendAssetsToCanvas(items);
    setActionStatus(`${items.length} asset${items.length === 1 ? "" : "s"} sent to Canvas`);
  }, [onSendAssetsToCanvas, selectedAssets]);

  const currentStatus = errorText || (isLoading ? "Loading gallery assets" : actionStatus || `${total} assets match`);
  const activeStatus = errorText ? "error" : isLoading ? "busy" : "idle";

  return (
    <div className="qc-gallery-workspace">
      <aside className="qc-gallery-filters" aria-label="Gallery filters">
        <div className="qc-generate-panel__head">
          <div>
            <h2>Gallery</h2>
            <p>{queueDetail}</p>
          </div>
        </div>

        <label className="qc-gallery-search">
          <Search size={16} strokeWidth={2} aria-hidden="true" />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search prompt, model, filename..."
            type="search"
          />
        </label>

        <div className="qc-online-select-grid qc-gallery-select-grid">
          <label className="qc-select-field">
            <span>Source</span>
            <select value={source} onChange={(event) => setFilter(setSource, event.target.value)}>
              {facetOptions(facets.sources, "All sources").map((option) => (
                <option key={option.value} value={option.value}>{optionLabel(option)}</option>
              ))}
            </select>
          </label>
          <label className="qc-select-field">
            <span>Artifact</span>
            <select value={artifactType} onChange={(event) => setFilter(setArtifactType, event.target.value)}>
              {facetOptions(facets.artifact_types, "All artifacts").map((option) => (
                <option key={option.value} value={option.value}>{optionLabel(option)}</option>
              ))}
            </select>
          </label>
          <label className="qc-select-field">
            <span>Status</span>
            <select value={status} onChange={(event) => setFilter(setStatus, event.target.value)}>
              {facetOptions(facets.statuses, "All statuses").map((option) => (
                <option key={option.value} value={option.value}>{optionLabel(option)}</option>
              ))}
            </select>
          </label>
          <label className="qc-select-field">
            <span>Model</span>
            <select value={model} onChange={(event) => setFilter(setModel, event.target.value)}>
              {facetOptions(facets.models, "All models").map((option) => (
                <option key={option.value} value={option.value}>{optionLabel(option)}</option>
              ))}
            </select>
          </label>
          <label className="qc-select-field">
            <span>Date</span>
            <select value={date} onChange={(event) => setFilter(setDate, event.target.value)}>
              {DATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="qc-select-field">
            <span>Favorite</span>
            <select value={favorite} onChange={(event) => {
              setFavorite(event.target.value as FavoriteFilter);
              setPage(1);
            }}>
              <option value="all">All assets</option>
              <option value="true">Favorites ({facets.favorites || 0})</option>
            </select>
          </label>
        </div>

        <div className="qc-generate-status" data-state={activeStatus}>
          {errorText ? <AlertCircle size={16} strokeWidth={2} aria-hidden="true" /> : isLoading ? <Loader2 className="qc-spin" size={16} strokeWidth={2} aria-hidden="true" /> : <Image size={16} strokeWidth={2} aria-hidden="true" />}
          <span>{currentStatus}</span>
        </div>

        <div className="qc-gallery-filter-actions">
          <Button variant="secondary" icon={<RefreshCw size={15} strokeWidth={2} aria-hidden="true" />} onClick={() => loadAssets()}>
            Refresh
          </Button>
          <Button variant="ghost" onClick={resetFilters}>Clear filters</Button>
        </div>
      </aside>

      <main className="qc-gallery-main" aria-label="Gallery assets">
        <header className="qc-gallery-toolbar">
          <div>
            <h2>Assets</h2>
            <p>Page {page} of {pages} - {total} indexed assets</p>
          </div>
          <div className="qc-gallery-toolbar__actions">
            <Button variant="ghost" onClick={togglePageSelection}>
              {allPageSelected ? "Clear page" : "Select page"}
            </Button>
            <Button
              variant="secondary"
              icon={<Download size={15} strokeWidth={2} aria-hidden="true" />}
              disabled={!selectedIds.size}
              onClick={() => void downloadSelected()}
            >
              Download selected
            </Button>
            <Button
              variant="secondary"
              icon={<Send size={15} strokeWidth={2} aria-hidden="true" />}
              disabled={!selectedAssets.length || !onSendAssetsToCanvas}
              onClick={() => sendSelectedToCanvas()}
            >
              Send to Canvas
            </Button>
          </div>
        </header>

        {isLoading ? (
          <div className="qc-render-card qc-gallery-loading">
            <div className="qc-render-card__preview"><span /></div>
            <div>
              <strong>Loading Gallery</strong>
              <p>Indexing outputs, canvas assets, chats, and batches.</p>
            </div>
          </div>
        ) : null}

        {!isLoading && errorText ? (
          <div className="qc-results-empty" data-state="error">
            <AlertCircle size={22} strokeWidth={1.8} aria-hidden="true" />
            <strong>Gallery unavailable</strong>
            <span>{errorText}</span>
          </div>
        ) : null}

        {!isLoading && !errorText && !assets.length ? (
          <div className="qc-results-empty">
            <Image size={22} strokeWidth={1.8} aria-hidden="true" />
            <strong>No assets found</strong>
            <span>Adjust filters or create new outputs.</span>
          </div>
        ) : null}

        {!errorText && assets.length ? (
          <div className="qc-gallery-grid">
            {assets.map((asset) => {
              const selected = Boolean(asset.id && selectedIds.has(asset.id));
              const active = activeId === asset.id;
              const src = assetImage(asset);
              return (
                <article
                  className={`qc-gallery-card${active ? " is-active" : ""}${selected ? " is-selected" : ""}`}
                  key={asset.id || asset.url}
                >
                  <button className="qc-gallery-card__image" type="button" onClick={() => setActiveId(asset.id || "")}>
                    {src ? <img src={src} alt={assetTitle(asset)} loading="lazy" /> : <Image size={24} strokeWidth={1.8} aria-hidden="true" />}
                  </button>
                  <div className="qc-gallery-card__actions">
                    <IconButton label={selected ? "Deselect asset" : "Select asset"} onClick={() => toggleSelected(asset)}>
                      {selected ? <Check size={14} strokeWidth={2} aria-hidden="true" /> : <span className="qc-gallery-select-dot" />}
                    </IconButton>
                    <IconButton label={asset.favorite ? "Remove favorite" : "Favorite asset"} onClick={() => void toggleFavorite(asset)}>
                      <Heart size={14} strokeWidth={2} aria-hidden="true" fill={asset.favorite ? "currentColor" : "none"} />
                    </IconButton>
                  </div>
                  <div className="qc-gallery-card__body" onClick={() => setActiveId(asset.id || "")}>
                    <p title={assetTitle(asset)}>{assetTitle(asset)}</p>
                    <span title={assetPrompt(asset)}>{assetPrompt(asset) || asset.filename || "No prompt"}</span>
                    <div className="qc-gallery-badges">
                      <em>{asset.artifact_label || asset.artifact_type || "Image"}</em>
                      <em>{sourceLabel(asset)}</em>
                      <em>{formatDate(asset.created_at)}</em>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}

        <footer className="qc-gallery-pagination">
          <Button variant="ghost" disabled={page <= 1 || isLoading} onClick={() => setPage((current) => Math.max(1, current - 1))}>
            Previous
          </Button>
          <label className="qc-select-field">
            <span>Page size</span>
            <select value={pageSize} onChange={(event) => {
              setPageSize(Number(event.target.value) || 36);
              setPage(1);
            }}>
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>{size} / page</option>
              ))}
            </select>
          </label>
          <Button variant="ghost" disabled={page >= pages || isLoading} onClick={() => setPage((current) => Math.min(pages, current + 1))}>
            Next
          </Button>
        </footer>
      </main>

      <aside className="qc-gallery-detail" aria-label="Selected Gallery asset">
        <div className="qc-gallery-detail__head">
          <div>
            <h2>{activeAsset ? assetTitle(activeAsset) : "Select an asset"}</h2>
            <p>{activeAsset ? activeContext(activeAsset) : "Selected metadata appears here."}</p>
          </div>
        </div>

        {activeAsset ? (
          <div className="qc-gallery-detail__body">
            <button className="qc-gallery-detail__preview" type="button" onClick={() => setPreview(activeAsset)}>
              {assetImage(activeAsset) ? <img src={assetImage(activeAsset)} alt={assetTitle(activeAsset)} /> : <Image size={24} strokeWidth={1.8} aria-hidden="true" />}
            </button>
            <div className="qc-gallery-detail__actions">
              <IconButton label="Preview asset" onClick={() => setPreview(activeAsset)}>
                <Eye size={15} strokeWidth={2} aria-hidden="true" />
              </IconButton>
              <IconButton label={activeAsset.favorite ? "Remove favorite" : "Favorite asset"} onClick={() => void toggleFavorite(activeAsset)}>
                <Heart size={15} strokeWidth={2} aria-hidden="true" fill={activeAsset.favorite ? "currentColor" : "none"} />
              </IconButton>
              <IconButton label="Copy prompt" onClick={() => copyPrompt(activeAsset)}>
                <Copy size={15} strokeWidth={2} aria-hidden="true" />
              </IconButton>
              <IconButton label="Copy URL" onClick={() => copyUrl(activeAsset)}>
                <ExternalLink size={15} strokeWidth={2} aria-hidden="true" />
              </IconButton>
              <IconButton label="Send asset to Canvas" onClick={() => sendSelectedToCanvas([activeAsset])} disabled={!onSendAssetsToCanvas}>
                <Send size={15} strokeWidth={2} aria-hidden="true" />
              </IconButton>
              <a className="qc-icon-button" href={activeAsset.url || "#"} target="_blank" rel="noreferrer" aria-label="Open original" title="Open original">
                <ExternalLink size={15} strokeWidth={2} aria-hidden="true" />
              </a>
              <a className="qc-icon-button" href={galleryDownloadUrl(activeAsset)} download aria-label="Download asset" title="Download asset">
                <Download size={15} strokeWidth={2} aria-hidden="true" />
              </a>
              <IconButton label="Hide asset" onClick={() => void hideAsset(activeAsset)}>
                <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
              </IconButton>
            </div>
            <dl className="qc-gallery-meta">
              <div><dt>Prompt</dt><dd>{assetPrompt(activeAsset) || "No prompt"}</dd></div>
              <div><dt>Source</dt><dd>{sourceLabel(activeAsset)}</dd></div>
              <div><dt>Artifact</dt><dd>{activeAsset.artifact_label || activeAsset.artifact_type || "Image"}</dd></div>
              <div><dt>Model</dt><dd>{activeAsset.model || "Unknown"}</dd></div>
              <div><dt>Status</dt><dd>{activeAsset.status || "Unknown"}</dd></div>
              <div><dt>Resolution</dt><dd>{resolution(activeAsset) || "Unknown"}</dd></div>
              <div><dt>File</dt><dd>{[activeAsset.filename, formatSize(activeAsset.size_bytes)].filter(Boolean).join(" - ") || "Unknown"}</dd></div>
              <div><dt>Created</dt><dd>{formatDate(activeAsset.created_at)}</dd></div>
            </dl>
          </div>
        ) : (
          <div className="qc-results-empty qc-gallery-detail-empty">
            <Image size={22} strokeWidth={1.8} aria-hidden="true" />
            <strong>No asset selected</strong>
            <span>Click an asset to inspect it here and in Creation Rail.</span>
          </div>
        )}
      </aside>

      {preview ? (
        <div className="qc-preview" role="dialog" aria-modal="true" aria-label="Gallery asset preview" onClick={() => setPreview(null)}>
          <div className="qc-preview__dialog qc-gallery-preview" onClick={(event) => event.stopPropagation()}>
            <div className="qc-preview__bar">
              <div>
                <strong>{assetTitle(preview)}</strong>
                <span>{activeContext(preview)}</span>
              </div>
              <IconButton label="Close preview" onClick={() => setPreview(null)}>
                <X size={17} strokeWidth={2} aria-hidden="true" />
              </IconButton>
            </div>
            <img src={assetImage(preview)} alt={assetTitle(preview)} />
            <div className="qc-gallery-preview__actions">
              <Button variant="secondary" icon={<Copy size={15} strokeWidth={2} aria-hidden="true" />} onClick={() => copyPrompt(preview)}>
                Copy prompt
              </Button>
              <a className="qc-button qc-button--ghost" href={galleryDownloadUrl(preview)} download>
                <span className="qc-button__icon"><Download size={15} strokeWidth={2} aria-hidden="true" /></span>
                <span>Download</span>
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
