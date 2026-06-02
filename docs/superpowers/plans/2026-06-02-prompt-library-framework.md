# Prompt Library Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared prompt-library framework for details, view switching, favorites, and user-installed GitHub prompt libraries across Smart Canvas and classic Canvas.

**Architecture:** The backend owns persistent prompt library metadata, favorites, and GitHub remote-library parsing. Both canvases continue to load `/api/prompt-libraries`, render the same item fields, and use shared endpoint shapes for favorite toggles and remote-library sync. The UI keeps system templates as a list by default and visual GitHub libraries as cards by default, while allowing users to switch either library between list and card views.

**Tech Stack:** FastAPI/Pydantic backend in `main.py`, plain JavaScript UI in `static/js/smart-canvas.js` and `static/js/canvas.js`, CSS in `static/css/smart-canvas.css` and `static/css/canvas.css`, Python `unittest` coverage.

---

### Task 1: Backend Remote Libraries and Favorites

**Files:**
- Modify: `main.py`
- Modify: `tests/test_gpt_image_prompts.py`

- [ ] Add failing tests for:
  - toggling favorite on any public prompt item and seeing it reflected in `/api/prompt-libraries`;
  - installing a GitHub remote library from mocked markdown into a readonly prompt library;
  - syncing that remote library again through one shared endpoint.
- [ ] Run `python3 -m unittest tests.test_gpt_image_prompts -v` and verify the new tests fail.
- [ ] Implement:
  - root-level `favorites` in prompt library storage;
  - `POST /api/prompt-libraries/favorites`;
  - `POST /api/prompt-libraries/github/install`;
  - `POST /api/prompt-libraries/{library_id}/sync`;
  - parsers for EvoLinkAI case markdown and generic markdown sections with images/code blocks.
- [ ] Re-run `python3 -m unittest tests.test_gpt_image_prompts -v` and verify it passes.

### Task 2: Shared Prompt Card Details and View State

**Files:**
- Modify: `static/js/smart-canvas.js`
- Modify: `static/js/canvas.js`
- Modify: `static/css/smart-canvas.css`
- Modify: `static/css/canvas.css`

- [ ] Add frontend state for per-library view mode and favorite category filtering.
- [ ] Replace inline card `<details>` with a right-side detail panel for visual/card mode.
- [ ] Add heart buttons to cards and detail panels, wired to the favorite endpoint.
- [ ] Add `列表 / 卡片` segmented control beside group management.
- [ ] Add a top `收藏` category that filters favorite items.

### Task 3: Add GitHub Library UI

**Files:**
- Modify: `static/js/smart-canvas.js`
- Modify: `static/js/canvas.js`
- Modify: `static/css/smart-canvas.css`
- Modify: `static/css/canvas.css`

- [ ] Add a compact add-GitHub-library button next to the template library selector.
- [ ] Show a modal/prompt that accepts a GitHub URL and calls `/api/prompt-libraries/github/install`.
- [ ] After install, select the new library and render it like the GPT Image 2 library.
- [ ] Render sync buttons for any readonly remote GitHub library, not just the built-in GPT Image 2 source.

### Task 4: Verification

**Files:**
- Verify: `static/js/smart-canvas.js`
- Verify: `static/js/canvas.js`
- Verify: `tests/test_gpt_image_prompts.py`

- [ ] Run `node --check static/js/smart-canvas.js`.
- [ ] Run `node --check static/js/canvas.js`.
- [ ] Run `python3 -m unittest tests.test_gpt_image_prompts -v`.
- [ ] Use browser automation on `http://localhost:3000/static/smart-canvas.html` to verify cards, right detail, favorite filter, view toggle, and GitHub install shell.
- [ ] Use browser automation on `http://localhost:3000/static/canvas.html` to verify the same shared features appear in classic Canvas.
