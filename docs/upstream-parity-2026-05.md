# Upstream Parity Matrix - 2026-05

Scope: manually port valuable product features from `origin/main@37b0c8d` into `design/v2.1` without merging upstream runtime files or visual system.

| Area | Upstream capability | Current status | Notes |
| --- | --- | --- | --- |
| API/provider registry | Multiple OpenAI-compatible/APIMart providers | Ported | Provider schema includes custom image generation/edit endpoints, model lists, key clearing, protocol probe, video models, and ModelScope LoRA config. |
| APIMart async protocol | Probe `/v1/tasks` compatibility | Ported | `POST /api/providers/probe-async` validates the async task contract without submitting a paid generation. |
| Online generate | Use generic provider/model registry | Ported | `static/online.html` now selects provider + model from `/api/config.api_providers` and sends `provider_id`. |
| GPT Chat | Use generic chat/image providers | Ported | Chat and image mode route through provider registry; APIMart chat falls back to non-stream response inside the SSE wrapper. |
| Canvas image tasks | Async pending task status | Ported | Canvas API generation uses task polling and terminal `queued/running/succeeded/failed/timeout` semantics. |
| Canvas video | Video node + `/api/canvas-video` | Ported | Uses provider registry, current Comfly-style headers/env, and local output saving. |
| Canvas LLM vision | LLM node accepts image/output/group input | Ported | `CanvasLLMRequest.images` sends local `/output/*` as data URLs and passes remote/data URLs through. |
| Canvas conflict protection | `base_updated_at` save guard | Ported | Stale canvas saves return 409 instead of overwriting newer server state. |
| Canvas logs | Persist run logs | Ported | Canvas saves up to the latest 500 log entries and exposes a log viewer button. |
| Canvas assets | Missing check and zip download | Ported | `/api/canvas-assets/check` and `/api/canvas-assets/download` support local output/static assets and reject unsafe paths. |
| Custom workflows | CRUD under `workflows/custom` | Ported | Built-in workflows remain read-only; path validation stays strict. |
| Workflow test run | Settings page test run | Ported | `POST /api/workflows/{name}/run` maps configured fields to `/api/generate` params. |
| ComfyUI instances | Web-managed backend list | Ported | `GET/PUT /api/comfyui/instances` updates runtime state and `API/.env`. |
| ComfyUI settings page | Workflow upload/config/preview | Ported | Added Mistral-style `static/comfyui-settings.html`; no upstream rounded/Lucide UI. |
| Shared image preview | Zoom, pan, double-click reset | Ported | `static/image-preview.js` provides hard-edge overlay behavior across main pages. |
| Shared history bulk selection | Multi-select foundation | Ported | `static/history-bulk-manager.js` exposes reusable selection/delete hooks and hard-edge selected state. |
| i18n foundation | Chinese/English switching | Ported | `static/i18n.js` provides `StudioI18n.t/apply/setLang/lang`, localStorage language, and page wiring. Dictionaries are intentionally local-project style, not upstream copy. |
| Upstream install/runtime files | `python/`, `get-pip.py`, script overrides | Not ported | Excluded by product scope; current packaging and setup stay intact. |
| Upstream visual system | Lucide, pill radius, slate/blue UI | Not ported | Excluded; guardrails continue to enforce Mistral/pixel design rules. |
| Provider registry rewrite | Full upstream provider settings architecture | Not ported wholesale | Functionality is ported into the existing env/server config model to avoid storing secrets in frontend/canvas JSON. |

Residual external dependencies:

- Live image/video/chat generation still requires valid provider keys in `API/.env`.
- ComfyUI workflow test runs require a reachable ComfyUI backend.
- Automatic tests use smoke/mock style checks and do not depend on paid external generation.
