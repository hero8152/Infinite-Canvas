# Quiet Creative OS Phase 5

## Summary

Phase 5 migrates Chat from the legacy `static/gpt-chat.html` iframe into the native React shell while preserving Phase 1-4 behavior.

- `/app/chat` renders `frontend/src/features/chat/ChatWorkspace.tsx`.
- `/app/legacy-chat` loads `/static/gpt-chat.html?v=1` as the fallback iframe route.
- `/app/generate`, `/app/enhance`, and `/app/online` remain native.
- `/app/legacy-generate`, `/app/legacy-enhance`, `/app/legacy-online`, and `/app/legacy-chat` remain available.
- Other major tools remain legacy iframe routes.
- `/` and `/app` remain on the new shell; `/legacy` remains the old static shell.
- No backend API schema change was introduced.

## What Migrated

Chat now has a native React workspace with:

- conversation list loaded from the existing conversation endpoint
- active conversation loading
- new conversation creation
- provider selection from `GET /api/config`
- chat model selection from provider `chat_models`
- message composer with Enter-to-send
- reference image upload through the existing AI upload endpoint
- streaming chat responses through the existing SSE endpoint
- inline missing-key, loading, success, and failed states
- message copy action
- generated image preview/open action when existing chat records contain `image_url`

Creation Rail now switches context when Chat is active:

- current Chat task state
- provider/API status
- selected conversation and latest message context
- Chat image outputs when present, falling back to recent generated assets otherwise

## What Remains Legacy

- `/app/legacy-generate` -> `/static/zimage.html?v=32`
- `/app/legacy-enhance` -> `/static/enhance.html?v=31`
- `/app/legacy-online` -> `/static/online.html?v=1`
- `/app/legacy-chat` -> `/static/gpt-chat.html?v=1`
- `/app/edit` -> `/static/klein.html?v=31`
- `/app/angle` -> `/static/angle.html?v=20260514-cta`
- `/app/flatlay` -> `/static/flatlay.html?v=4`
- `/app/batch-tryon` -> `/static/batch-tryon.html?v=20260514-batch-state-ux`
- `/app/canvas` -> `/static/canvas.html?v=20260514-dnd`
- `/app/gallery` -> `/static/gallery.html?v=3`
- `/app/api-models` -> `/static/api-providers.html?v=1`
- `/app/comfyui` -> `/static/comfyui-settings.html?v=1`

`static/gpt-chat.html` was preserved as fallback. `canvas.html` internals were not migrated.

## Backend Endpoints Reused

No new backend schema was added.

- `GET /api/config`
  - provider list, provider key state, primary provider, chat models, and ModelScope chat models where configured.
- `GET /api/conversations`
  - conversation list for the current browser client id through `X-User-ID`.
- `POST /api/conversations`
  - new conversation creation.
- `GET /api/conversations/{conversation_id}`
  - active conversation loading.
- `DELETE /api/conversations/{conversation_id}`
  - conversation deletion.
- `POST /api/chat/stream`
  - streaming Chat responses with existing `conversation_id`, `message`, `mode`, `model`, `provider`, `ms_model`, `ms_api_key`, and `reference_images` fields.
- `POST /api/chat`
  - retained as a typed helper for the existing non-stream Chat/Image path.
- `POST /api/ai/upload`
  - reference image upload, using the legacy response shape `{ files: [{ url, name }] }`.
- `GET /api/queue_status?client_id=...`
  - queue state.
- `GET /api/gallery/assets?page=1&page_size=6`
  - fallback recent assets for the rail.
- `WS /ws/stats?client_id=...`
  - online count and shared task stream.

## Behavior Differences From `static/gpt-chat.html`

- Native Chat focuses on text chat plus reference attachments; the legacy Chat image mode remains available through `/app/legacy-chat`.
- Missing provider/key/server problems are shown inline instead of relying on alert-only behavior.
- Streaming is rendered as a normal assistant message state rather than the legacy pixel cursor implementation.
- Conversation delete uses the existing browser confirmation before calling the existing delete endpoint.
- Creation Rail shows Chat task and selected conversation context; image outputs appear only when existing chat records include `image_url`.
- Real provider calls were not invoked during verification; missing-key state and mocked streaming success/loading states were verified instead.

## Verification

Commands run:

```bash
pwd
git status -sb
git branch --show-current
npm run build
python scripts/guardrails.py
python main.py
```

Results:

- `pwd`: `/Users/lianglei/Desktop/git/Infinite-Canvas.codex-worktrees/quiet-creative-os-phase1`
- branch: `codex/quiet-creative-os-phase1`
- `npm run build`: pass
- `python scripts/guardrails.py`: pass
- `python main.py`: pass, served `http://127.0.0.1:3000`

Browser verification:

- In-app Browser was attempted first and returned `Browser is not available: iab`.
- Final QA used Playwright MCP with an isolated browser context.

Verified:

- `/app/chat` renders native Chat with no `/static/gpt-chat.html` iframe.
- `/app/legacy-chat` loads `/static/gpt-chat.html?v=1`.
- `/app/generate`, `/app/enhance`, and `/app/online` remain native.
- `/app/legacy-generate`, `/app/legacy-enhance`, and `/app/legacy-online` load old iframes.
- Edit, Angle, Flatlay, Batch try-on, Canvas, Gallery, API / Models, and ComfyUI remain legacy iframe routes.
- `/` loads the new shell.
- `/legacy` loads the old shell.
- Light/dark theme persists after reload.
- Chat missing-key state is shown inline.
- Chat loading and success states work with mocked `/api/chat/stream` SSE responses.
- Creation Rail updates to Chat task and selected conversation context.
- Mobile bottom navigation is visible.
- Mobile Creation Rail opens as a sheet.
- Mobile Chat controls and message area are usable.
- Native route console produced no new errors.

## Screenshots

- `docs/quiet-creative-os/screenshots/phase5-chat-desktop-light.png`
- `docs/quiet-creative-os/screenshots/phase5-chat-desktop-dark.png`
- `docs/quiet-creative-os/screenshots/phase5-chat-mobile-light.png`
- `docs/quiet-creative-os/screenshots/phase5-chat-mobile-dark.png`

## Known Risks

- Real provider execution for Chat was not exercised end-to-end because this environment did not provide confirmed provider credentials.
- Native Chat does not expose the legacy Chat image mode controls in Phase 5; `/app/legacy-chat` remains available for that workflow.
- ModelScope local browser token support follows the existing payload fields and does not add new provider storage.
- Legacy iframe pages remain unchanged and can still emit pre-existing warnings.
- Browser QA used isolated Playwright, not the user's normal Chrome profile.
