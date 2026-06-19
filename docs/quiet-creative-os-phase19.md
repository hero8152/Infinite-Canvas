# Quiet Creative OS Phase 19

## Native Canvas LLM Nodes

Phase 19 implements native Canvas LLM node execution after fixing the Phase 18 P2 output-node overlap regression.

- `/app/canvas` remains native and iframe-free.
- `static/canvas.html remains unchanged`.
- `static/comfyui-settings.html remains unchanged`.
- `no backend API schema changes`.
- `no video execution migration`.
- save remains explicit after execution updates.
- Phase 15 asset actions remain preserved.
- Phase 16 connection UX remains preserved.
- Phase 17 execution preview remains preserved.
- Phase 18 generator/comfy execution remains preserved.

## P2 Output Placement Fix

Phase 18 inserted workflow/generator/image execution output nodes at a fixed position to the right of the source node. That could overlap a pre-existing right-side node and intercept selection/clicks.

Phase 19 updates output insertion to choose a deterministic non-overlapping position near the source node or visible viewport:

- `insertExecutionOutputNode` uses `findNonOverlappingOutputPosition` before creating image execution output nodes.
- `insertOrUpdateWorkflowOutputNode` uses the same placement helper before creating workflow/generator output nodes.
- The existing source -> output node link behavior is preserved with minimum-compatible `{id, from, to}` connections.
- The regression is covered by Playwright: place a node to the right of a generator/comfy source, run the source, and verify the generated output does not intercept clicks on the pre-existing right-side node.

## P2 LLM OutputText Fix

This is the LLM outputText-only downstream regression fix.

Downstream generator/workflow prompt collection now treats an upstream LLM node's `outputText` as the canonical text ref after the LLM has run.

- When `outputText` exists, native Canvas passes only that text downstream and omits the LLM node's original `text`, `prompt`, and `chatInput`.
- When `outputText` is empty, native Canvas falls back to the original LLM input fields so pre-run LLM nodes can still provide drafting context.
- This behavior is covered by guardrails and Playwright so a downstream generator/workflow payload cannot silently mix stale LLM input with current LLM output.

## What Changed

Native LLM execution:

- Added typed frontend helpers for `POST /api/canvas-llm`.
- Added a dedicated Canvas LLM execution panel for selected LLM nodes.
- Supports direct text mode with selected node `text` / `prompt`.
- Supports chat mode with `chatInput`, `systemPrompt`, and compatible `messages`.
- Reuses Phase 17 one-hop graph refs for upstream prompt/text context and optional upstream image/output refs supported by the existing endpoint.
- Deterministically dedupes text/image inputs before building the payload.

Payload mapping:

- `message`: direct selected-node text plus upstream prompt/text/LLM refs.
- `model`: selected node model or chat model fallback.
- `provider`: selected `llmProvider` / `providerId` fallback.
- `ms_model`: selected ModelScope model when provider is `modelscope`.
- `system_prompt`: selected `systemPrompt` fallback.
- `messages`: compatible message history in chat mode.
- `images`: upstream image/output refs, capped to the existing backend limit.

Output and status handling:

- Success writes static-compatible `outputText`, `messages`, `runStatus`, `runError`, `model`, and `raw_usage`.
- Failure writes inline `runStatus: "failed"` and `runError`.
- LLM output remains available as an outputText-only text ref to downstream workflow/generator nodes through the existing Phase 17 collector.
- Explicit save continues to preserve `outputText`, `messages`, `runStatus`, `runError`, unknown node fields, unknown canvas fields, viewport, settings, logs, and minimum `{id, from, to}` connections.

Creation Rail context:

- Shows LLM mode, status, error, model, input count, and output preview.
- Existing Canvas execution mode/workflow, asset, link, and graph input context remains intact.

## Preserved / Remaining Canvas Work

Preserved:

- Phase 11 selected prompt/image/output image execution.
- Phase 15 asset actions.
- Phase 16 drag-to-connect, selected link deletion, and inspector Start link fallback.
- Phase 17 execution preview/debug panel.
- Phase 18 generator/comfy execution.
- Existing native routes: Generate, Enhance, Edit, Online, Chat, Gallery, Canvas, Angle, API / Models, ComfyUI.

Remaining Canvas work:

- Real video execution through `/api/canvas-video`.
- Full custom workflow field rendering using `/api/workflows`.
- MSGen, cascade scheduling, pending placeholder parity, typed ports, and multi-hop graph execution.

## Verification

Required commands:

```bash
cd frontend && npm run build
python scripts/guardrails.py
python main.py
lsof -nP -iTCP:3000 -sTCP:LISTEN
git diff --check
git status --porcelain -- static/canvas.html static/comfyui-settings.html
```

Expected results:

- `cd frontend && npm run build`: PASS.
- `python scripts/guardrails.py`: PASS.
- `python main.py`: starts on `http://127.0.0.1:3000`, then is stopped.
- Port 3000 clear after stop.
- `git diff --check`: PASS.
- static file status check: no output.

Playwright QA coverage:

- `/app/canvas` has zero iframes and makes no `/static/canvas.html` request.
- Phase 18 P2 output-node overlap is fixed.
- LLM node can run with direct text.
- LLM node can run with upstream prompt/text context.
- LLM node success writes `outputText` / `runStatus` and remains available as text ref to connected workflow/generator context.
- LLM upstream outputText-only behavior is verified for downstream generator/workflow payloads.
- LLM node failure renders inline error and saves `runError`.
- Save/reload preserves `outputText`, `messages`, `runStatus`, `runError`, and unknown fields.
- Generator/comfy Phase 18 execution still works.
- Phase 11 prompt/image/output image execution still works.
- Phase 15 asset actions still work.
- Phase 16 drag-to-connect and selected-link deletion still work.
- Phase 17 execution preview still works.
- Mobile light/dark has no horizontal overflow.
- Native route console/page errors are zero in the mocked QA run.

## Screenshots

- `docs/quiet-creative-os/screenshots/phase19-canvas-llm-desktop-light.png`
- `docs/quiet-creative-os/screenshots/phase19-canvas-llm-desktop-dark.png`
- `docs/quiet-creative-os/screenshots/phase19-canvas-llm-mobile-light.png`
- `docs/quiet-creative-os/screenshots/phase19-canvas-llm-mobile-dark.png`
- `docs/quiet-creative-os/screenshots/phase19-canvas-llm-output-desktop.png`
- `docs/quiet-creative-os/screenshots/phase19-canvas-output-placement-regression.png`

## Known Risks

- Phase 19 still uses one-hop graph context only. It does not perform unsafe multi-hop graph scheduling.
- Chat mode preserves compatible `messages`, but full static transcript UI parity remains limited to the selected-node inspector.
- Real provider output depends on configured chat provider keys; mocked QA verifies payload and state behavior without relying on external providers.
