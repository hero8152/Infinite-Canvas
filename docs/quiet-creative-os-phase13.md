# Quiet Creative OS Phase 13

## Native API / Models Migration

Phase 13 migrates provider and model configuration from an embedded static page into the React shell.

- `/app/api-models is native`.
- `/app/api-models` renders `ApiModelsWorkspace`, not `EmbeddedWorkbench`.
- `/app/api-models` has no iframe and does not request `static/api-providers.html`.
- `direct /static/api-providers.html` remains available as a static fallback/reference.
- `static/api-providers.html remains unchanged`.
- `ComfyUI remains embedded`.
- No backend API schema changes were made; Phase 13 made no backend API schema changes.

## What Was Migrated

The native workspace lives under `frontend/src/features/api-models/`.

Native API / Models now supports:

- Provider list and selected-provider editor.
- Provider create, draft delete, edit, save, enabled toggle, and primary toggle.
- Base URL, protocol, image generation endpoint, and image edit endpoint fields.
- Image, chat, and video model list editing.
- ModelScope LoRA JSON and model-defaults version editing.
- Inline test connection, fetch models, and async probe actions.
- Inline loading, success, and failure states.
- Shell provider status refresh after save without full page reload.
- Creation Rail context for selected provider, enabled/primary/key status, model counts, LoRA count, last action, and errors.
- Responsive desktop/mobile workbench layout.

## Endpoints Reused

No new backend endpoints or schemas were introduced.

- `GET /api/config`
- `GET /api/providers`
- `PUT /api/providers`
- `POST /api/providers/test-connection`
- `POST /api/providers/fetch-models`
- `POST /api/providers/probe-async`

## Provider Payload Contract

Saving still uses the existing full-provider-list contract:

```json
[
  {
    "id": "provider_id",
    "name": "Provider name",
    "base_url": "https://example.test/v1",
    "protocol": "openai",
    "enabled": true,
    "primary": false,
    "image_generation_endpoint": "/v1/images/generations",
    "image_edit_endpoint": "/v1/images/edits",
    "image_models": ["image-model"],
    "chat_models": ["chat-model"],
    "video_models": ["video-model"],
    "ms_loras": {},
    "ms_defaults_version": "1"
  }
]
```

When the user types a new key for the selected provider, that save payload includes `api_key` only for that selected provider. When the user clears a key, the selected provider payload includes `clear_key: true`. The native UI never sends an empty `api_key` as a key update.

## Hidden Key Behavior

Phase 13 preserves the legacy hidden key behavior:

- Saved key plaintext is never rendered.
- The password input is blank whenever a provider is selected, a save succeeds, or a key is explicitly cleared.
- Existing key state is shown only through backend-provided `has_key` and `key_preview`.
- Screenshots and handoff notes avoid real key values.
- Action payloads use the typed key for test/fetch/probe calls without consuming it, so a successful test can be followed by Save.

This is the same `hidden key behavior` and `clear-key semantics` as the static page, implemented natively.

## Preserved / Deferred

Preserved:

- Native routes: Generate, Enhance, Edit, Online, Angle, Chat, Gallery, Canvas, API / Models.
- Embedded route: ComfyUI.
- `/legacy` redirect/normalization behavior.
- Overlay-only Creation Rail behavior.
- `static/api-providers.html` on disk and directly accessible.

Deferred:

- Native ComfyUI migration.
- Advanced provider validation beyond what the existing endpoints return.
- Any backend key-storage or provider schema changes.

## Verification

Required commands:

```bash
cd frontend && npm run build
python scripts/guardrails.py
python main.py
```

Results are recorded in `REVIEW_HANDOFF.md`.

Command results:

- `cd frontend && npm run build`: PASS.
- `python scripts/guardrails.py`: PASS.
- `python main.py`: PASS; FastAPI started on `http://127.0.0.1:3000` and was stopped cleanly before handoff.

Browser QA result: PASS with mocked provider/config responses and direct static-page verification.

Browser QA coverage:

- `/app/api-models` loads native React API / Models with zero iframes.
- `/app/api-models` makes no `/static/api-providers.html` request.
- `direct /static/api-providers.html` still loads.
- Provider list loads.
- Create, edit, save, and draft-delete provider flows work with mocked safe payloads.
- Enabled and primary toggles update draft provider state.
- Hidden-key behavior is preserved: saved keys render only as key status/preview, the password field is blank after save, and no typed key remains in the DOM.
- Clear key sends `clear_key: true` through the existing save endpoint.
- Test connection, fetch models, and async probe show inline success/failure state.
- A typed new key remains in the password field after test/fetch/probe and is included in the following save payload.
- Shell API status refreshes after save.
- Creation Rail updates for API / Models provider context.
- Mobile API / Models layout is usable.
- Existing native routes still work: Generate, Enhance, Edit, Online, Angle, Chat, Gallery, Canvas.
- ComfyUI remains reachable as an embedded route.
- Native route console has no new errors in the mocked QA run.

## Screenshots

- `docs/quiet-creative-os/screenshots/phase13-api-models-desktop-light.png`
- `docs/quiet-creative-os/screenshots/phase13-api-models-desktop-dark.png`
- `docs/quiet-creative-os/screenshots/phase13-api-models-mobile-light.png`
- `docs/quiet-creative-os/screenshots/phase13-api-models-mobile-dark.png`

## Known Risks

- Real test/fetch/probe behavior depends on each provider's base URL, protocol, permissions, and upstream availability.
- Provider deletion remains a draft change until save, because the existing backend persists the full list with `PUT /api/providers`.
- Browser QA uses isolated Playwright automation, not the user's normal Chrome profile.
