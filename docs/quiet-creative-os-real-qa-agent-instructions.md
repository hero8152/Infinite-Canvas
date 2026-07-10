# Real QA Agent Instructions

Copy this prompt to the next agent when it is time to test the committed native migration with real local configuration.

```text
You are the QA agent for Quiet Creative OS native migration.

Worktree:
 /Users/lianglei/Desktop/git/Infinite-Canvas.codex-worktrees/quiet-creative-os-phase1

Expected branch:
 codex/quiet-creative-os-phase1

Current checkpoint commit:
 1887876 feat(qcos): migrate native creative os canvas

Before doing anything, run and report:
- pwd
- git status -sb
- git branch --show-current
- git log -1 --oneline

If pwd or branch is wrong, stop immediately.

Role:
- Do not create a new worktree.
- Do not push, merge, rebase, or rewrite history.
- Do not modify static/canvas.html or static/comfyui-settings.html.
- Do not change backend API schemas.
- Prefer real local acceptance testing over adding new features.
- If a real test fails, diagnose and fix only the smallest necessary frontend/backend bug, then rerun the relevant verification.

Read first:
- AGENTS.md if present
- REVIEW_HANDOFF.md
- docs/quiet-creative-os-next-agent-handoff.md
- docs/quiet-creative-os-native-canvas-complete-migration.md
- docs/quiet-creative-os-real-qa-agent-instructions.md

Baseline verification:
- cd frontend && npm run build
- python scripts/guardrails.py
- python main.py
- npx playwright test tests/native_canvas_complete_qa.spec.mjs --reporter=line
- Stop python main.py after testing.
- Confirm: lsof -nP -iTCP:3000 -sTCP:LISTEN || true shows no listener after stop.

Real browser acceptance:
Use Playwright or a local browser at http://127.0.0.1:3000. Prefer Playwright for deterministic checks. Use the user's normal Chrome only if real login/cookies/extensions matter.

Test these routes:
- /app
- /app/generate
- /app/enhance
- /app/edit
- /app/online
- /app/angle
- /app/chat
- /app/gallery
- /app/canvas
- /app/api-models
- /app/comfyui

For every route, verify:
- route loads without blank screen
- no iframe on native routes
- no visible Legacy navigation
- light/dark theme toggles and persists
- mobile viewport has no horizontal overflow
- browser console has no new native-route errors

Real provider/config acceptance:
1. Open /app/api-models.
2. Verify provider list and selected provider load.
3. Verify saved key status is shown without exposing secret values.
4. If the user has credentials configured, run Test connection / Fetch models / Probe where safe.
5. Do not paste, print, or commit API keys.

Real Canvas acceptance:
1. Open /app/canvas.
2. Create a new canvas.
3. Add an image node using a real local image upload or existing /output asset.
4. Save, reload, and confirm the image node remains.
5. Use image editor Crop; confirm edited asset uploads and persists after save/reload.
6. Use image editor Mask; confirm a role:mask image node is created and persists.
7. Use image editor Split; test both decimal cuts such as 0.25 and percent cuts such as 50%; confirm tile nodes persist.
8. Create prompt, LLM, generator, workflow, video, output, loop, prompt group, and ModelScope nodes.
9. Connect nodes using drag handles; delete at least one selected link; save/reload and confirm connections persist.
10. Run LLM -> Generator with real configured provider if credentials are available.
11. Run a ComfyUI workflow against the user's real local ComfyUI if available.
12. Run video node if the configured provider supports it.
13. Verify outputs insert without overlap, connect back to source nodes where expected, and preserve runStatus/runError.
14. Open output lightbox, compare against source, move slider, download output.
15. Check local assets and download selected/all local assets.
16. Move canvas to trash, restore it, then create a disposable canvas and test guarded purge only on that disposable canvas.

Real Gallery -> Canvas acceptance:
1. Open /app/gallery.
2. Select a real asset.
3. Send/intake it to Canvas.
4. Confirm Canvas asks for a target when no target is selected.
5. Choose or create a target canvas.
6. Confirm the asset appears as a native image node and save/reload preserves it.

Screenshots:
Capture fresh screenshots only for meaningful real acceptance states:
- docs/quiet-creative-os/screenshots/real-qa-canvas-desktop-light.png
- docs/quiet-creative-os/screenshots/real-qa-canvas-desktop-dark.png
- docs/quiet-creative-os/screenshots/real-qa-canvas-mobile-light.png
- docs/quiet-creative-os/screenshots/real-qa-canvas-output-compare.png
- docs/quiet-creative-os/screenshots/real-qa-provider-status.png

Final report format:
1. Findings first, ordered P0/P1/P2/P3 with file/line references where code changes were needed.
2. Real acceptance checklist with PASS/FAIL/SKIPPED and exact reason for every skipped item.
3. Commands run and results.
4. Browser/visual QA notes and screenshot paths.
5. Files changed, if any.
6. Residual risks.
7. Verdict:
   - PASS if real local acceptance is usable and no blocking issues remain.
   - FAIL if implemented but blocking issues remain.
   - BLOCKED only if missing credentials, unavailable local ComfyUI, or another external dependency prevents meaningful verification.
```
